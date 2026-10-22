import { describe, expect, it } from 'vitest';
import { EnvValidationError, createEnv, isBase64Key32Bytes, looksLikePlaceholder } from './env.js';

/** 43 base64 characters plus padding = exactly 32 decoded bytes. */
const KEY_32B = `${'A'.repeat(43)}=`;

/**
 * A development-shaped environment that validates. Individual tests override
 * one key at a time, so each assertion is about exactly one rule.
 */
const base: Record<string, string> = {
  NODE_ENV: 'development',
  PORT: '4000',
  APP_BASE_URL: 'http://localhost:8080',
  CORS_ORIGINS: 'http://localhost:8080,http://localhost:5173',
  MONGODB_URI: 'mongodb://csas_app:pw@mongo:27017/csas?replicaSet=rs0',
  REDIS_URL: 'redis://redis:6379',
  ACCESS_TOKEN_SECRET: 'a'.repeat(16) + 'b'.repeat(16),
  REFRESH_TOKEN_SECRET: 'c'.repeat(16) + 'd'.repeat(16),
  PHONE_ENCRYPTION_KEY: KEY_32B,
  PHONE_HASH_PEPPER: 'e'.repeat(32),
  SEED_ADMIN_EMAIL: 'admin@csas.test',
  SEED_ADMIN_PASSWORD: 'correct-horse-battery', // secret-scan:allow
  ML_SERVICE_TOKEN: 'f'.repeat(32),
};

const production = (over: Record<string, string> = {}) => ({
  ...base,
  NODE_ENV: 'production',
  APP_BASE_URL: 'https://support.csas.test',
  CORS_ORIGINS: 'https://support.csas.test',
  DEMO_MODE: 'false',
  ...over,
});

function issuesOf(raw: Record<string, string | undefined>): string[] {
  try {
    createEnv(raw);
    return [];
  } catch (error) {
    if (error instanceof EnvValidationError) return [...error.issues];
    throw error;
  }
}

describe('a valid environment', () => {
  it('parses and applies defaults', () => {
    const env = createEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.TZ).toBe('Asia/Beirut');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.METRICS_ENABLED).toBe(true);
  });

  it('defaults every provider to its mock', () => {
    const env = createEnv(base);
    expect(env.LLM_PROVIDER).toBe('mock');
    expect(env.EMBEDDINGS_PROVIDER).toBe('mock');
    expect(env.STT_PROVIDER).toBe('mock');
    expect(env.TTS_PROVIDER).toBe('mock');
    expect(env.MESSAGING_PROVIDER).toBe('mock');
    expect(env.EMAIL_PROVIDER).toBe('mock');
    expect(env.FILE_SCAN_PROVIDER).toBe('mock');
    expect(env.STORAGE_PROVIDER).toBe('local');
  });

  it('derives convenience fields', () => {
    const env = createEnv(base);
    expect(env.isProduction).toBe(false);
    expect(env.isTest).toBe(false);
    expect(env.corsOrigins).toEqual(['http://localhost:8080', 'http://localhost:5173']);
    expect(env.errorTrackingEnabled).toBe(false);
  });

  it('enables error tracking only when a DSN is supplied', () => {
    expect(
      createEnv({ ...base, ERROR_TRACKING_DSN: 'https://key@errors.test/1' }).errorTrackingEnabled,
    ).toBe(true);
  });

  it('coerces booleans from the strings an env file can hold', () => {
    expect(createEnv({ ...base, METRICS_ENABLED: 'false' }).METRICS_ENABLED).toBe(false);
    expect(createEnv({ ...base, METRICS_ENABLED: '0' }).METRICS_ENABLED).toBe(false);
    expect(createEnv({ ...base, METRICS_ENABLED: '1' }).METRICS_ENABLED).toBe(true);
  });
});

describe('failure reporting', () => {
  it('reports every problem at once rather than the first', () => {
    const issues = issuesOf({ NODE_ENV: 'development' });
    expect(issues.length).toBeGreaterThan(5);
  });

  it('names the variable in each issue', () => {
    expect(issuesOf({ ...base, ACCESS_TOKEN_SECRET: 'short' })).toContainEqual(
      expect.stringContaining('ACCESS_TOKEN_SECRET'),
    );
  });

  it('never includes the offending value in the message', () => {
    const leaked = 'Hq8vK2mZ9pX4tL7wR1yB3nC6-this-must-not-appear';
    let message = '';
    try {
      createEnv({ ...base, MONGODB_URI: leaked });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(leaked);
    expect(message).toContain('MONGODB_URI');
  });

  it('rejects an unknown NODE_ENV instead of guessing', () => {
    expect(issuesOf({ ...base, NODE_ENV: 'staging' })).toContainEqual(
      expect.stringContaining('NODE_ENV'),
    );
  });
});

describe('secrets', () => {
  it('requires at least 32 characters', () => {
    expect(issuesOf({ ...base, PHONE_HASH_PEPPER: 'f'.repeat(31) })).toContainEqual(
      expect.stringContaining('PHONE_HASH_PEPPER'),
    );
  });

  it('refuses the same value for access and refresh tokens', () => {
    const same = 'g'.repeat(32);
    expect(issuesOf({ ...base, ACCESS_TOKEN_SECRET: same, REFRESH_TOKEN_SECRET: same })).toEqual([
      expect.stringContaining('must differ from ACCESS_TOKEN_SECRET'),
    ]);
  });
});

describe('CORS', () => {
  it('refuses a wildcard origin', () => {
    expect(issuesOf({ ...base, CORS_ORIGINS: '*' })).toContainEqual(
      expect.stringContaining('"*" is not allowed'),
    );
  });

  it('refuses an origin carrying a path', () => {
    expect(issuesOf({ ...base, CORS_ORIGINS: 'http://localhost:8080/app' })).toContainEqual(
      expect.stringContaining('scheme://host'),
    );
  });

  it('accepts a single origin with no trailing comma noise', () => {
    expect(createEnv({ ...base, CORS_ORIGINS: 'http://localhost:8080, ' }).corsOrigins).toEqual([
      'http://localhost:8080',
    ]);
  });
});

describe('demo mode', () => {
  it('requires a TOTP secret when enabled', () => {
    expect(issuesOf({ ...base, DEMO_MODE: 'true' })).toContainEqual(
      expect.stringContaining('DEMO_ADMIN_TOTP_SECRET'),
    );
  });

  it('accepts a base32 TOTP secret', () => {
    const env = createEnv({
      ...base,
      DEMO_MODE: 'true',
      DEMO_ADMIN_TOTP_SECRET: 'CHANGEMEDEMOTOTPSECRET234567',
    });
    expect(env.DEMO_MODE).toBe(true);
  });

  it('rejects a TOTP secret that is not base32', () => {
    expect(
      issuesOf({ ...base, DEMO_MODE: 'true', DEMO_ADMIN_TOTP_SECRET: 'lower-189' }),
    ).toContainEqual(expect.stringContaining('base32'));
  });

  /* The control that matters: this is the flag that seeds known credentials. */
  it('is refused outright in production', () => {
    expect(
      issuesOf(
        production({ DEMO_MODE: 'true', DEMO_ADMIN_TOTP_SECRET: 'CHANGEMEDEMOTOTPSECRET234567' }),
      ),
    ).toContainEqual(expect.stringContaining('must be false when NODE_ENV=production'));
  });
});

describe('production hardening', () => {
  it('accepts a correctly configured production environment', () => {
    expect(issuesOf(production())).toEqual([]);
  });

  it('refuses placeholder secrets left over from .env.example', () => {
    const issues = issuesOf(
      production({ ACCESS_TOKEN_SECRET: 'change-me-generate-with-openssl-rand-hex-32' }),
    );
    expect(issues).toContainEqual(expect.stringContaining('still set to an example placeholder'));
  });

  it('refuses a placeholder admin email', () => {
    expect(issuesOf(production({ SEED_ADMIN_EMAIL: 'admin@example.com' }))).toContainEqual(
      expect.stringContaining('SEED_ADMIN_EMAIL'),
    );
  });

  it('requires https for the public base URL', () => {
    expect(issuesOf(production({ APP_BASE_URL: 'http://support.csas.test' }))).toContainEqual(
      expect.stringContaining('must use https'),
    );
  });

  it('requires a 32-byte phone encryption key', () => {
    expect(issuesOf(production({ PHONE_ENCRYPTION_KEY: `${'A'.repeat(21)}=` }))).toContainEqual(
      expect.stringContaining('32 bytes'),
    );
  });

  it('tolerates placeholders in development, where setup generates real values', () => {
    expect(
      issuesOf({ ...base, ACCESS_TOKEN_SECRET: 'change-me-generate-with-openssl-rand-hex-32' }),
    ).toEqual([]);
  });
});

describe('provider configuration', () => {
  it('allows the free local alternatives that exist in this release', () => {
    const env = createEnv({
      ...base,
      LLM_PROVIDER: 'ollama',
      EMBEDDINGS_PROVIDER: 'local',
      STT_PROVIDER: 'whisper',
      TTS_PROVIDER: 'piper',
      FILE_SCAN_PROVIDER: 'clamav',
    });
    expect(env.LLM_PROVIDER).toBe('ollama');
    expect(env.FILE_SCAN_PROVIDER).toBe('clamav');
  });

  /* Messaging and email have no implementation but the mock in this release, so
     configuration must not be able to select one. */
  it('refuses a messaging provider that is not implemented', () => {
    expect(issuesOf({ ...base, MESSAGING_PROVIDER: 'twilio' })).toContainEqual(
      expect.stringContaining('MESSAGING_PROVIDER'),
    );
  });

  it('refuses an email provider that is not implemented', () => {
    expect(issuesOf({ ...base, EMAIL_PROVIDER: 'ses' })).toContainEqual(
      expect.stringContaining('EMAIL_PROVIDER'),
    );
  });

  it('refuses an unknown LLM provider', () => {
    expect(issuesOf({ ...base, LLM_PROVIDER: 'openai' })).toContainEqual(
      expect.stringContaining('LLM_PROVIDER'),
    );
  });
});

describe('isBase64Key32Bytes', () => {
  it('accepts exactly 32 decoded bytes', () => {
    expect(isBase64Key32Bytes(KEY_32B)).toBe(true);
  });

  it('rejects a shorter key, a longer key and non-base64 text', () => {
    expect(isBase64Key32Bytes(`${'A'.repeat(21)}=`)).toBe(false);
    expect(isBase64Key32Bytes('A'.repeat(64))).toBe(false);
    expect(isBase64Key32Bytes('change-me-32-bytes-base64-openssl-rand')).toBe(false);
  });
});

describe('looksLikePlaceholder', () => {
  it.each([
    'change-me-generate-with-openssl-rand-hex-32',
    'replace-me-with-32-bytes-base64',
    'your-api-key',
    'admin@example.com',
  ])('recognises %s', (value) => {
    expect(looksLikePlaceholder(value)).toBe(true);
  });

  it('does not flag a generated secret', () => {
    expect(looksLikePlaceholder('9f2c1b7a4e8d0c3f6a5b2e9d8c7f1a4b')).toBe(false);
  });
});
