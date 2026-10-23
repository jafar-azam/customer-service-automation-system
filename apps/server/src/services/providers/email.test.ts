import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Notification } from '../../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../../db/test-db.js';
import { capturingLogger, silentLogger } from '../../test-support.js';
import { MockEmailProvider, idempotencyKey } from './email.js';

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

const message = {
  to: 'rania.haddad@example.com',
  kind: 'password_reset' as const,
  templateKey: 'staff.password_reset',
  subject: 'Reset your password',
  preview: 'Use this link…',
  idempotencyKey: 'test:1',
};

describe('the mock email provider', () => {
  it('writes the message to the dev inbox', async () => {
    await new MockEmailProvider(silentLogger()).send(message);

    const stored = await Notification.findOne().lean();
    expect(stored?.channel).toBe('email');
    expect(stored?.status).toBe('sent');
    expect(stored?.preview).toContain('Use this link');
  });

  /* The address already lives on the staff record; a second copy with a longer
     retention is a second place to leak it and to have to delete it. */
  it('masks the recipient rather than storing the address', async () => {
    await new MockEmailProvider(silentLogger()).send(message);

    const stored = await Notification.findOne().lean();
    expect(stored?.recipientMasked).toBe('r***d@example.com');
    expect(JSON.stringify(stored)).not.toContain('rania.haddad@example.com');
  });

  /* A retried job must not produce a second email. */
  it('writes once however many times the same message is sent', async () => {
    const provider = new MockEmailProvider(silentLogger());
    await provider.send(message);
    await provider.send(message);

    expect(await Notification.countDocuments()).toBe(1);
  });

  it('says so quietly when it skips a duplicate', async () => {
    const captured = capturingLogger();
    const provider = new MockEmailProvider(captured.logger);
    await provider.send(message);
    await provider.send(message);

    expect(captured.lines.some((line) => line.msg?.includes('already sent'))).toBe(true);
  });

  /* Anything other than a duplicate is a real failure and must surface. */
  it('does not swallow an unrelated write failure', async () => {
    const provider = new MockEmailProvider(silentLogger());
    await expect(
      provider.send({ ...message, templateKey: '', idempotencyKey: 'test:2' }),
    ).rejects.toThrow();
  });
});

describe('idempotency keys', () => {
  it('are stable for the same inputs', () => {
    expect(idempotencyKey('reset', 'a', 'b')).toBe(idempotencyKey('reset', 'a', 'b'));
  });

  it('differ for different inputs and purposes', () => {
    expect(idempotencyKey('reset', 'a')).not.toBe(idempotencyKey('reset', 'b'));
    expect(idempotencyKey('reset', 'a')).not.toBe(idempotencyKey('reminder', 'a'));
  });

  /* The keys are themselves a collection somebody could read. */
  it('do not contain the value they were derived from', () => {
    expect(idempotencyKey('reset', 'rania.haddad@example.com')).not.toContain('rania');
  });
});
