import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizePhone } from '@csas/shared';
import { createApp } from '../app.js';
import { PhoneCipher } from '../crypto/phone.js';
import {
  AuditLog,
  Contract,
  Counter,
  Customer,
  Message,
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

async function createCustomer(phone: string, contract: 'active' | 'expired' = 'active') {
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
  const [from, to] = contract === 'active' ? [-30 * day, 30 * day] : [-400 * day, -10 * day];
  await Contract.create({
    customerId: customer._id,
    reference: `CT-${String(Math.random()).slice(2, 10)}`,
    tier: 'standard',
    status: 'active',
    startDate: new Date(Date.now() + from),
    endDate: new Date(Date.now() + to),
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

async function openTicket(session: Session, subject = 'Printer stopped after the update') {
  const response = await authed('post', '/api/customer/tickets', session).send({
    subject,
    body: 'el printer 3am ya3mel error ba3ed l update',
    inputForm: 'arabizi',
  });
  return response;
}

/* ── Creating ───────────────────────────────────────────────────────────── */

describe('POST /api/customer/tickets', () => {
  it('opens a ticket with its first message', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');

    const response = await openTicket(session);

    expect(response.status).toBe(201);
    const body = response.body as {
      ticket: { reference: string; status: string; inputForm: string };
      message: { author: string; body: string };
    };
    expect(body.ticket.reference).toMatch(/^CSAS-\d{6}$/);
    expect(body.ticket.status).toBe('open');
    /* Recorded per ticket so Phase 8 can report accuracy per written form
       without re-detecting it months later. */
    expect(body.ticket.inputForm).toBe('arabizi');
    expect(body.message.author).toBe('customer');
    expect(await Message.countDocuments({})).toBe(1);
  });

  /* Sequential, gapless under a single writer, and allocated atomically. The
     reference is read out on the phone, so it cannot be a 24-character hex
     id, and `count() + 1` would hand the same number to two requests. */
  it('allocates references without repeating one under concurrency', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        openTicket(session, `Subject number ${String(index)}`),
      ),
    );

    const references = responses.map(
      (r) => (r.body as { ticket: { reference: string } }).ticket.reference,
    );
    expect(new Set(references).size).toBe(8);
    expect(await Counter.findById('ticket').lean()).toMatchObject({ value: 8 });
  });

  /* Re-checked at write time, not trusted from login: a contract can expire
     between signing in and writing, and the check reads the dates rather than
     the cached status field. */
  it('refuses a customer whose contract has expired', async () => {
    await createCustomer('+96170100002', 'expired');
    const session = await signInCustomer('+96170100002');

    const response = await openTicket(session);
    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe('contract_inactive');
    expect(await Ticket.countDocuments({})).toBe(0);
  });

  it('refuses a staff member trying to open one', async () => {
    const session = await signInStaff();
    const response = await authed('post', '/api/tickets', session).send({
      subject: 'Opened by staff',
      body: 'should not work',
    });
    expect(response.status).toBe(403);
  });

  it('records the reference in the audit log, never the body', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    await openTicket(session);

    const entry = await AuditLog.findOne({ action: 'ticket.created' }).lean();
    expect(entry).toBeTruthy();
    expect(JSON.stringify(entry)).toContain('CSAS-');
    expect(JSON.stringify(entry)).not.toContain('3am ya3mel');
  });
});

/* ── Object-level authorization ─────────────────────────────────────────── */

describe('one customer cannot reach another customer’s ticket', () => {
  async function twoCustomers() {
    await createCustomer('+96170100001');
    await createCustomer('+96170100002');
    const owner = await signInCustomer('+96170100001');
    const ticket = await openTicket(owner);
    const intruder = await signInCustomer('+96170100002');
    return { owner, intruder, id: (ticket.body as { ticket: { id: string } }).ticket.id };
  }

  /* 404, never 403. A 403 confirms the ticket exists, and references are
     sequential — which would turn CSAS-000001 upwards into a census of the
     customer base and a timeline of when each arrived. */
  it('answers 404, not 403, for someone else’s ticket', async () => {
    const { intruder, id } = await twoCustomers();
    const response = await authed('get', `/api/customer/tickets/${id}`, intruder);
    expect(response.status).toBe(404);
  });

  it('gives the same answer for a ticket that does not exist', async () => {
    const { intruder } = await twoCustomers();
    const missing = await authed('get', '/api/customer/tickets/507f1f77bcf86cd799439011', intruder);
    expect(missing.status).toBe(404);
  });

  it('hides it from the list as well as from the detail', async () => {
    const { intruder, owner } = await twoCustomers();
    expect(
      ((await authed('get', '/api/customer/tickets', intruder)).body as { tickets: unknown[] })
        .tickets,
    ).toHaveLength(0);
    expect(
      ((await authed('get', '/api/customer/tickets', owner)).body as { tickets: unknown[] })
        .tickets,
    ).toHaveLength(1);
  });

  it('refuses to read the conversation', async () => {
    const { intruder, id } = await twoCustomers();
    const response = await authed('get', `/api/customer/tickets/${id}/messages`, intruder);
    expect(response.status).toBe(404);
  });

  /* An unauthorised write must be a no-op that reports not-found, not a
     successful write to someone else's record. */
  it('refuses to write to it, and changes nothing', async () => {
    const { intruder, id } = await twoCustomers();
    const before = await Message.countDocuments({});

    const response = await authed('post', `/api/customer/tickets/${id}/messages`, intruder).send({
      body: 'injected',
    });

    expect(response.status).toBe(404);
    expect(await Message.countDocuments({})).toBe(before);
  });

  it('refuses to move it', async () => {
    const { intruder, id } = await twoCustomers();
    const response = await authed('post', `/api/customer/tickets/${id}/status`, intruder).send({
      to: 'closed',
    });
    expect(response.status).toBe(404);
    expect((await Ticket.findById(id).lean())?.status).toBe('open');
  });

  /* The ownership clause is spread last in `listFilter` precisely so a
     caller-supplied filter cannot override it. With the spread the other way
     round this is an account takeover through a query string. */
  it('cannot widen its own scope through the query string', async () => {
    const { intruder } = await twoCustomers();
    const response = await authed(
      'get',
      '/api/customer/tickets?customerId=507f1f77bcf86cd799439011',
      intruder,
    );
    /* Unknown query keys are refused outright rather than ignored. */
    expect(response.status).toBe(400);
  });

  it('lets staff see both', async () => {
    await twoCustomers();
    const staff = await signInStaff();
    const response = await authed('get', '/api/tickets', staff);
    expect((response.body as { tickets: unknown[] }).tickets).toHaveLength(1);
  });
});

/* ── Internal notes ─────────────────────────────────────────────────────── */

describe('internal notes', () => {
  async function ticketWithNote() {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const created = await openTicket(customer);
    const id = (created.body as { ticket: { id: string } }).ticket.id;

    const staff = await signInStaff();
    await authed('post', `/api/tickets/${id}/messages`, staff).send({
      body: 'Escalating — the spooler bug is known, see KB-0412.',
      internal: true,
    });
    return { customer, staff, id };
  }

  /* Excluded in the query, not filtered from the result. A post-filter leaves
     the note in memory and one forgotten `.map()` away from being sent. */
  it('are invisible to the customer', async () => {
    const { customer, id } = await ticketWithNote();
    const response = await authed('get', `/api/customer/tickets/${id}/messages`, customer);
    const messages = (response.body as { messages: { body: string }[] }).messages;
    expect(messages).toHaveLength(1);
    expect(JSON.stringify(messages)).not.toContain('Escalating');
  });

  it('are visible to staff', async () => {
    const { staff, id } = await ticketWithNote();
    const response = await authed('get', `/api/tickets/${id}/messages`, staff);
    expect((response.body as { messages: unknown[] }).messages).toHaveLength(2);
  });

  /* Not a silent downgrade to a public message: a customer who sends
     `internal: true` is probing or using a broken client, and quietly
     publishing what they believed was private is the worse failure. */
  it('cannot be written by a customer', async () => {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const created = await openTicket(customer);
    const id = (created.body as { ticket: { id: string } }).ticket.id;

    const response = await authed('post', `/api/customer/tickets/${id}/messages`, customer).send({
      body: 'trying to write a note',
      internal: true,
    });
    expect(response.status).toBe(403);
    expect(await Message.countDocuments({ internal: true })).toBe(0);
  });

  /* A note is staff talking to each other. Treating it as a reply would stop
     the first-response clock on work nobody has answered. */
  it('do not move the ticket or stop the response clock', async () => {
    const { id } = await ticketWithNote();
    const ticket = await Ticket.findById(id).lean();
    expect(ticket?.status).toBe('open');
    expect(ticket?.sla.firstRespondedAt).toBeUndefined();
  });
});

/* ── The conversation moves the ticket ──────────────────────────────────── */

describe('posting a message', () => {
  async function conversation() {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const created = await openTicket(customer);
    const staff = await signInStaff();
    return { customer, staff, id: (created.body as { ticket: { id: string } }).ticket.id };
  }

  it('hands the ticket to the customer when an agent replies', async () => {
    const { staff, id } = await conversation();
    const response = await authed('post', `/api/tickets/${id}/messages`, staff).send({
      body: 'Stop the print spooler, clear the queue folder, then start it again.',
    });
    expect((response.body as { ticket: { status: string } }).ticket.status).toBe(
      'awaiting_customer',
    );
  });

  it('stops the first-response clock once, at the first public staff reply', async () => {
    const { staff, id } = await conversation();
    await authed('post', `/api/tickets/${id}/messages`, staff).send({ body: 'First reply' });
    const first = (await Ticket.findById(id).lean())?.sla.firstRespondedAt;
    expect(first).toBeInstanceOf(Date);

    await authed('post', `/api/tickets/${id}/messages`, staff).send({ body: 'Second reply' });
    expect((await Ticket.findById(id).lean())?.sla.firstRespondedAt).toEqual(first);
  });

  it('puts the ticket back in the queue when the customer answers', async () => {
    const { customer, staff, id } = await conversation();
    await authed('post', `/api/tickets/${id}/messages`, staff).send({ body: 'Have you tried…' });

    const response = await authed('post', `/api/customer/tickets/${id}/messages`, customer).send({
      body: 'ba3ed fi mushkle',
    });
    expect((response.body as { ticket: { status: string } }).ticket.status).toBe('in_progress');
  });

  it('refuses a message on a closed ticket', async () => {
    const { customer, staff, id } = await conversation();
    await authed('post', `/api/tickets/${id}/status`, staff).send({ to: 'closed' });

    const response = await authed('post', `/api/customer/tickets/${id}/messages`, customer).send({
      body: 'one more thing',
    });
    expect(response.status).toBe(409);
  });
});

/* ── Transitions ────────────────────────────────────────────────────────── */

describe('POST /tickets/:id/status', () => {
  async function resolved() {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const created = await openTicket(customer);
    const id = (created.body as { ticket: { id: string } }).ticket.id;
    const staff = await signInStaff();
    await authed('post', `/api/tickets/${id}/status`, staff).send({ to: 'resolved' });
    return { customer, staff, id };
  }

  it('lets a customer reopen a resolved ticket', async () => {
    const { customer, id } = await resolved();
    const response = await authed('post', `/api/customer/tickets/${id}/status`, customer).send({
      to: 'reopened',
    });

    expect(response.status).toBe(200);
    const ticket = await Ticket.findById(id).lean();
    expect(ticket?.status).toBe('reopened');
    expect(ticket?.reopenedCount).toBe(1);
    /* Leaving the timestamp behind would make every time-to-resolution
       report wrong. */
    expect(ticket?.resolvedAt).toBeUndefined();
  });

  it('refuses a transition the state machine forbids', async () => {
    const { customer, id } = await resolved();
    const response = await authed('post', `/api/customer/tickets/${id}/status`, customer).send({
      to: 'in_progress',
    });
    expect(response.status).toBe(422);
    expect((response.body as { error: { code: string } }).error.code).toBe('invalid_transition');
  });

  it('tells the client which transitions are available', async () => {
    const { customer, id } = await resolved();
    const response = await authed('get', `/api/customer/tickets/${id}`, customer);
    expect((response.body as { allowedTransitions: string[] }).allowedTransitions).toEqual([
      'reopened',
    ]);
  });

  /* The expected status is part of the update query, so two agents clicking
     at the same instant produce one success and one conflict rather than two
     successes and a doubled status history. */
  it('answers the second of two simultaneous resolves with a conflict', async () => {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const created = await openTicket(customer);
    const id = (created.body as { ticket: { id: string } }).ticket.id;
    const staff = await signInStaff();

    const [first, second] = await Promise.all([
      authed('post', `/api/tickets/${id}/status`, staff).send({ to: 'resolved' }),
      authed('post', `/api/tickets/${id}/status`, staff).send({ to: 'resolved' }),
    ]);

    const codes = [first.status, second.status].sort();
    expect(codes).toEqual([200, 409]);
    expect((await Ticket.findById(id).lean())?.statusHistory).toHaveLength(2);
  });

  it('records an escalation under its own audit action', async () => {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const created = await openTicket(customer);
    const id = (created.body as { ticket: { id: string } }).ticket.id;
    const staff = await signInStaff();

    await authed('post', `/api/tickets/${id}/status`, staff).send({ to: 'escalated' });
    expect(await AuditLog.countDocuments({ action: 'ticket.escalated' })).toBe(1);
  });
});

/* ── CSRF and authentication ────────────────────────────────────────────── */

describe('guards', () => {
  it('refuses an unauthenticated read', async () => {
    expect((await request(app).get('/api/customer/tickets')).status).toBe(401);
    expect((await request(app).get('/api/tickets')).status).toBe(401);
  });

  /* These routes authenticate with a bearer header, which another origin
     cannot set on a cross-origin request — so there is no ambient credential
     to abuse and no CSRF check. The property worth asserting is the one that
     actually holds: the cookies alone get you nothing.

     Worth knowing why this is not tested the other way round: an earlier
     version did apply `requireCsrfToken` here and these tests passed, because
     supertest attaches whatever cookie it is handed and ignores the cookie's
     `path`. A browser does not — the CSRF cookie is scoped to `/api/auth` —
     and every write failed the first time the stack was driven by hand. */
  it('refuses a write carrying session cookies but no bearer token', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');

    const response = await request(app)
      .post('/api/customer/tickets')
      .set('Cookie', [`${REFRESH_COOKIE}=${session.refresh}`, `${CSRF_COOKIE}=${session.csrf}`])
      .set(CSRF_HEADER, session.csrf)
      .send({ subject: 'Cookies only', body: 'should fail' });

    expect(response.status).toBe(401);
    expect(await Ticket.countDocuments({})).toBe(0);
  });

  /* Two token shapes, two guards. A customer token must not open a staff
     route even though both routers are the same code. */
  it('refuses a customer token on the staff mount', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    expect((await authed('get', '/api/tickets', session)).status).toBe(401);
  });

  it('refuses a staff token on the customer mount', async () => {
    const session = await signInStaff();
    expect((await authed('get', '/api/customer/tickets', session)).status).toBe(401);
  });

  it('refuses an id that is not an id', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    expect((await authed('get', '/api/customer/tickets/not-an-id', session)).status).toBe(400);
  });
});

/* ── Rate limits (checklist 13.1) ───────────────────────────────────────── */

describe('rate limits', () => {
  it('refuses a flood of ticket creation with Retry-After', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');

    /* The limit is 20 an hour; a customer opening six is already unusual, so
       this is a ceiling on automation rather than a quota. */
    const responses = [];
    for (let attempt = 0; attempt < 22; attempt += 1) {
      responses.push(await openTicket(session, `Subject ${String(attempt)}`));
    }

    const limited = responses.filter((response) => response.status === 429);
    expect(limited.length).toBeGreaterThan(0);
    /* Visible, not silent: a client that cannot see the limit retries into a
       wall, which is worse for the server than being told to wait. */
    expect(Number(limited[0]?.headers['retry-after'])).toBeGreaterThan(0);
    expect(await Ticket.countDocuments({})).toBe(20);
  });

  /* Several colleagues behind one office NAT must not share a budget, and one
     compromised account must not get a fresh one by changing address. */
  it('charges the limit to the account, not the address', async () => {
    await createCustomer('+96170100001');
    await createCustomer('+96171100002');
    const first = await signInCustomer('+96170100001');

    for (let attempt = 0; attempt < 21; attempt += 1) {
      await openTicket(first, `Subject ${String(attempt)}`);
    }
    expect((await openTicket(first, 'One more')).status).toBe(429);

    const second = await signInCustomer('+96171100002');
    expect((await openTicket(second, 'A different account')).status).toBe(201);
  });
});

/* ── What leaves the system ─────────────────────────────────────────────── */

describe('the response shape', () => {
  it('never exposes internal ids to a customer', async () => {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const created = await openTicket(customer);
    const id = (created.body as { ticket: { id: string } }).ticket.id;

    const staff = await signInStaff();
    await authed('post', `/api/tickets/${id}/assign`, staff).send({
      staffId: String((await StaffUser.findOne({}).lean())?._id),
    });

    const response = await authed('get', `/api/customer/tickets/${id}`, customer);
    const text = JSON.stringify(response.body);
    /* An employee's id has no use to a customer and identifies a person. */
    expect(text).not.toContain('assignedStaffId');
    expect(text).not.toContain('customerId');
    expect(text).not.toContain('statusHistory');
  });
});
