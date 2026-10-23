#!/usr/bin/env node
/**
 * One-command setup: turns `.env.example` into a working `.env` with freshly
 * generated secrets.
 *
 * This exists because of a conflict between two requirements. The environment
 * validator rejects placeholder secrets and short keys, which is what makes it
 * worth having — but then "clone and run one command" cannot work if the
 * command is `cp .env.example .env`. Generating real values keeps the validator
 * strict and the quick start honest.
 *
 * It never overwrites an existing `.env` unless asked with --force: the file
 * holds the only copy of the database passwords for an existing volume.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Hex is used wherever a value ends up inside a URI, so nothing needs escaping. */
export const hex = (bytes) => randomBytes(bytes).toString('hex');
export const base64 = (bytes) => randomBytes(bytes).toString('base64');

/** RFC 4648 base32 without padding — the alphabet authenticator apps expect. */
export function base32(length) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export function generateSecrets() {
  const mongoAppPassword = hex(24);
  const mongoMigrationPassword = hex(24);
  const redisPassword = hex(24);
  const db = 'csas';
  return {
    ACCESS_TOKEN_SECRET: hex(32),
    REFRESH_TOKEN_SECRET: hex(32),
    PHONE_HASH_PEPPER: hex(32),
    ML_SERVICE_TOKEN: hex(32),
    /* Exactly 32 bytes: AES-256-GCM, checked by the env validator. */
    PHONE_ENCRYPTION_KEY: base64(32),
    MONGODB_ROOT_PASSWORD: hex(24),
    MONGODB_APP_PASSWORD: mongoAppPassword,
    MONGODB_URI: `mongodb://csas_app:${mongoAppPassword}@mongo:27017/${db}?replicaSet=rs0&authSource=${db}`,
    MONGODB_MIGRATION_PASSWORD: mongoMigrationPassword,
    /* Schema work only, and never loaded by the server process. */
    MONGODB_MIGRATION_URI: `mongodb://csas_migrator:${mongoMigrationPassword}@mongo:27017/${db}?replicaSet=rs0&authSource=${db}`,
    REDIS_PASSWORD: redisPassword,
    REDIS_URL: `redis://:${redisPassword}@redis:6379`,
    SEED_ADMIN_EMAIL: 'admin@csas.local',
    SEED_ADMIN_PASSWORD: `Demo-${hex(8)}`,
    DEMO_ADMIN_TOTP_SECRET: base32(32),
  };
}

/**
 * Replaces the value of every `KEY=` line named in `values`, leaving comments,
 * blank lines, ordering and all other variables untouched — so `.env.example`
 * stays the single description of the configuration.
 */
export function renderEnv(exampleText, values) {
  const seen = new Set();
  const lines = exampleText.split('\n').map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!(key in values)) return line;
    seen.add(key);
    return `${key}=${values[key]}`;
  });

  const missing = Object.keys(values).filter((key) => !seen.has(key));
  if (missing.length > 0) {
    /* A secret that setup generates but .env.example does not declare would be
       silently dropped, and the app would fail validation with no clue why. */
    throw new Error(`.env.example is missing these keys: ${missing.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Minimal `.env` reader: enough to validate what was just written.
 *
 * Deliberately does not strip trailing `# comments` from values. Tools disagree
 * about whether those belong to the value, so `.env.example` must not contain
 * any — and the test that runs this output through the validator is what keeps
 * it that way.
 */
export function parseEnvFile(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    result[trimmed.slice(0, index)] = trimmed.slice(index + 1).trim();
  }
  return result;
}

function main() {
  const force = process.argv.includes('--force');
  const examplePath = new URL('../.env.example', import.meta.url);
  const envPath = new URL('../.env', import.meta.url);
  const envFile = fileURLToPath(envPath);

  if (existsSync(envFile) && !force) {
    console.log('setup: .env already exists, leaving it untouched (--force to regenerate)');
    return;
  }

  const rendered = renderEnv(readFileSync(examplePath, 'utf8'), generateSecrets());
  writeFileSync(envFile, rendered, { mode: 0o600 });
  chmodSync(envFile, 0o600);

  const values = parseEnvFile(rendered);
  console.log(
    [
      'setup: wrote .env with generated secrets (mode 600, git-ignored)',
      '',
      '  Demo admin login',
      `    email:    ${values.SEED_ADMIN_EMAIL}`,
      `    password: ${values.SEED_ADMIN_PASSWORD}`,
      '',
      '  The admin TOTP code is shown in the dev inbox while DEMO_MODE=true.',
      '  Regenerating .env with --force invalidates the database passwords for',
      '  any existing volume: run `docker compose down -v` first.',
      '',
    ].join('\n'),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
