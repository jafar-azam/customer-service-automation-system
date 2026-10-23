/**
 * Liveness and readiness.
 *
 * The distinction matters operationally, and getting it backwards is a classic
 * self-inflicted outage:
 *
 *  * **Liveness** (`/api/health`) answers "is this process running?" It touches
 *    no dependency. If it checked MongoDB, a brief database blip would make the
 *    orchestrator kill and restart every healthy server — turning a recoverable
 *    dependency problem into a full outage.
 *
 *  * **Readiness** (`/api/ready`) answers "should traffic come here?" It does
 *    check dependencies, and a failing *critical* one takes the instance out of
 *    rotation without killing it, so it can rejoin when the dependency returns.
 *
 * Criticality is the second idea. MongoDB is critical: without it nothing works.
 * The ML service is not — the assistant has a documented degraded mode (step 18)
 * where it falls back to keyword search and escalation. Reporting "not ready"
 * because an *optional* dependency is down would refuse requests the server can
 * still serve.
 */

export type CheckStatus = 'pass' | 'fail';

export interface CheckResult {
  readonly status: CheckStatus;
  readonly durationMs: number;
  /** Why it failed. Never contains a connection string or credentials. */
  readonly reason?: string;
}

export interface HealthCheck {
  readonly name: string;
  /** A failing critical check means "do not send traffic here". */
  readonly critical: boolean;
  readonly probe: () => Promise<void>;
  readonly timeoutMs?: number;
}

export interface ReadinessReport {
  readonly status: 'ready' | 'not_ready';
  readonly checks: Readonly<Record<string, CheckResult>>;
}

const DEFAULT_TIMEOUT_MS = 2_000;

/**
 * A probe that hangs is the dangerous case: a readiness endpoint that never
 * answers looks identical to a server that is merely slow, and the orchestrator
 * waits for its own timeout instead of acting. Every probe therefore races a
 * timer, and losing the race is a failure like any other.
 */
async function withTimeout(probe: () => Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
    /* Do not hold the event loop open: a pending probe timer must never be the
       reason a graceful shutdown hangs. */
    timer.unref();
  });

  try {
    await Promise.race([probe(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class HealthRegistry {
  readonly #checks = new Map<string, HealthCheck>();

  /** Later steps register their own dependency: Mongo in 05, Redis in 14. */
  register(check: HealthCheck): this {
    this.#checks.set(check.name, check);
    return this;
  }

  names(): readonly string[] {
    return [...this.#checks.keys()];
  }

  async run(): Promise<ReadinessReport> {
    const entries = await Promise.all(
      [...this.#checks.values()].map(async (check) => {
        const started = performance.now();
        try {
          await withTimeout(check.probe, check.timeoutMs ?? DEFAULT_TIMEOUT_MS);
          const result: CheckResult = { status: 'pass', durationMs: elapsed(started) };
          return [check, result] as const;
        } catch (error) {
          const result: CheckResult = {
            status: 'fail',
            durationMs: elapsed(started),
            /* The message only: an error object from a driver can carry the
               connection string, and this response is public. */
            reason: error instanceof Error ? error.message : 'unknown error',
          };
          return [check, result] as const;
        }
      }),
    );

    const checks: Record<string, CheckResult> = {};
    let ready = true;
    for (const [check, result] of entries) {
      checks[check.name] = result;
      if (check.critical && result.status === 'fail') ready = false;
    }

    return { status: ready ? 'ready' : 'not_ready', checks };
  }
}

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}
