import type { HealthCheck } from './health.js';

/**
 * Readiness probes for the services this server depends on.
 *
 * Only the ML service exists at step 03. MongoDB (critical) is registered in
 * step 05 and Redis (critical) in step 14, each next to the client that owns
 * the connection — a probe that opens its own connection tests a connection
 * nobody uses, and would report healthy while the pool the application actually
 * holds is broken.
 */

const ML_TIMEOUT_MS = 2_000;

/**
 * Non-critical: the assistant has a documented degraded mode without it.
 *
 * It calls the ML service's unauthenticated `/health`, so readiness never
 * depends on the service token being correct — a token problem is a
 * configuration error that belongs in startup validation, not an endpoint that
 * flaps between ready and not-ready.
 */
export function createMlHealthCheck(baseUrl: string): HealthCheck {
  return {
    name: 'ml',
    critical: false,
    timeoutMs: ML_TIMEOUT_MS,
    probe: async () => {
      const response = await fetch(new URL('/health', baseUrl), {
        signal: AbortSignal.timeout(ML_TIMEOUT_MS),
      });
      if (!response.ok) {
        /* Status only. The URL would put an internal hostname into a public
           readiness response. */
        throw new Error(`ml service answered ${String(response.status)}`);
      }
    },
  };
}
