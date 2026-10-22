import { describe, expect, it } from 'vitest';
import { createEnv } from '@csas/shared';
import { readFileSync } from 'node:fs';
import { base32, generateSecrets, parseEnvFile, renderEnv } from './setup.mjs';

const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

describe('generated environment', () => {
  /**
   * The point of the whole script: what `npm run setup` writes must satisfy the
   * validator that refuses to let the server boot. If this test fails, the
   * quick start is broken on a fresh clone.
   */
  it('passes the server environment validator', () => {
    const rendered = renderEnv(example, generateSecrets());
    expect(() => createEnv(parseEnvFile(rendered))).not.toThrow();
  });

  it('passes it in production mode too, once NODE_ENV and the URL are changed', () => {
    const rendered = renderEnv(example, generateSecrets());
    const values = {
      ...parseEnvFile(rendered),
      NODE_ENV: 'production',
      DEMO_MODE: 'false',
      APP_BASE_URL: 'https://support.example-company.test',
      CORS_ORIGINS: 'https://support.example-company.test',
    };
    expect(() => createEnv(values)).not.toThrow();
  });

  it('leaves no placeholder in any generated secret', () => {
    const values = parseEnvFile(renderEnv(example, generateSecrets()));
    for (const key of [
      'ACCESS_TOKEN_SECRET',
      'REFRESH_TOKEN_SECRET',
      'PHONE_HASH_PEPPER',
      'PHONE_ENCRYPTION_KEY',
      'ML_SERVICE_TOKEN',
      'MONGODB_URI',
      'REDIS_URL',
    ]) {
      expect(values[key], key).not.toMatch(/change-me/);
    }
  });

  it('gives every secret a distinct value', () => {
    const secrets = generateSecrets();
    const tokens = [
      secrets.ACCESS_TOKEN_SECRET,
      secrets.REFRESH_TOKEN_SECRET,
      secrets.PHONE_HASH_PEPPER,
      secrets.ML_SERVICE_TOKEN,
      secrets.MONGODB_ROOT_PASSWORD,
      secrets.MONGODB_APP_PASSWORD,
      secrets.REDIS_PASSWORD,
    ];
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('threads the same password into the URI and the standalone variable', () => {
    const secrets = generateSecrets();
    expect(secrets.MONGODB_URI).toContain(secrets.MONGODB_APP_PASSWORD);
    expect(secrets.REDIS_URL).toContain(secrets.REDIS_PASSWORD);
  });
});

describe('renderEnv', () => {
  it('preserves comments, blank lines and variables it does not own', () => {
    const text = ['# a comment', '', 'KEEP_ME=original', 'ACCESS_TOKEN_SECRET=change-me'].join(
      '\n',
    );
    const out = renderEnv(text, { ACCESS_TOKEN_SECRET: 'generated' });
    expect(out.split('\n')).toEqual([
      '# a comment',
      '',
      'KEEP_ME=original',
      'ACCESS_TOKEN_SECRET=generated',
    ]);
  });

  it('fails loudly if .env.example does not declare a generated key', () => {
    expect(() => renderEnv('OTHER=1', { MISSING_KEY: 'x' })).toThrow(/missing these keys/);
  });

  it('does not touch a commented-out assignment', () => {
    const out = renderEnv('# ACCESS_TOKEN_SECRET=change-me\nACCESS_TOKEN_SECRET=change-me', {
      ACCESS_TOKEN_SECRET: 'generated',
    });
    expect(out).toContain('# ACCESS_TOKEN_SECRET=change-me');
  });
});

describe('parseEnvFile', () => {
  it('ignores comments and blanks, and keeps "=" inside values', () => {
    const parsed = parseEnvFile(['# note', '', 'A=1', 'B=a=b', 'C='].join('\n'));
    expect(parsed).toEqual({ A: '1', B: 'a=b', C: '' });
  });
});

describe('base32', () => {
  it('produces the requested length from the authenticator alphabet', () => {
    expect(base32(32)).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('does not repeat itself', () => {
    expect(base32(32)).not.toBe(base32(32));
  });
});
