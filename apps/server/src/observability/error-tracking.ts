import type { Logger } from 'pino';

/**
 * Error tracking behind an interface, disabled by default.
 *
 * This release ships no SDK. Sending a stack trace to a third party is a data
 * transfer — error payloads routinely carry request bodies, headers and user
 * identifiers — and the scope for this release is "no external services, no
 * accounts". The interface exists so that wiring a self-hosted collector later
 * is a provider swap rather than a refactor, and so the scrubbing that any such
 * integration *must* perform is written and tested now, before there is
 * anything to leak.
 *
 * The roadmap (P7) covers the hosted option.
 */

export interface ErrorEvent {
  readonly error: unknown;
  readonly requestId?: string;
  readonly route?: string;
  readonly method?: string;
  readonly statusCode?: number;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface ErrorTracker {
  readonly enabled: boolean;
  capture(event: ErrorEvent): void;
}

/** Keys scrubbed from `extra` before an event leaves the process. */
const SENSITIVE_KEYS = new Set(
  [
    'password',
    'newpassword',
    'currentpassword',
    'token',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'cookie',
    'otp',
    'code',
    'recoverycode',
    'recoverycodes',
    'totpsecret',
    'secret',
    'phone',
    'phonenumber',
    'email',
    'address',
    'message',
    'transcript',
    'body',
  ].map((key) => key.toLowerCase()),
);

const MAX_DEPTH = 4;

/**
 * Recursively replaces sensitive values with `[redacted]`.
 *
 * `message`, `transcript` and `body` are on the list because in this system
 * they hold what a customer typed or said — the single richest source of
 * personal data the application touches, and never something a crash report
 * needs in order to be actionable.
 */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : scrub(item, depth + 1);
  }
  return output;
}

/**
 * The default. It does not silently drop the event: the error still reaches the
 * log, carrying the request id, which is the whole of this release's error
 * story and is enough to investigate anything the demo can produce.
 */
export class DisabledErrorTracker implements ErrorTracker {
  readonly enabled = false;
  capture(_event: ErrorEvent): void {
    /* Intentionally nothing. The terminal error handler logs every error it
       answers; this would be a duplicate. */
  }
}

/**
 * Used when a DSN is configured but no integration is compiled in — it records
 * what *would* have been sent, scrubbed, so the scrubbing can be inspected in a
 * log before anyone points this at a real collector.
 */
export class LoggingErrorTracker implements ErrorTracker {
  readonly enabled = true;

  constructor(private readonly logger: Logger) {}

  capture(event: ErrorEvent): void {
    this.logger.warn(
      {
        errorTracking: {
          requestId: event.requestId,
          route: event.route,
          method: event.method,
          statusCode: event.statusCode,
          extra: scrub(event.extra),
        },
      },
      'error-tracking event (no collector configured)',
    );
  }
}
