import { z } from 'zod';

/**
 * Environment validation.
 *
 * Two rules drive the design:
 *
 *  1. **Fail fast, and fail with everything.** A process that boots with a
 *     missing secret is worse than one that refuses to boot, and a process that
 *     reports one problem at a time wastes an afternoon. `createEnv` collects
 *     every issue and throws once.
 *
 *  2. **Never echo a value.** Error messages name the variable and say what was
 *     wrong with it. They never contain the value, because the first place a
 *     startup error goes is a log file, and after that a bug report.
 */

const SECRET_MIN_LENGTH = 32;

/**
 * Shapes used by the placeholders in `.env.example`. Allowed while developing —
 * `npm run setup` replaces them with generated values — and rejected outright
 * in production, where a placeholder secret is an open door.
 */
const PLACEHOLDER = /change-?me|replace-?me|placeholder|your-|example\.com|insert-/i;

export function looksLikePlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value);
}

const nodeEnv = z.enum(['development', 'test', 'production']);
const logLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);
const boolish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .describe('true | false');

const port = z.coerce.number().int().min(1).max(65_535);

const secret = z
  .string()
  .min(SECRET_MIN_LENGTH, `must be at least ${String(SECRET_MIN_LENGTH)} characters`);

/**
 * Providers with a real alternative in this release list it; providers whose
 * only implementation is the mock accept nothing else, so configuration cannot
 * point the application at something that does not exist. The deferred real
 * implementations are tracked in docs/roadmap/PRODUCTION.md.
 */
const providers = {
  llm: z.enum(['mock', 'ollama']).default('mock'),
  embeddings: z.enum(['mock', 'local']).default('mock'),
  stt: z.enum(['mock', 'whisper']).default('mock'),
  tts: z.enum(['mock', 'piper']).default('mock'),
  messaging: z.enum(['mock']).default('mock'),
  email: z.enum(['mock']).default('mock'),
  fileScan: z.enum(['mock', 'clamav']).default('mock'),
  storage: z.enum(['local']).default('local'),
};

export const envSchema = z.object({
  NODE_ENV: nodeEnv.default('development'),
  PORT: port.default(4000),
  LOG_LEVEL: logLevel.default('info'),
  /* Human-readable logs for a terminal. Off by default and never on in a
     container: the log shipper wants one JSON object per line, and pino-pretty
     is a dev dependency that production does not install. */
  LOG_PRETTY: boolish.default(false),
  /* SLA timers, business hours and Lebanese public holidays are all computed in
     this zone, so it is configuration rather than a hard-coded constant — but it
     defaults to the one the product is designed around. */
  TZ: z.string().min(1).default('Asia/Beirut'),
  APP_BASE_URL: z.url(),
  CORS_ORIGINS: z.string().min(1),

  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// connection string'),
  /* Schema work only — the seed and future migrations. The server process never
     uses it, so the running application cannot alter a validator or drop an
     index even if it is compromised. Optional: when it is unset the seed falls
     back to MONGODB_URI, which is what the in-memory test database and a
     single-user local setup need. */
  MONGODB_MIGRATION_URI: z
    .union([
      /* Empty means "not available to this process". The server container sets
         it to an empty string deliberately: the running application must not
         hold a credential that can alter the schema, and silence is clearer
         than hoping nobody passes it. */
      z.literal(''),
      z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// connection string'),
    ])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// connection string'),

  ACCESS_TOKEN_SECRET: secret,
  REFRESH_TOKEN_SECRET: secret,
  PHONE_ENCRYPTION_KEY: z.string().min(1),
  PHONE_HASH_PEPPER: secret,

  SEED_ADMIN_EMAIL: z.email(),
  SEED_ADMIN_PASSWORD: z.string().min(12, 'must be at least 12 characters'),

  DEMO_MODE: boolish.default(false),
  DEMO_ADMIN_TOTP_SECRET: z
    .string()
    .regex(/^[A-Z2-7]{16,}$/, 'must be at least 16 base32 characters (A-Z, 2-7)')
    .optional(),

  LLM_PROVIDER: providers.llm,
  EMBEDDINGS_PROVIDER: providers.embeddings,
  STT_PROVIDER: providers.stt,
  TTS_PROVIDER: providers.tts,
  MESSAGING_PROVIDER: providers.messaging,
  EMAIL_PROVIDER: providers.email,
  FILE_SCAN_PROVIDER: providers.fileScan,
  STORAGE_PROVIDER: providers.storage,

  OLLAMA_BASE_URL: z.url().default('http://ollama:11434'),
  OLLAMA_MODEL: z.string().min(1).default('qwen3:4b'),
  ML_SERVICE_URL: z.url().default('http://ml:8000'),
  ML_SERVICE_TOKEN: secret,
  CLAMAV_HOST: z.string().min(1).default('clamav'),
  CLAMAV_PORT: port.default(3310),
  STORAGE_ROOT: z.string().min(1).default('/var/lib/csas/storage'),

  /**
   * How long after closing a customer may reopen a conversation.
   *
   * Configurable because the right answer is a business decision, not a
   * technical one — a company with monthly billing cycles wants a different
   * number from one doing same-day repairs. Zero disables reopening entirely.
   *
   * Reopening a *closed* ticket creates a new one linked to it rather than
   * resurrecting the old record: see step 11's state machine, where `closed`
   * is terminal so an auto-close job and a customer cannot fight over one
   * document indefinitely.
   */
  /**
   * Whether the assistant answers at all.
   *
   * Off is a legitimate configuration, not a failure mode: a company that has
   * not yet approved any knowledge-base content wants every ticket going
   * straight to a person rather than an assistant that can only escalate.
   */
  ASSISTANT_ENABLED: z.stringbool().default(true),

  TICKET_REOPEN_WINDOW_DAYS: z.coerce.number().int().min(0).max(365).default(14),

  /* Where the seed importers read from. Both are git-ignored paths: the
     TechQA corpus is 12 GB and fetched by the contributor, and the senior-data
     CSV is real business data that may never be committed. Paths rather than
     constants so a contributor can keep the corpus anywhere. */
  TECHQA_PATH: z.string().min(1).default('data/external/techqa'),
  SENIORDATA_PATH: z.string().min(1).default('reference/data/seniordata.csv'),

  ERROR_TRACKING_DSN: z.string().default(''),
  METRICS_ENABLED: boolish.default(true),
});

type ParsedEnv = z.infer<typeof envSchema>;

/** The validated environment, with the derived fields the app actually uses. */
export interface Env extends ParsedEnv {
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly corsOrigins: readonly string[];
  readonly errorTrackingEnabled: boolean;
}

export class EnvValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      [
        `Invalid environment: ${String(issues.length)} problem(s).`,
        ...issues.map((i) => `  - ${i}`),
        '',
        'Values are never printed. Run `npm run setup` to generate a valid .env,',
        'or see .env.example for what each variable means.',
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * True when `value` is base64 that decodes to exactly 32 bytes — the key size
 * AES-256-GCM requires.
 *
 * Checked by shape rather than by decoding, because this package is also
 * imported by the browser client and must not depend on `Buffer`. 32 bytes
 * encode as 43 base64 characters plus one `=` of padding.
 */
export function isBase64Key32Bytes(value: string): boolean {
  return /^[A-Za-z0-9+/]{43}=$/.test(value);
}

/**
 * Checks that span more than one variable, or that only matter in production.
 * Kept out of the schema so each one can be read, tested and explained alone.
 */
function crossFieldIssues(env: ParsedEnv): string[] {
  const issues: string[] = [];
  const production = env.NODE_ENV === 'production';

  const origins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0) issues.push('CORS_ORIGINS: must list at least one origin');
  if (origins.includes('*')) {
    /* A wildcard origin plus credentialed requests is how a session gets handed
       to any site that asks. The browser blocks the combination; refusing it
       here means we never ship a config that depends on that mercy. */
    issues.push('CORS_ORIGINS: "*" is not allowed — list explicit origins');
  }
  for (const origin of origins) {
    if (!/^https?:\/\/[^/]+$/.test(origin)) {
      issues.push(`CORS_ORIGINS: "${origin}" must be scheme://host[:port] with no trailing path`);
    }
  }

  if (env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET) {
    /* Reusing one secret means a stolen access token can be replayed as a
       refresh token, which defeats rotation and reuse detection entirely. */
    issues.push('REFRESH_TOKEN_SECRET: must differ from ACCESS_TOKEN_SECRET');
  }

  if (production && !isBase64Key32Bytes(env.PHONE_ENCRYPTION_KEY)) {
    issues.push('PHONE_ENCRYPTION_KEY: must be exactly 32 bytes, base64-encoded (AES-256-GCM)');
  }

  if (env.DEMO_MODE) {
    if (production) {
      /* The one flag that must never be on in production: it seeds known
         credentials and a fixed TOTP secret. */
      issues.push('DEMO_MODE: must be false when NODE_ENV=production');
    }
    if (env.DEMO_ADMIN_TOTP_SECRET === undefined) {
      issues.push('DEMO_ADMIN_TOTP_SECRET: required when DEMO_MODE=true');
    }
  }

  if (production) {
    const mustNotBePlaceholders = [
      'ACCESS_TOKEN_SECRET',
      'REFRESH_TOKEN_SECRET',
      'PHONE_HASH_PEPPER',
      'PHONE_ENCRYPTION_KEY',
      'ML_SERVICE_TOKEN',
      'SEED_ADMIN_PASSWORD',
      'SEED_ADMIN_EMAIL',
      'MONGODB_URI',
    ] as const;
    for (const key of mustNotBePlaceholders) {
      if (looksLikePlaceholder(env[key])) {
        issues.push(`${key}: still set to an example placeholder`);
      }
    }
    if (env.APP_BASE_URL.startsWith('http://')) {
      issues.push('APP_BASE_URL: must use https in production');
    }
  }

  return issues;
}

/**
 * Validates a raw environment and returns the typed result.
 *
 * Pure by design: it takes the record rather than reading `process.env`, so the
 * rules above are testable without mutating global state.
 *
 * @throws {EnvValidationError} with every problem found, and no values.
 */
export function createEnv(raw: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      return `${key}: ${issue.message}`;
    });
    throw new EnvValidationError(issues);
  }

  const issues = crossFieldIssues(parsed.data);
  if (issues.length > 0) throw new EnvValidationError(issues);

  const env = parsed.data;
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    corsOrigins: Object.freeze(
      env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
    errorTrackingEnabled: env.ERROR_TRACKING_DSN.length > 0,
  };
}
