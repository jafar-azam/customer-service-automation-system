import { pino, type Logger, type LoggerOptions } from 'pino';
import type { Env } from '@csas/shared';
import { getRequestContext } from './request-context.js';

/**
 * Structured logging.
 *
 * Three decisions worth defending:
 *
 *  1. **JSON on stdout, always.** The container runtime collects stdout; a log
 *     shipper parses JSON. Pretty-printing is opt-in for a human reading a
 *     terminal (`LOG_PRETTY=true`) and is a dev dependency, so production never
 *     loads it.
 *
 *  2. **Redaction is a list of paths, not a regular expression over the
 *     message.** Scanning text for anything phone-shaped is slow, and it fails
 *     in both directions — it misses `+961 3 123 456` written with spaces and
 *     it mangles an order number. Instead the fields that carry personal data
 *     have known names, those names are redacted wherever they appear, and
 *     anything genuinely free-form (a customer's message, a ticket body) is
 *     *never logged at all*. `maskPhone` and `maskEmail` exist for the few
 *     places where a partial value genuinely helps.
 *
 *  3. **The request id is picked up from async context**, not passed down
 *     through every function signature. A service three layers deep logs with
 *     `logger.info()` and the line still carries the id that ties it to the
 *     request and to the error the customer was shown.
 */

/**
 * Field names that must never reach a log file, at any depth.
 *
 * pino's redaction paths are literal, so each name is listed at the depths it
 * can realistically appear. The wildcard `*` covers one level, which is why the
 * list repeats itself: `*.password` catches `body.password`, and
 * `*.*.password` catches `body.user.password`.
 *
 * One name is deliberately absent. `code` collides with the API error code that
 * every rejected request logs; redacting it would blind the error-rate alerts
 * in order to protect an OTP that is never written to a log in the first place
 * (request bodies are not logged as a whole, and step 08 tests that the code
 * itself never is). Redaction is for values that are dangerous *in a log file*,
 * not for everything personal — what is personal and free-form, such as a
 * customer's message, is simply never logged.
 *
 * When a masked value *is* wanted in a line, log it under `phoneMasked` or
 * `emailMasked` via the helpers below, so the redaction list does not swallow
 * the very thing it was safe to write.
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwordConfirmation',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'otp',
  'recoveryCode',
  'recoveryCodes',
  'totpSecret',
  'secret',
  'phone',
  'phoneNumber',
  'email',
  'address',
  'authorization',
  'cookie',
] as const;

function redactionPaths(): string[] {
  const paths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    'err.config.headers.authorization',
  ];
  for (const field of SENSITIVE_FIELDS) {
    paths.push(field, `*.${field}`, `*.*.${field}`, `*.*.*.${field}`);
  }
  return paths;
}

/** `+9613123456` → `+961***456`. Enough to correlate, not enough to dial. */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 7) return '***';
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-3)}`;
}

/** `rania.haddad@example.com` → `r***d@example.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `***${domain}`;
  return `${local[0] ?? ''}***${local[local.length - 1] ?? ''}${domain}`;
}

export interface LoggerOptionsInput {
  readonly level: Env['LOG_LEVEL'];
  readonly pretty?: boolean;
  readonly name?: string;
}

export function buildLoggerOptions({
  level,
  pretty = false,
  name = 'csas-server',
}: LoggerOptionsInput): LoggerOptions {
  return {
    name,
    level,
    redact: { paths: redactionPaths(), censor: '[redacted]' },
    /* Every line carries the current request id, so a log search by id returns
       the whole story of one request without any call site opting in. */
    mixin: () => {
      const context = getRequestContext();
      return context ? { requestId: context.requestId } : {};
    },
    formatters: {
      /* `level: "info"` reads better in a log viewer than `level: 30`. */
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
          },
        }
      : {}),
  };
}

export function createLogger(options: LoggerOptionsInput): Logger {
  return pino(buildLoggerOptions(options));
}

export type { Logger };
