import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvValidationError, getEnv, resetEnvCache } from './env.js';

const valid: Record<string, string> = {
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
};

afterEach(() => {
  resetEnvCache();
  vi.unstubAllEnvs();
});

function stub(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

describe('getEnv', () => {
  it('validates the process environment', () => {
    stub(valid);
    expect(getEnv().NODE_ENV).toBe('test');
  });

  it('validates once and caches the result', () => {
    stub(valid);
    expect(getEnv()).toBe(getEnv());
  });

  it('re-reads the environment after the cache is reset', () => {
    stub(valid);
    expect(getEnv().PORT).toBe(4000);
    resetEnvCache();
    stub({ ...valid, PORT: '4100' });
    expect(getEnv().PORT).toBe(4100);
  });

  it('throws EnvValidationError when a secret is missing', () => {
    stub({ ...valid, ACCESS_TOKEN_SECRET: undefined });
    expect(() => getEnv()).toThrow(EnvValidationError);
  });
});
