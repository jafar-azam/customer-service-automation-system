import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizePhone } from '@csas/shared';
import { createApp } from '../app.js';
import { PhoneCipher } from '../crypto/phone.js';
import { Contract, Customer, StaffUser, Ticket } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { clearTestRedis, startTestRedis, stopTestRedis } from '../db/test-redis.js';
import { CSRF_COOKIE, REFRESH_COOKIE } from '../http/cookies.js';
import { createMetrics } from '../observability/metrics.js';
import { hashPassword } from '../services/auth/password.js';
import { otpCodeFor, silentLogger, testEnv } from '../test-support.js';

const env = testEnv({
  DEMO_MODE: 'true',
  DEMO_ADMIN_TOTP_SECRET: 'A'.repeat(32),
  TICKET_REOPEN_WINDOW_DAYS: '14',
});
const PASSWORD = 'fourteen purple lanterns upstairs'; // secret-scan:allow

const app = createApp({
  env,
  version: '0.1.0',
  logger: silentLogger(),
  metrics: createMetrics({ collectDefaults: false }),
}).express;

beforeAll(async () => {
  await startTestDatabase();
  await startTestRedis();
}, 180_000);

afterEach(async () => {
  await clearTestDatabase();
  await clearTestRedis();
});

afterAll(async () => {
  await stopTestRedis();
  await stopTestDatabase();
});

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
    email: 'demo@example.test',
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
  /* By recipient, not "the newest one". See `otpCodeFor`. */
  const code = await otpCodeFor(normalizePhone(phone));
  const response = await request(app).post('/api/auth/customer/verify').send({ phone, code });
  void cookie(response, CSRF_COOKIE);
  void cookie(response, REFRESH_COOKIE);
  return { token: (response.body as { accessToken: string }).accessToken };
}

async function signInStaff(): Promise<Session> {
  /* Idempotent: several helpers in this file sign staff in, and creating the
     same account twice in one test is a duplicate-key error rather than a
     finding about the code. */
  if (!(await StaffUser.exists({ email: 'agent@csas.test' }))) {
    await StaffUser.create({
      email: 'agent@csas.test',
      name: 'Agent Person',
      role: 'agent',
      status: 'active',
      passwordHash: await hashPassword(PASSWORD),
    });
  }
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'agent@csas.test', password: PASSWORD });
  return { token: (response.body as { accessToken: string }).accessToken };
}

const get = (path: string, session: Session) =>
  request(app).get(path).set('authorization', `Bearer ${session.token}`);
const post = (path: string, session: Session) =>
  request(app).post(path).set('authorization', `Bearer ${session.token}`);

async function openTicket(session: Session, subject: string): Promise<string> {
  const response = await post('/api/customer/tickets', session).send({
    subject,
    body: 'the printer stopped',
  });
  return (response.body as { ticket: { id: string } }).ticket.id;
}

/* ── History and filters ────────────────────────────────────────────────── */

describe('GET /tickets with filters', () => {
  async function threeTickets(session: Session) {
    const a = await openTicket(session, 'Printer stopped after the update');
    const b = await openTicket(session, 'Invoice export missing a column');
    const c = await openTicket(session, 'Second till licence');
    const staff = await signInStaff();
    await post(`/api/tickets/${b}/status`, staff).send({ to: 'resolved' });
    return { a, b, c, staff };
  }

  it('reports a total alongside the page', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    await threeTickets(session);

    const response = await get('/api/customer/tickets?limit=2', session);
    const body = response.body as { tickets: unknown[]; total: number; limit: number };
    expect(body.tickets).toHaveLength(2);
    /* The count runs against the same filter as the rows, so "2 of 3" cannot
       disagree with what is shown. */
    expect(body.total).toBe(3);
    expect(body.limit).toBe(2);
  });

  it('filters by status', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    await threeTickets(session);

    const response = await get('/api/customer/tickets?status=resolved', session);
    const body = response.body as { tickets: { subject: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.tickets[0]?.subject).toContain('Invoice export');
  });

  it('searches the subject and the reference', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    await threeTickets(session);

    expect(
      (await get('/api/customer/tickets?search=printer', session)).body as { total: number },
    ).toMatchObject({ total: 1 });
    expect(
      (await get('/api/customer/tickets?search=CSAS-000001', session)).body as { total: number },
    ).toMatchObject({ total: 1 });
  });

  /* `CLAUDE.md`: never build a regular expression from raw input. Without
     escaping, `.*` matches everything and `a{10000,}` is a denial of service. */
  it('treats a search string as text, not as a pattern', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    await threeTickets(session);

    const response = await get('/api/customer/tickets?search=.%2A', session);
    expect((response.body as { total: number }).total).toBe(0);
  });

  it('filters by the date the ticket was opened', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await openTicket(session, 'Old ticket');
    /* `createdAt` is immutable by default under Mongoose's timestamps, so a
       plain $set is silently dropped and the fixture is not actually old.
       `overwriteImmutable` is the documented way to backdate one. */
    await Ticket.findByIdAndUpdate(
      id,
      { $set: { createdAt: new Date('2026-01-15T10:00:00Z') } },
      { timestamps: false, overwriteImmutable: true },
    );
    await openTicket(session, 'Recent ticket');

    const old = await get(
      '/api/customer/tickets?openedBefore=2026-06-01&openedAfter=2026-01-01',
      session,
    );
    const body = old.body as { tickets: { subject: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.tickets[0]?.subject).toBe('Old ticket');
  });

  /* An unknown filter is refused rather than ignored, so a client asking for
     something that does not exist is told so instead of being served
     everything. */
  it('refuses an unknown filter', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    expect((await get('/api/customer/tickets?customerId=abc', session)).status).toBe(400);
  });

  it('still scopes every filter to the caller', async () => {
    await createCustomer('+96170100001');
    await createCustomer('+96171100002');
    const owner = await signInCustomer('+96170100001');
    await openTicket(owner, 'Printer stopped');

    const other = await signInCustomer('+96171100002');
    const response = await get('/api/customer/tickets?search=printer', other);
    expect((response.body as { total: number }).total).toBe(0);
  });
});

/* ── Detail ─────────────────────────────────────────────────────────────── */

describe('GET /tickets/:id', () => {
  it('returns the status timeline', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await openTicket(session, 'Printer stopped');
    const staff = await signInStaff();
    await post(`/api/tickets/${id}/status`, staff).send({ to: 'in_progress' });

    const response = await get(`/api/customer/tickets/${id}`, session);
    const body = response.body as {
      timeline: { status: string; by: string }[];
      reopen: { ok: boolean; reason?: string };
    };

    expect(body.timeline).toHaveLength(2);
    expect(body.timeline[0]).toMatchObject({ status: 'open', by: 'customer' });
    expect(body.timeline[1]).toMatchObject({ status: 'in_progress', by: 'staff' });
    expect(body.reopen).toMatchObject({ ok: false, reason: 'not_closed' });
  });

  /* A customer has no use for an employee's id, and it identifies a person. */
  it('reduces who acted to a role, never an id', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await openTicket(session, 'Printer stopped');
    const staff = await signInStaff();
    await post(`/api/tickets/${id}/status`, staff).send({ to: 'in_progress' });

    const response = await get(`/api/customer/tickets/${id}`, session);
    const staffId = String((await StaffUser.findOne({}).lean())?._id);
    expect(JSON.stringify(response.body)).not.toContain(staffId);
  });
});

/* ── Transcript ─────────────────────────────────────────────────────────── */

describe('GET /tickets/:id/transcript', () => {
  async function conversation() {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await openTicket(session, 'Printer stopped');
    const staff = await signInStaff();
    await post(`/api/tickets/${id}/messages`, staff).send({ body: 'Restart the spooler' });
    await post(`/api/tickets/${id}/messages`, staff).send({
      body: 'Internal: known regression KB-0412',
      internal: true,
    });
    return { session, staff, id };
  }

  it('downloads the conversation as a text file', async () => {
    const { session, id } = await conversation();
    const response = await get(`/api/customer/tickets/${id}/transcript`, session);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="CSAS-\d{6}\.txt"/,
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.text).toContain('the printer stopped');
    expect(response.text).toContain('Restart the spooler');
  });

  /* The worst possible leak: it leaves the system as a file the customer
     keeps, and no later access control applies to it. */
  it('never contains an internal note', async () => {
    const { session, id } = await conversation();
    const response = await get(`/api/customer/tickets/${id}/transcript`, session);
    expect(response.text).not.toContain('KB-0412');
  });

  it('can be taken in Arabic', async () => {
    const { session, id } = await conversation();
    const response = await get(`/api/customer/tickets/${id}/transcript?locale=ar-LB`, session);
    expect(response.text).toContain('نسخة من المحادثة');
    expect(response.text).not.toMatch(/[٠-٩]/);
  });

  it('refuses a transcript of someone else’s ticket', async () => {
    const { id } = await conversation();
    await createCustomer('+96171100002');
    const other = await signInCustomer('+96171100002');
    expect((await get(`/api/customer/tickets/${id}/transcript`, other)).status).toBe(404);
  });
});

/* ── Reopening ──────────────────────────────────────────────────────────── */

describe('POST /tickets/:id/reopen', () => {
  async function closedTicket() {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await openTicket(session, 'Printer stopped');
    const staff = await signInStaff();
    await post(`/api/tickets/${id}/status`, staff).send({ to: 'closed' });
    return { session, id };
  }

  /* A new ticket linked to the old one, not a transition: `closed` is
     terminal so an auto-close job and a customer cannot fight over one
     record, and the original's resolution time stays meaningful. */
  it('creates a new linked ticket rather than resurrecting the old one', async () => {
    const { session, id } = await closedTicket();

    const response = await post(`/api/customer/tickets/${id}/reopen`, session).send({
      body: 'it has started again',
    });

    expect(response.status).toBe(201);
    const created = (response.body as { ticket: { id: string; status: string } }).ticket;
    expect(created.id).not.toBe(id);
    expect(created.status).toBe('open');

    const original = await Ticket.findById(id).lean();
    expect(original?.status).toBe('closed');
    expect(String((await Ticket.findById(created.id).lean())?.reopenedFromId)).toBe(id);
  });

  it('carries the subject and priority across', async () => {
    const { session, id } = await closedTicket();
    const response = await post(`/api/customer/tickets/${id}/reopen`, session).send({
      body: 'again',
    });
    expect((response.body as { ticket: { subject: string } }).ticket.subject).toBe(
      'Printer stopped',
    );
  });

  it('refuses once the window has passed', async () => {
    const { session, id } = await closedTicket();
    await Ticket.findByIdAndUpdate(id, {
      $set: { closedAt: new Date(Date.now() - 20 * 86_400_000) },
    });

    const response = await post(`/api/customer/tickets/${id}/reopen`, session).send({
      body: 'too late',
    });
    expect(response.status).toBe(409);
    expect((response.body as { error: { code: string } }).error.code).toBe('reopen_window_passed');
  });

  it('refuses a ticket that is not closed', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await openTicket(session, 'Still open');
    const response = await post(`/api/customer/tickets/${id}/reopen`, session).send({ body: 'x' });
    expect(response.status).toBe(409);
    expect((response.body as { error: { code: string } }).error.code).toBe('reopen_not_closed');
  });

  /* The same function answers both questions, so the button the client draws
     and the request the server accepts cannot disagree. */
  it('advertises eligibility on the detail view', async () => {
    const { session, id } = await closedTicket();
    const response = await get(`/api/customer/tickets/${id}`, session);
    expect((response.body as { reopen: { ok: boolean } }).reopen.ok).toBe(true);
  });

  it('is not available to staff', async () => {
    const { id } = await closedTicket();
    const staff = await signInStaff();
    expect((await post(`/api/tickets/${id}/reopen`, staff).send({ body: 'x' })).status).toBe(404);
  });
});

/* ── Notification preferences ───────────────────────────────────────────── */

describe('notification preferences', () => {
  it('returns the defaults', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');

    const response = await get('/api/customer/preferences', session);
    expect(response.body).toMatchObject({
      preferences: {
        whatsapp: true,
        email: false,
        marketingOptOut: false,
        preferredLanguage: 'ar',
      },
    });
  });

  it('updates only what was sent', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');

    const response = await request(app)
      .patch('/api/customer/preferences')
      .set('authorization', `Bearer ${session.token}`)
      .send({ marketingOptOut: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      preferences: { marketingOptOut: true, whatsapp: true, preferredLanguage: 'ar' },
    });
  });

  /* Opting out of marketing is a consent change, and "who withdrew consent
     and when" is the question a regulator asks. */
  it('audits a marketing opt-out as a consent withdrawal', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    await request(app)
      .patch('/api/customer/preferences')
      .set('authorization', `Bearer ${session.token}`)
      .send({ marketingOptOut: true });

    const { AuditLog } = await import('../db/models/index.js');
    expect(await AuditLog.countDocuments({ action: 'consent.withdrawn' })).toBe(1);
  });

  /* Turning on a channel there is no address for would be a setting that
     silently does nothing. */
  it('says whether email is even selectable', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const response = await get('/api/customer/preferences', session);
    expect(
      (response.body as { preferences: { emailAvailable: boolean } }).preferences.emailAvailable,
    ).toBe(true);
  });

  it('refuses an empty change and an unknown field', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const patch = (body: unknown) =>
      request(app)
        .patch('/api/customer/preferences')
        .set('authorization', `Bearer ${session.token}`)
        .send(body as object);

    expect((await patch({})).status).toBe(400);
    expect((await patch({ role: 'admin' })).status).toBe(400);
  });

  /* An agent changing someone's contact preferences is exactly what a consent
     record is meant to make impossible to do quietly. */
  it('is not reachable by staff', async () => {
    const staff = await signInStaff();
    expect((await get('/api/customer/preferences', staff)).status).toBe(401);
  });
});
