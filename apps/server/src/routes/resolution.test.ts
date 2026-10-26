import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizePhone } from '@csas/shared';
import { createApp } from '../app.js';
import { PhoneCipher } from '../crypto/phone.js';
import {
  Contract,
  Customer,
  Escalation,
  Notification,
  Resolution,
  SatisfactionRating,
  StaffUser,
  Ticket,
} from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { clearTestRedis, startTestRedis, stopTestRedis } from '../db/test-redis.js';
import { CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from '../http/cookies.js';
import { createMetrics } from '../observability/metrics.js';
import { NullTicketEvents } from '../realtime/events.js';
import { hashPassword } from '../services/auth/password.js';
import { otpCodeFor, silentLogger, testEnv } from '../test-support.js';
import { isProgress, overwritable, SIGNATURE_HEADER } from './webhooks.js';

/**
 * Step 16: closing the loop, and the callbacks that report on it.
 *
 * Two things are being proved here. That a customer's "no" is acted on rather
 * than recorded — it escalates, assigns and notifies — and that the webhook is
 * safe to expose, which is the only unauthenticated route in the system.
 */

const env = testEnv({ DEMO_MODE: 'true', DEMO_ADMIN_TOTP_SECRET: 'A'.repeat(32) });
const PASSWORD = 'fourteen purple lanterns upstairs'; // secret-scan:allow

const events = new NullTicketEvents();
const app = createApp({
  env,
  version: '0.1.0',
  logger: silentLogger(),
  metrics: createMetrics({ collectDefaults: false }),
  events,
}).express;

beforeAll(async () => {
  await startTestDatabase();
  await startTestRedis();
}, 180_000);

afterEach(async () => {
  await clearTestDatabase();
  await clearTestRedis();
  events.emitted.length = 0;
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

function cookie(response: request.Response, name: string): string {
  const header: unknown = response.headers['set-cookie'];
  const all = Array.isArray(header) ? (header as string[]) : [];
  const match = all.find((value) => value.startsWith(`${name}=`));
  return String(match?.split(';')[0]?.split('=')[1]);
}

async function signInCustomer(phone: string): Promise<Session> {
  await request(app).post('/api/auth/customer/request-code').send({ phone });
  /* By recipient, not "the newest one". See `otpCodeFor`. */
  const code = await otpCodeFor(normalizePhone(phone));
  const response = await request(app).post('/api/auth/customer/verify').send({ phone, code });
  return {
    token: (response.body as { accessToken: string }).accessToken,
    csrf: cookie(response, CSRF_COOKIE),
    refresh: cookie(response, REFRESH_COOKIE),
  };
}

async function signInStaff(role: 'agent' | 'admin' = 'agent'): Promise<Session> {
  const email = `${role}@csas.test`;
  await StaffUser.create({
    email,
    name: 'Agent Person',
    role,
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

function authed(method: 'get' | 'post', path: string, session: Session) {
  const call = request(app)
    [method](path)
    .set('authorization', `Bearer ${session.token}`)
    .set('Cookie', [`${REFRESH_COOKIE}=${session.refresh}`, `${CSRF_COOKIE}=${session.csrf}`]);
  return method === 'post' ? call.set(CSRF_HEADER, session.csrf) : call;
}

/** A ticket that has been answered, so there is something to confirm. */
async function answeredTicket(session: Session): Promise<string> {
  const response = await authed('post', '/api/customer/tickets', session).send({
    subject: 'Printer stopped after the update',
    body: 'el printer 3am ya3mel error ba3ed l update',
    inputForm: 'arabizi',
  });
  const id = (response.body as { ticket: { id: string } }).ticket.id;
  await Ticket.findByIdAndUpdate(id, { $set: { status: 'awaiting_customer' } }).exec();
  return id;
}

/* ── Confirming ─────────────────────────────────────────────────────────── */

describe('POST /api/customer/tickets/:id/confirm', () => {
  it('resolves the ticket when the customer says it worked', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await answeredTicket(session);

    const response = await authed('post', `/api/customer/tickets/${id}/confirm`, session).send({
      solved: true,
    });

    expect(response.status).toBe(200);
    const body = response.body as { ticket: { status: string }; escalated: boolean };
    expect(body.ticket.status).toBe('resolved');
    expect(body.escalated).toBe(false);

    const resolution = await Resolution.findOne({ ticketId: id }).lean();
    expect(resolution?.confirmedByCustomer).toBe(true);
    /* Nobody replied, so the assistant is credited — the figure step 21
       reports on. */
    expect(resolution?.resolvedBy).toBe('assistant');
  });

  /* "No" is a first-class answer. This is the behaviour the step exists for:
     the customer is not left to start again from the beginning. */
  it('escalates to the on-duty agent when the customer says it did not', async () => {
    await createCustomer('+96170100001');
    const staff = await signInStaff('agent');
    expect(staff.token).toBeTruthy();
    const session = await signInCustomer('+96170100001');
    const id = await answeredTicket(session);

    const response = await authed('post', `/api/customer/tickets/${id}/confirm`, session).send({
      solved: false,
      score: 1,
    });

    expect(response.status).toBe(200);
    const body = response.body as { ticket: { status: string }; escalated: boolean };
    expect(body.ticket.status).toBe('escalated');
    expect(body.escalated).toBe(true);

    /* Assigned *and* notified. Either alone produces a queue nobody watches
       or a message everybody assumes someone else took. */
    const ticket = await Ticket.findById(id).lean();
    expect(ticket?.assignedStaffId).toBeTruthy();

    const escalation = await Escalation.findOne({ ticketId: id }).lean();
    expect(escalation?.reason).toBe('customer_rejected_answer');
    expect(escalation?.notifiedAt).toBeTruthy();

    const sent = await Notification.findOne({ kind: 'escalation' }).lean();
    expect(sent?.channel).toBe('whatsapp');
    /* The reference and a link, never the subject or the conversation: this
       lands on a lock screen (PRIVACY.md §5). */
    expect(sent?.preview).toContain(String(ticket?.reference));
    expect(sent?.preview).not.toContain('Printer stopped');
  });

  it('records the score even when the answer is rejected', async () => {
    await createCustomer('+96170100001');
    await signInStaff('agent');
    const session = await signInCustomer('+96170100001');
    const id = await answeredTicket(session);

    await authed('post', `/api/customer/tickets/${id}/confirm`, session).send({
      solved: false,
      score: 1,
      comment: 'the answer was about a different printer',
    });

    /* The more useful half of the data: a 1 attached to a rejected answer is
       exactly where step 21 looks for the assistant being wrong. */
    const rating = await SatisfactionRating.findOne({ ticketId: id }).lean();
    expect(rating?.score).toBe(1);
  });

  /* The shortcut a busy queue invites, and the one that would make every
     satisfaction figure in the system meaningless. */
  it('refuses an agent confirming their own work', async () => {
    const customer = await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await answeredTicket(session);
    /* `agent`, not `admin`: an admin login answers with a two-factor
       challenge rather than a token, so an `admin` here would have been
       rejected at the guard for having no session — a 401 that looks like the
       403 this test is trying to prove and would have passed for the wrong
       reason. */
    const staff = await signInStaff('agent');
    expect(customer._id).toBeTruthy();

    const response = await authed('post', `/api/tickets/${id}/confirm`, staff).send({
      solved: true,
    });

    /* 404, not 403: the staff router has no such route, and an endpoint that
       answers "forbidden" confirms it exists. */
    expect(response.status).toBe(404);
    expect(await Resolution.countDocuments({})).toBe(0);
  });

  it('refuses to confirm a ticket nobody has answered', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const open = await authed('post', '/api/customer/tickets', session).send({
      subject: 'A new question',
      body: 'kifak? baddi sa2al',
      inputForm: 'arabizi',
    });
    const id = (open.body as { ticket: { id: string } }).ticket.id;

    const response = await authed('post', `/api/customer/tickets/${id}/confirm`, session).send({
      solved: true,
    });

    expect(response.status).toBe(409);
    expect((response.body as { error: { code: string } }).error.code).toBe('not_answerable');
  });

  /* No default. A malformed client must not silently record satisfaction
     nobody expressed — this is the one number that cannot be inferred. */
  it('rejects a body with no answer in it', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await answeredTicket(session);

    const response = await authed('post', `/api/customer/tickets/${id}/confirm`, session).send({
      score: 5,
    });

    expect(response.status).toBe(400);
  });

  it('cannot confirm another customer’s ticket', async () => {
    await createCustomer('+96170100001');
    await createCustomer('+96170100002');
    const mine = await signInCustomer('+96170100001');
    const id = await answeredTicket(mine);
    const theirs = await signInCustomer('+96170100002');

    const response = await authed('post', `/api/customer/tickets/${id}/confirm`, theirs).send({
      solved: true,
    });

    expect(response.status).toBe(404);
  });
});

/* ── Rating ─────────────────────────────────────────────────────────────── */

describe('POST /api/customer/tickets/:id/rating', () => {
  it('records a rating on its own', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await answeredTicket(session);

    const response = await authed('post', `/api/customer/tickets/${id}/rating`, session).send({
      score: 4,
    });

    expect(response.status).toBe(204);
    expect((await SatisfactionRating.findOne({ ticketId: id }).lean())?.score).toBe(4);
  });

  /* Someone changing their mind is a correction, not a second opinion — and
     the unique index would reject an insert anyway. */
  it('replaces an earlier rating rather than adding one', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await answeredTicket(session);

    await authed('post', `/api/customer/tickets/${id}/rating`, session).send({ score: 2 });
    await authed('post', `/api/customer/tickets/${id}/rating`, session).send({ score: 5 });

    expect(await SatisfactionRating.countDocuments({ ticketId: id })).toBe(1);
    expect((await SatisfactionRating.findOne({ ticketId: id }).lean())?.score).toBe(5);
  });

  it('rejects a score outside one to five', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await answeredTicket(session);

    for (const score of [0, 6, 2.5]) {
      const response = await authed('post', `/api/customer/tickets/${id}/rating`, session).send({
        score,
      });
      expect(response.status).toBe(400);
    }
    expect(await SatisfactionRating.countDocuments({})).toBe(0);
  });
});

/* ── The webhook ────────────────────────────────────────────────────────── */

function sign(body: unknown): { raw: string; signature: string } {
  const raw = JSON.stringify(body);
  return {
    raw,
    signature: createHmac('sha256', env.ACCESS_TOKEN_SECRET).update(raw).digest('hex'),
  };
}

function post(body: unknown, signature?: string) {
  const signed = sign(body);
  return request(app)
    .post('/api/webhooks/messaging')
    .set('content-type', 'application/json')
    .set(SIGNATURE_HEADER, signature ?? signed.signature)
    .send(signed.raw);
}

async function queuedNotification(providerMessageId: string) {
  return Notification.create({
    kind: 'otp',
    channel: 'whatsapp',
    recipientMasked: '+961***001',
    templateKey: 'otp.send',
    status: 'queued',
    providerMessageId,
    idempotencyKey: `test:${providerMessageId}`,
  });
}

describe('POST /api/webhooks/messaging', () => {
  /* The ordering fix. Mounted after `express.json` the raw parser sees an
     already-consumed stream, so `req.body` is empty and every honest call
     fails — which is how a signature check gets "fixed" into uselessness. */
  it('verifies the signature against the bytes that were sent', async () => {
    await queuedNotification('PM-1');

    const response = await post({ providerMessageId: 'PM-1', status: 'sent' });

    expect(response.status).toBe(202);
    expect((await Notification.findOne({ providerMessageId: 'PM-1' }).lean())?.status).toBe('sent');
  });

  it('rejects a forged signature', async () => {
    await queuedNotification('PM-1');

    const response = await post({ providerMessageId: 'PM-1', status: 'delivered' }, 'f'.repeat(64));

    expect(response.status).toBe(401);
    expect((await Notification.findOne({ providerMessageId: 'PM-1' }).lean())?.status).toBe(
      'queued',
    );
  });

  it('rejects an unsigned call', async () => {
    const response = await request(app)
      .post('/api/webhooks/messaging')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ providerMessageId: 'PM-1', status: 'sent' }));

    expect(response.status).toBe(401);
  });

  /* `timingSafeEqual` throws on a length mismatch rather than returning
     false, which would surface as a 500 and tell the sender their forgery was
     the wrong *shape*. */
  it('answers 401, not 500, for a signature of the wrong length', async () => {
    const response = await post({ providerMessageId: 'PM-1', status: 'sent' }, 'abc');
    expect(response.status).toBe(401);
  });

  it('applies the same report twice without moving the record twice', async () => {
    await queuedNotification('PM-1');

    const first = await post({ providerMessageId: 'PM-1', status: 'delivered' });
    const second = await post({ providerMessageId: 'PM-1', status: 'delivered' });

    expect([first.status, second.status]).toEqual([202, 202]);
    const row = await Notification.findOne({ providerMessageId: 'PM-1' }).lean();
    expect(row?.status).toBe('delivered');
    expect(await Notification.countDocuments({})).toBe(1);
  });

  /* `read` before `delivered` is routine on a slow network. Without the
     ordering guard a late `sent` overwrites a `read` and the log shows a
     message going backwards. */
  it('ignores a report that would move the record backwards', async () => {
    await queuedNotification('PM-1');

    await post({ providerMessageId: 'PM-1', status: 'read' });
    const late = await post({ providerMessageId: 'PM-1', status: 'sent' });

    expect(late.status).toBe(202);
    expect((await Notification.findOne({ providerMessageId: 'PM-1' }).lean())?.status).toBe('read');
  });

  /* Mongoose drops an unknown path from an update silently, so writing this
     to `errorCode` discarded the provider's reason on every failed send. */
  it('stores the provider error code in the schema’s field', async () => {
    await queuedNotification('PM-1');

    await post({ providerMessageId: 'PM-1', status: 'failed', errorCode: 'handset_unreachable' });

    const row = await Notification.findOne({ providerMessageId: 'PM-1' }).lean();
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('handset_unreachable');
  });

  it('records the timestamps a delivery complaint turns on', async () => {
    await queuedNotification('PM-1');

    await post({ providerMessageId: 'PM-1', status: 'sent' });
    await post({ providerMessageId: 'PM-1', status: 'delivered' });

    const row = await Notification.findOne({ providerMessageId: 'PM-1' }).lean();
    expect(row?.sentAt).toBeTruthy();
    expect(row?.deliveredAt).toBeTruthy();
  });

  /* A webhook that answers 404 for an unknown id tells a caller which ids
     exist. */
  it('answers 202 for an id it has never seen', async () => {
    const response = await post({ providerMessageId: 'PM-does-not-exist', status: 'delivered' });
    expect(response.status).toBe(202);
  });

  it('rejects an unrecognised payload', async () => {
    await expect(
      post({ providerMessageId: 'PM-1', status: 'exploded' }).then((r) => r.status),
    ).resolves.toBe(400);
    /* `queued` is ours, not something a provider can report. */
    await expect(
      post({ providerMessageId: 'PM-1', status: 'queued' }).then((r) => r.status),
    ).resolves.toBe(400);
    await expect(
      post({ providerMessageId: 'PM-1', status: 'sent', extra: 1 }).then((r) => r.status),
    ).resolves.toBe(400);
  });
});

/* ── The ordering table itself ──────────────────────────────────────────── */

describe('delivery status ordering', () => {
  /* The bug this table had: a local four-element status list was used both
     for what a report may carry and for what it may overwrite. `queued` was
     absent, so `overwritable('sent')` was empty, `$in: []` matched nothing,
     and the first report for every message was accepted and dropped. */
  it('lets a first report move a notification off queued', () => {
    expect(overwritable('sent')).toContain('queued');
    expect(isProgress('queued', 'sent')).toBe(true);
  });

  it('treats read and failed as endings neither of which replaces the other', () => {
    expect(isProgress('read', 'failed')).toBe(false);
    expect(isProgress('failed', 'read')).toBe(false);
  });

  /* We decided not to send this. No provider callback may rewrite that into
     a delivery. */
  it('never overwrites suppressed', () => {
    for (const status of ['sent', 'delivered', 'read', 'failed']) {
      expect(isProgress('suppressed', status)).toBe(false);
      expect(overwritable(status)).not.toContain('suppressed');
    }
  });

  it('does not treat an unrecognised status as queued', () => {
    expect(isProgress('something-a-later-version-added', 'sent')).toBe(false);
  });
});
