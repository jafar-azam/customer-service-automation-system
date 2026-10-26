import { pino, type Logger } from 'pino';
import { createEnv, type Env } from '@csas/shared';

/**
 * Shared test fixtures.
 *
 * The environment is built through the real validator rather than cast from an
 * object literal: if a later step adds a required variable, every test that
 * builds an app fails immediately and loudly, instead of running against an
 * `Env` that could never exist in production.
 */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return createEnv({
    NODE_ENV: 'test',
    APP_BASE_URL: 'http://localhost:8080',
    CORS_ORIGINS: 'http://localhost:8080',
    MONGODB_URI: 'mongodb://localhost:27017/csas-test',
    REDIS_URL: 'redis://localhost:6379',
    ACCESS_TOKEN_SECRET: 'a'.repeat(32),
    REFRESH_TOKEN_SECRET: 'b'.repeat(32),
    PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    PHONE_HASH_PEPPER: 'c'.repeat(32),
    SEED_ADMIN_EMAIL: 'admin@csas.test',
    SEED_ADMIN_PASSWORD: 'correct-horse-battery', // secret-scan:allow
    ML_SERVICE_TOKEN: 'd'.repeat(32),
    ...overrides,
  });
}

/** A logger that writes nowhere, so test output stays readable. */
export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}

/**
 * One captured log line. The fields the tests assert on are declared so they
 * can be read as properties under `noPropertyAccessFromIndexSignature`; the
 * index signature carries everything else pino writes.
 */
export interface LogLine {
  msg?: string;
  level?: string;
  requestId?: string;
  method?: string;
  route?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  code?: string;
  [key: string]: unknown;
}

export interface CapturedLogger {
  readonly logger: Logger;
  readonly lines: LogLine[];
}

/**
 * A logger that collects what it writes, so a test can assert that a value was
 * redacted rather than trusting that the configuration says so.
 */
export function capturingLogger(level = 'trace'): CapturedLogger {
  const lines: LogLine[] = [];
  const logger = pino(
    { level },
    {
      write(chunk: string) {
        lines.push(JSON.parse(chunk) as LogLine);
      },
    },
  );
  return { logger, lines };
}

/**
 * The one-time code that was sent to a particular number.
 *
 * Filtered **by recipient**, which every copy of this helper used to skip — the
 * eight test files that needed it each read "the newest OTP notification" and
 * assumed it was theirs. `createdAt` is millisecond-resolution, so two sign-ins
 * landing in the same millisecond made the sort a coin flip, and the second
 * customer could read the first customer's code, fail verification, and run the
 * rest of the test unauthenticated.
 *
 * That surfaced as two of the cross-customer authorization tests failing once
 * every few full-suite runs — the worst possible place for a flake, because the
 * honest reading of a red security test is that isolation broke, and the
 * trained response to a flaky one is to run it again.
 *
 * `_id` breaks the remaining tie: ObjectIds are monotonic within a process, so
 * the newest row wins even when the timestamps are identical.
 */
export async function otpCodeFor(e164: string): Promise<string> {
  /* Imported here rather than taken as a parameter: typing a Mongoose model
     structurally means restating an overloaded signature, and this module is
     test-only, so the direct dependency costs nothing. */
  const { Notification } = await import('./db/models/index.js');

  const masked = `${e164.slice(0, 4)}***${e164.slice(-3)}`;
  const row = await Notification.findOne({ kind: 'otp', recipientMasked: masked })
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  const code = /\b(\d{6})\b/.exec(row?.preview ?? '')?.[1];
  if (code === undefined) {
    throw new Error(`no one-time code was sent to ${masked}`);
  }
  return code;
}
