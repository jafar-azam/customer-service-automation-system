import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import type { LogLine } from '../test-support.js';
import { buildLoggerOptions, maskEmail, maskPhone } from './logger.js';
import { runWithRequestContext } from './request-context.js';

/** A logger with the real production options, over a capturing stream. */
function logger() {
  const lines: LogLine[] = [];
  const instance = pino(buildLoggerOptions({ level: 'trace' }), {
    write(chunk: string) {
      lines.push(JSON.parse(chunk) as LogLine);
    },
  });
  return { instance, lines };
}

describe('redaction', () => {
  /* A fabricated value with no validity, used as the needle the assertions
     look for. Marked so the repository's own scanner does not flag it. */
  const secret = 'hunter2-is-not-a-good-one'; // secret-scan:allow
  const cases: [string, Record<string, unknown>][] = [
    ['a top-level password', { password: secret }],
    ['a nested password', { body: { password: secret } }],
    ['a two-level nested refresh token', { ctx: { session: { refreshToken: secret } } }],
    ['a three-level nested OTP', { a: { b: { c: { otp: secret } } } }],
    ['a phone number', { user: { phoneNumber: secret } }],
    ['an email address', { user: { email: secret } }],
    ['a TOTP secret', { enrolment: { totpSecret: secret } }],
    ['an authorization header', { req: { headers: { authorization: secret } } }],
    ['a cookie header', { req: { headers: { cookie: secret } } }],
  ];

  it.each(cases)('removes %s', (_name, payload) => {
    const { instance, lines } = logger();
    instance.info(payload, 'test');
    const serialised = JSON.stringify(lines[0]);
    expect(serialised).not.toContain(secret);
    expect(serialised).toContain('[redacted]');
  });

  /* `code` is deliberately *not* redacted: every rejected request logs the API
     error code, and redacting it would blind the error-rate alerts. The OTP it
     could collide with is never written to a log — step 08's tests assert
     that — because the request body is never logged as a whole. */
  it('keeps an error code readable', () => {
    const { instance, lines } = logger();
    instance.info({ code: 'rate_limited' }, 'request rejected');
    expect(lines[0]?.code).toBe('rate_limited');
  });
});

describe('masking helpers', () => {
  it('keeps a phone number correlatable without making it dialable', () => {
    expect(maskPhone('+96170123456')).toBe('+961***456');
  });

  it('refuses to show a short phone number at all', () => {
    expect(maskPhone('12345')).toBe('***');
  });

  it('masks the local part of an email but keeps the domain', () => {
    expect(maskEmail('rania.haddad@example.com')).toBe('r***d@example.com');
  });

  it('masks a two-character local part entirely', () => {
    expect(maskEmail('jo@example.com')).toBe('***@example.com');
  });

  it('does not throw on a value that is not an email', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('request id', () => {
  it('is attached to every line logged inside a request context', () => {
    const { instance, lines } = logger();
    runWithRequestContext({ requestId: 'req-123' }, () => {
      instance.info('inside');
    });
    instance.info('outside');
    expect(lines[0]?.requestId).toBe('req-123');
    expect(lines[1]?.requestId).toBeUndefined();
  });

  it('survives an await, which is why it is AsyncLocalStorage', async () => {
    const { instance, lines } = logger();
    await runWithRequestContext({ requestId: 'req-async' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      instance.info('after await');
    });
    expect(lines[0]?.requestId).toBe('req-async');
  });
});

describe('level labels', () => {
  it('are written as names, not numbers', () => {
    const { instance, lines } = logger();
    instance.warn('careful');
    expect(lines[0]?.level).toBe('warn');
  });
});
