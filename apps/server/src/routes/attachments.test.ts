import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizePhone } from '@csas/shared';
import { createApp } from '../app.js';
import { PhoneCipher } from '../crypto/phone.js';
import { Attachment, Contract, Customer, Notification, StaffUser } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { clearTestRedis, startTestRedis, stopTestRedis } from '../db/test-redis.js';
import { CSRF_COOKIE, REFRESH_COOKIE } from '../http/cookies.js';
import { createMetrics } from '../observability/metrics.js';
import { hashPassword } from '../services/auth/password.js';
import { InMemoryStorage } from '../services/providers/storage.js';
import type { FileScanner, ScanVerdict } from '../services/providers/virus-scan.js';
import { makeJpegWithGps, makePng, makePngWithTrailer } from '../services/attachments/fixtures.js';
import { silentLogger, testEnv } from '../test-support.js';

const env = testEnv({ DEMO_MODE: 'true', DEMO_ADMIN_TOTP_SECRET: 'A'.repeat(32) });
const PASSWORD = 'fourteen purple lanterns upstairs'; // secret-scan:allow

/** A scanner the test drives, so the infected path is reachable on demand. */
class ScriptedScanner implements FileScanner {
  readonly name = 'scripted';
  verdict: ScanVerdict = { status: 'clean' };
  scanned = 0;

  scan(): Promise<ScanVerdict> {
    this.scanned += 1;
    return Promise.resolve(this.verdict);
  }
}

const storage = new InMemoryStorage();
const scanner = new ScriptedScanner();

const app = createApp({
  env,
  version: '0.1.0',
  logger: silentLogger(),
  metrics: createMetrics({ collectDefaults: false }),
  storage,
  scanner,
}).express;

beforeAll(async () => {
  await startTestDatabase();
  await startTestRedis();
}, 180_000);

afterEach(async () => {
  await clearTestDatabase();
  await clearTestRedis();
  /* The store is state like the database is state. Leaving it between cases
     made three "nothing was stored" assertions fail against files the
     previous tests had legitimately stored. */
  storage.clear();
  scanner.verdict = { status: 'clean' };
  scanner.scanned = 0;
});

afterAll(async () => {
  await stopTestRedis();
  await stopTestDatabase();
});

/* ── Fixtures ───────────────────────────────────────────────────────────── */

async function createCustomer(phone: string) {
  const cipher = new PhoneCipher({
    encryptionKey: env.PHONE_ENCRYPTION_KEY,
    hashPepper: env.PHONE_HASH_PEPPER,
  });
  const e164 = normalizePhone(phone);
  const customer = await Customer.create({
    name: 'Demo Person',
    companyName: 'Cedar Pharmaceuticals',
    phoneHash: cipher.hash(e164),
    phoneEncrypted: cipher.encrypt(e164),
    phoneLast3: e164.slice(-3),
    status: 'active',
  });
  const day = 86_400_000;
  await Contract.create({
    customerId: customer._id,
    reference: `CT-${String(Math.random()).slice(2, 10)}`,
    tier: 'standard',
    status: 'active',
    startDate: new Date(Date.now() - 30 * day),
    endDate: new Date(Date.now() + 30 * day),
  });
  return customer;
}

interface Session {
  readonly token: string;
  readonly csrf: string;
  readonly refresh: string;
}

function setCookieHeaders(response: request.Response): string[] {
  const header: unknown = response.headers['set-cookie'];
  if (Array.isArray(header)) return header as string[];
  return typeof header === 'string' ? [header] : [];
}

function cookie(response: request.Response, name: string): string {
  const match = setCookieHeaders(response).find((value) => value.startsWith(`${name}=`));
  return String(match?.split(';')[0]?.split('=')[1]);
}

async function signInCustomer(phone: string): Promise<Session> {
  await request(app).post('/api/auth/customer/request-code').send({ phone });
  const message = await Notification.findOne({ kind: 'otp' }).sort({ createdAt: -1 }).lean();
  const code = String(/\b(\d{6})\b/.exec(String(message?.preview))?.[1]);
  const response = await request(app).post('/api/auth/customer/verify').send({ phone, code });
  return {
    token: (response.body as { accessToken: string }).accessToken,
    csrf: cookie(response, CSRF_COOKIE),
    refresh: cookie(response, REFRESH_COOKIE),
  };
}

async function signInStaff(): Promise<Session> {
  const email = 'agent@csas.test';
  await StaffUser.create({
    email,
    name: 'Agent Person',
    role: 'agent',
    status: 'active',
    passwordHash: await hashPassword(PASSWORD),
  });
  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return {
    token: (response.body as { accessToken: string }).accessToken,
    csrf: cookie(response, CSRF_COOKIE),
    refresh: cookie(response, REFRESH_COOKIE),
  };
}

async function openTicket(session: Session): Promise<string> {
  const response = await request(app)
    .post('/api/customer/tickets')
    .set('authorization', `Bearer ${session.token}`)
    .send({ subject: 'Printer stopped', body: 'el printer 3am ya3mel error' });
  return (response.body as { ticket: { id: string } }).ticket.id;
}

function attach(path: string, session: Session, bytes: Buffer, filename: string) {
  return request(app)
    .post(path)
    .set('authorization', `Bearer ${session.token}`)
    .attach('file', bytes, filename);
}

/* ── Uploading ──────────────────────────────────────────────────────────── */

describe('uploading', () => {
  it('accepts an image and reports it as downloadable', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const ticket = await openTicket(session);

    const response = await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      session,
      await makePng(),
      'screenshot.png',
    );

    expect(response.status).toBe(201);
    const attachment = (response.body as { attachment: Record<string, unknown> }).attachment;
    expect(attachment['mimeType']).toBe('image/png');
    expect(attachment['scanStatus']).toBe('clean');
    expect(attachment['downloadable']).toBe(true);
    expect(storage.size).toBe(1);
  });

  /* The control this step exists for. */
  it('strips GPS from a photograph before storing it', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const ticket = await openTicket(session);

    await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      session,
      await makeJpegWithGps(),
      'photo.jpg',
    );

    const stored = await Attachment.findOne({}).lean();
    const bytes = await storage.get(String(stored?.storageKey));
    expect(bytes.toString('latin1')).not.toContain('GPS');
    expect(bytes.toString('latin1')).not.toContain('C.S.A.S Test');
    /* Re-encoded, so the stored type is the output type, not the input. */
    expect(stored?.detectedMimeType).toBe('image/png');
    expect(stored?.sanitized).toBe(true);
  });

  it('discards a payload appended to an image', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const ticket = await openTicket(session);

    await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      session,
      await makePngWithTrailer('<?php system($_GET[0]); ?>'),
      'ok.png',
    );

    const stored = await Attachment.findOne({}).lean();
    const bytes = await storage.get(String(stored?.storageKey));
    expect(bytes.toString('latin1')).not.toContain('<?php');
  });

  /* The extension and Content-Type both say image; the bytes do not. */
  it('refuses an executable renamed to .png', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const ticket = await openTicket(session);

    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(512)]);
    const response = await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      session,
      elf,
      'holiday.png',
    );

    expect(response.status).toBe(415);
    expect(storage.size).toBe(0);
    expect(await Attachment.countDocuments({})).toBe(0);
  });

  it('refuses an SVG', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const ticket = await openTicket(session);

    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const response = await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      session,
      svg,
      'logo.svg',
    );
    expect(response.status).toBe(415);
  });

  /* Never stored. The audit entry is the only record the upload happened,
     which is exactly why it is audited. */
  it('does not store an infected file', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const ticket = await openTicket(session);
    scanner.verdict = { status: 'infected', signature: 'Eicar-Test-Signature' };

    const response = await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      session,
      Buffer.from('plain log text that will be declared infected'),
      'log.txt',
    );

    expect(response.status).toBe(422);
    expect(storage.size).toBe(0);
    expect(await Attachment.countDocuments({})).toBe(0);
    const { AuditLog } = await import('../db/models/index.js');
    expect(await AuditLog.countDocuments({ action: 'attachment.rejected' })).toBe(1);
  });

  /* "We could not tell" is not "clean". A scanner outage must not become a
     malware delivery service. */
  it('stores a file the scanner errored on, but refuses to serve it', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const ticket = await openTicket(session);
    scanner.verdict = { status: 'error', reason: 'unreachable' };

    const created = await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      session,
      await makePng(),
      'x.png',
    );
    expect(created.status).toBe(201);
    expect(
      (created.body as { attachment: { downloadable: boolean } }).attachment.downloadable,
    ).toBe(false);

    const id = (created.body as { attachment: { id: string } }).attachment.id;
    const link = await request(app)
      .post(`/api/customer/attachments/${id}/download-url`)
      .set('authorization', `Bearer ${session.token}`);
    expect(link.status).toBe(409);
  });

  it('refuses an upload to someone else’s ticket', async () => {
    await createCustomer('+96170100001');
    await createCustomer('+96171100002');
    const owner = await signInCustomer('+96170100001');
    const ticket = await openTicket(owner);

    const intruder = await signInCustomer('+96171100002');
    const response = await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      intruder,
      await makePng(),
      'x.png',
    );

    expect(response.status).toBe(404);
    expect(storage.size).toBe(0);
    /* Not even decoded: ownership is checked before the bytes are touched. */
    expect(scanner.scanned).toBe(0);
  });
});

/* ── Downloading ────────────────────────────────────────────────────────── */

describe('downloading', () => {
  async function uploaded() {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const ticket = await openTicket(session);
    const created = await attach(
      `/api/customer/tickets/${ticket}/attachments`,
      session,
      await makePng(),
      'screenshot.png',
    );
    return { session, ticket, id: (created.body as { attachment: { id: string } }).attachment.id };
  }

  async function link(session: Session, id: string) {
    const response = await request(app)
      .post(`/api/customer/attachments/${id}/download-url`)
      .set('authorization', `Bearer ${session.token}`);
    return (response.body as { url: string }).url;
  }

  it('serves the file through a signed link', async () => {
    const { session, id } = await uploaded();
    const url = await link(session, id);

    const response = await request(app).get(url).set('authorization', `Bearer ${session.token}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
  });

  /* Nothing uploaded is ever rendered inline in this origin. That single
     header is the most effective control against a stored-XSS payload in an
     uploaded file. */
  it('forces a download and forbids sniffing', async () => {
    const { session, id } = await uploaded();
    const response = await request(app)
      .get(await link(session, id))
      .set('authorization', `Bearer ${session.token}`);

    expect(response.headers['content-disposition']).toMatch(/^attachment;/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('refuses a missing or forged token', async () => {
    const { session, id } = await uploaded();
    const base = `/api/customer/attachments/${id}/download`;

    expect(
      (await request(app).get(base).set('authorization', `Bearer ${session.token}`)).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get(`${base}?token=9999999999.notasignature`)
          .set('authorization', `Bearer ${session.token}`)
      ).status,
    ).toBe(403);
  });

  /* A token is bound to the subject it was issued to, so it cannot be
     replayed by another account even inside its lifetime. */
  it('refuses a token issued to someone else', async () => {
    const { session, id } = await uploaded();
    const url = await link(session, id);

    await createCustomer('+96171100002');
    const other = await signInCustomer('+96171100002');

    const response = await request(app).get(url).set('authorization', `Bearer ${other.token}`);
    /* 404, because the other customer cannot see the attachment at all —
       the token check and the ownership check both refuse. */
    expect([403, 404]).toContain(response.status);
  });

  it('refuses an unauthenticated request even with a valid token', async () => {
    const { session, id } = await uploaded();
    const url = await link(session, id);
    expect((await request(app).get(url)).status).toBe(401);
  });

  it('lets staff read a customer’s attachment', async () => {
    const { id } = await uploaded();
    const staff = await signInStaff();
    const staffLink = await request(app)
      .post(`/api/attachments/${id}/download-url`)
      .set('authorization', `Bearer ${staff.token}`);
    expect(staffLink.status).toBe(200);
  });
});
