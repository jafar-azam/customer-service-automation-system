import { describe, expect, it } from 'vitest';
import { entropy, isPlaceholder, redact, scanText } from './secret-scan.mjs';

/**
 * Fixtures below are fabricated values with the right *shape* and no validity.
 * Every fixture line carries the allow marker so the scanner does not flag its
 * own tests when it runs over the repository.
 */
const fixtures = {
  privateKey: '-----BEGIN RSA PRIVATE KEY-----', // secret-scan:allow
  awsKey: 'AKIAIOSFODNN7EXAMPLE', // secret-scan:allow
  githubToken: 'ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', // secret-scan:allow
  googleKey: 'AIzaSyA0123456789abcdefghijklmnopqrstuv', // secret-scan:allow
  openaiKey: 'sk-proj-0123456789abcdefghijklmnop', // secret-scan:allow
  anthropicKey: 'sk-ant-api03-0123456789abcdefghijklmnop', // secret-scan:allow
  twilioSid: 'AC0123456789abcdef0123456789abcdef', // secret-scan:allow
  metaToken: 'EAAGm0PX4ZCpsBA0123456789abcdefghijklmnopqrstuvwxyz', // secret-scan:allow
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36', // secret-scan:allow
  mongoUri: 'mongodb://csas_app:s3cr3t-p4ssw0rd@mongo:27017/csas', // secret-scan:allow
  assigned: 'const ACCESS_TOKEN_SECRET = "Hq8vK2mZ9pX4tL7wR1yB3nC6"', // secret-scan:allow
  assignedEnv: 'ACCESS_TOKEN_SECRET=Hq8vK2mZ9pX4tL7wR1yB3nC6', // secret-scan:allow
};

/* Kept out of `fixtures`, which is iterated by the rule-coverage suite: a bare
   value with no assignment around it is correctly not a finding on its own. */
const SECRET_SHAPED_VALUE = 'Hq8vK2mZ9pX4tL7wR1yB3nC6'; // secret-scan:allow

describe('rule coverage', () => {
  for (const [name, text] of Object.entries(fixtures)) {
    it(`detects ${name}`, () => {
      const findings = scanText(text);
      expect(findings.length, `expected a finding in: ${name}`).toBeGreaterThan(0);
    });
  }
});

describe('the allow marker', () => {
  it('suppresses a line that carries it', () => {
    expect(scanText(`${fixtures.awsKey} secret-scan:allow`)).toHaveLength(0);
  });

  it('suppresses only the marked line', () => {
    const text = [`${fixtures.awsKey} secret-scan:allow`, fixtures.githubToken].join('\n');
    const findings = scanText(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
  });
});

describe('placeholders are not secrets', () => {
  const placeholders = [
    'ACCESS_TOKEN_SECRET=change-me-generate-with-openssl-rand-hex-32',
    'MONGODB_URI=mongodb://csas_app:change-me@mongo:27017/csas',
    'PHONE_ENCRYPTION_KEY="replace-me-with-32-bytes-base64"',
    'api_key: "<your-api-key-here>"',
    'password = "aaaaaaaaaaaaaaaaaa"',
  ];

  for (const line of placeholders) {
    it(`ignores ${line.split('=')[0] ?? line}`, () => {
      expect(scanText(line)).toHaveLength(0);
    });
  }

  it('still flags a weak but real-looking hardcoded password', () => {
    expect(scanText('password = "Tr0ub4dor&3xyz"')).not.toHaveLength(0); // secret-scan:allow
  });
});

describe('variable references are not secrets', () => {
  it.each([
    'mongodb://csas_app:${MONGODB_APP_PASSWORD}@mongo:27017/csas',
    'REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379',
    'password = `Demo-${hex(8)}`',
    'api_key: "$OPENAI_API_KEY"',
    'token = "%GITHUB_TOKEN%"',
  ])('ignores %s', (line) => {
    expect(scanText(line)).toHaveLength(0);
  });

  it('still flags a literal sitting next to an interpolation', () => {
    const line = 'mongodb://${USER}:aB3dE7gH9jK2mN5pQ8rS@mongo:27017/csas'; // secret-scan:allow
    expect(scanText(line)).not.toHaveLength(0);
  });
});

describe('reporting', () => {
  it('redacts the middle of a value and never prints it whole', () => {
    const value = 'Hq8vK2mZ9pX4tL7wR1yB3nC6';
    const preview = redact(value);
    expect(preview).not.toContain(value);
    expect(preview.startsWith('Hq8v')).toBe(true);
    expect(preview.endsWith('3nC6')).toBe(true);
    expect(preview).toContain('*');
  });

  it('redacts short values completely', () => {
    expect(redact('abc123')).toBe('******');
  });

  it('reports the 1-based line number', () => {
    const findings = scanText(['clean', 'clean', fixtures.googleKey].join('\n'));
    expect(findings[0]?.line).toBe(3);
  });
});

describe('helpers', () => {
  it('scores entropy higher for random strings than for words', () => {
    expect(entropy('Hq8vK2mZ9pX4tL7wR1yB3nC6')).toBeGreaterThan(entropy('passwordpassword'));
  });

  it('treats angle-bracketed and single-character values as placeholders', () => {
    expect(isPlaceholder('<token>')).toBe(true);
    expect(isPlaceholder('xxxxxxxxxxxxxxxx')).toBe(true);
    expect(isPlaceholder('Hq8vK2mZ9pX4tL7wR1yB3nC6')).toBe(false);
  });

  it('finds nothing in ordinary source', () => {
    const source = [
      'export function add(a: number, b: number) {',
      '  return a + b;',
      '}',
      'const url = "https://example.com/api/tickets";',
    ].join('\n');
    expect(scanText(source)).toHaveLength(0);
  });
});

describe('a call expression is not a secret', () => {
  /* `context_token = request_id_var.set(request_id)` tripped the broad
     assignment rule purely because the variable name ends in "token". A
     credential is a literal or an environment lookup, never an inline call. */
  it('ignores an assignment whose value is a function call', () => {
    expect(scanText('context_token = request_id_var.set(request_id)')).toHaveLength(0);
  });

  it('ignores a call with a dotted receiver', () => {
    expect(scanText('session_token = self.client.issue_token(user_id, scope)')).toHaveLength(0);
  });

  it('still flags a literal assigned to the same name', () => {
    expect(scanText(`session_token = "${SECRET_SHAPED_VALUE}"`).length).toBeGreaterThan(0);
  });

  it('still flags a provider-issued credential inside a call', () => {
    expect(scanText('login(AKIAIOSFODNN7EXAMPLE)').length).toBeGreaterThan(0); // secret-scan:allow
  });
});
