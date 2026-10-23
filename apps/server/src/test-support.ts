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
