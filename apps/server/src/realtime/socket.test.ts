import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { normalizePhone } from '@csas/shared';
import request from 'supertest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { PhoneCipher } from '../crypto/phone.js';
import { Contract, Customer, StaffUser } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { clearTestRedis, startTestRedis, stopTestRedis } from '../db/test-redis.js';
import { CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from '../http/cookies.js';
import { createMetrics } from '../observability/metrics.js';
import { hashPassword } from '../services/auth/password.js';
import { revokeFamily } from '../services/auth/tokens.js';
import { otpCodeFor, silentLogger, testEnv } from '../test-support.js';
import { DeferredTicketEvents, STAFF_ROOM, ticketRoom } from './events.js';
import { createRealtime } from './socket.js';

/**
 * A real server, a real socket.
 *
 * The claims here — "an unauthenticated handshake is refused", "a customer
 * cannot join another customer's room" — are enforced by Socket.IO's
 * middleware and room machinery. Mocking either would test the mock.
 */

const env = testEnv({ DEMO_MODE: 'true', DEMO_ADMIN_TOTP_SECRET: 'A'.repeat(32) });
const PASSWORD = 'fourteen purple lanterns upstairs'; // secret-scan:allow

let httpServer: HttpServer;
let url: string;
let closeRealtime: () => Promise<void>;
let app: ReturnType<typeof createApp>;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  await startTestDatabase();
  await startTestRedis();

  const deferred = new DeferredTicketEvents();
  app = createApp({
    env,
    version: '0.1.0',
    logger: silentLogger(),
    metrics: createMetrics({ collectDefaults: false }),
    events: deferred,
  });
  httpServer = createServer(app.express);
  const realtime = createRealtime({ env, logger: silentLogger(), httpServer });
  deferred.bind(realtime.events);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${String((httpServer.address() as AddressInfo).port)}`;
  closeRealtime = async () => {
    await realtime.io.close();
    await new Promise<void>((resolve) =>
      httpServer.close(() => {
        resolve();
      }),
    );
  };
}, 180_000);

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await clearTestDatabase();
  await clearTestRedis();
});

afterAll(async () => {
  await closeRealtime();
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
  await request(app.express).post('/api/auth/customer/request-code').send({ phone });
  /* By recipient, not "the newest one". See `otpCodeFor`. */
  const code = await otpCodeFor(normalizePhone(phone));
  const response = await request(app.express)
    .post('/api/auth/customer/verify')
    .send({ phone, code });
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
  const response = await request(app.express)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD });
  return {
    token: (response.body as { accessToken: string }).accessToken,
    csrf: cookie(response, CSRF_COOKIE),
    refresh: cookie(response, REFRESH_COOKIE),
  };
}

function authed(method: 'get' | 'post', path: string, session: Session) {
  const call = request(app.express)
    [method](path)
    .set('authorization', `Bearer ${session.token}`)
    .set('Cookie', [`${REFRESH_COOKIE}=${session.refresh}`, `${CSRF_COOKIE}=${session.csrf}`]);
  return method === 'post' ? call.set(CSRF_HEADER, session.csrf) : call;
}

/** Connects, and resolves when the handshake either succeeds or is refused. */
async function openSocket(token?: string): Promise<ClientSocket> {
  const socket = connect(url, {
    path: '/api/socket.io',
    transports: ['websocket'],
    reconnection: false,
    ...(token === undefined ? {} : { auth: { token } }),
  });
  sockets.push(socket);
  await new Promise<void>((resolve) => {
    socket.on('connect', () => {
      resolve();
    });
    socket.on('connect_error', () => {
      resolve();
    });
  });
  return socket;
}

function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function openTicket(session: Session) {
  const response = await authed('post', '/api/customer/tickets', session).send({
    subject: 'Printer stopped after the update',
    body: 'el printer 3am ya3mel error',
    inputForm: 'arabizi',
  });
  return (response.body as { ticket: { id: string } }).ticket.id;
}

/* ── The handshake ──────────────────────────────────────────────────────── */

describe('the handshake is the authentication boundary', () => {
  /* Refused before any handler runs, so no anonymous socket ever exists and
     no listener has to remember an `if (!socket.user)`. */
  it('refuses a connection with no token', async () => {
    const socket = await openSocket();
    expect(socket.connected).toBe(false);
  });

  it('refuses a forged token', async () => {
    const socket = await openSocket('not.a.token');
    expect(socket.connected).toBe(false);
  });

  it('accepts a customer token', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const socket = await openSocket(session.token);
    expect(socket.connected).toBe(true);
  });

  it('accepts a staff token', async () => {
    const session = await signInStaff();
    const socket = await openSocket(session.token);
    expect(socket.connected).toBe(true);
  });

  /* A socket is long-lived, so this matters more here than over HTTP: without
     the family check, logging out would mean "stop receiving updates in a
     quarter of an hour", and the connection would outlive the logout by
     longer than any request could. */
  it('refuses a token whose session has been revoked', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');

    const payload = JSON.parse(
      Buffer.from(session.token.split('.')[1] ?? '', 'base64url').toString(),
    ) as { sid: string };
    await revokeFamily(payload.sid, 'logout');

    const socket = await openSocket(session.token);
    expect(socket.connected).toBe(false);
  });
});

/* ── Rooms ──────────────────────────────────────────────────────────────── */

describe('joining a ticket room is an authorization decision', () => {
  it('lets the owner join their own ticket', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const id = await openTicket(session);
    const socket = await openSocket(session.token);

    const ack = await socket.emitWithAck('ticket.join', id);
    expect(ack).toEqual({ ok: true });
  });

  /* The same repository function the REST handlers use. A separate socket-side
     check is how the two drift apart, and the socket side is the one nobody
     re-reads. */
  it('refuses another customer’s ticket', async () => {
    await createCustomer('+96170100001');
    await createCustomer('+96170100002');
    const owner = await signInCustomer('+96170100001');
    const id = await openTicket(owner);

    const intruder = await signInCustomer('+96170100002');
    const socket = await openSocket(intruder.token);

    expect(await socket.emitWithAck('ticket.join', id)).toEqual({ ok: false });
  });

  it('gives the same answer for a ticket that does not exist', async () => {
    await createCustomer('+96170100001');
    const session = await signInCustomer('+96170100001');
    const socket = await openSocket(session.token);

    expect(await socket.emitWithAck('ticket.join', '507f1f77bcf86cd799439011')).toEqual({
      ok: false,
    });
    expect(await socket.emitWithAck('ticket.join', 'not-an-id')).toEqual({ ok: false });
  });

  /* Queue-level events go to the staff room, and a customer is never in it.
     A single broadcast room is the easiest way to make exactly this mistake,
     and it would put one customer's ticket on another's screen. */
  it('does not deliver staff-room events to a customer', async () => {
    await createCustomer('+96170100001');
    await createCustomer('+96170100002');
    const owner = await signInCustomer('+96170100001');
    const id = await openTicket(owner);

    const other = await signInCustomer('+96170100002');
    const otherSocket = await openSocket(other.token);
    const heard = nextEvent(otherSocket, 'ticket.updated', 600);

    const staff = await signInStaff();
    await authed('post', `/api/tickets/${id}/status`, staff).send({ to: 'in_progress' });

    expect(await heard).toBeNull();
  });

  /* The owner, in the room, must still get it — otherwise the test above
     passes because nothing is delivered to anyone. */
  it('does deliver the same event to the owner in the room', async () => {
    await createCustomer('+96170100001');
    const owner = await signInCustomer('+96170100001');
    const id = await openTicket(owner);

    const socket = await openSocket(owner.token);
    await socket.emitWithAck('ticket.join', id);
    const heard = nextEvent<{ ticket: { status: string } }>(socket, 'ticket.updated');

    const staff = await signInStaff();
    await authed('post', `/api/tickets/${id}/status`, staff).send({ to: 'in_progress' });

    expect((await heard)?.ticket.status).toBe('in_progress');
  });
});

/* ── Delivery ───────────────────────────────────────────────────────────── */

describe('what each side receives', () => {
  it('delivers an agent reply to the customer in the room', async () => {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const id = await openTicket(customer);

    const socket = await openSocket(customer.token);
    expect(await socket.emitWithAck('ticket.join', id)).toEqual({ ok: true });

    const staff = await signInStaff();
    const received = nextEvent<{ message: { body: string } }>(socket, 'message.posted');
    await authed('post', `/api/tickets/${id}/messages`, staff).send({
      body: 'Stop the print spooler, then start it again.',
    });

    expect((await received)?.message.body).toContain('print spooler');
  });

  /* The note goes to the staff room and to no ticket room, because a ticket
     room contains the customer. Broadcasting and filtering in the browser
     would put the note on the customer's machine, where "the UI does not
     render it" is not a security control. */
  it('never delivers an internal note to the customer', async () => {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const id = await openTicket(customer);

    const socket = await openSocket(customer.token);
    await socket.emitWithAck('ticket.join', id);

    const staff = await signInStaff();
    const received = nextEvent(socket, 'message.posted', 600);
    await authed('post', `/api/tickets/${id}/messages`, staff).send({
      body: 'Escalating — known spooler bug.',
      internal: true,
    });

    expect(await received).toBeNull();
  });

  it('delivers the internal note to staff', async () => {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const id = await openTicket(customer);

    const staff = await signInStaff();
    const staffSocket = await openSocket(staff.token);
    const received = nextEvent<{ message: { body: string } }>(staffSocket, 'message.posted');

    await authed('post', `/api/tickets/${id}/messages`, staff).send({
      body: 'Escalating — known spooler bug.',
      internal: true,
    });

    expect((await received)?.message.body).toContain('Escalating');
  });

  /* A new ticket from one customer must not appear on another customer's
     screen; only staff hear about it. */
  it('announces a new ticket to staff and to no customer', async () => {
    await createCustomer('+96170100001');
    await createCustomer('+96170100002');
    const other = await signInCustomer('+96170100002');
    const otherSocket = await openSocket(other.token);
    const otherHeard = nextEvent(otherSocket, 'ticket.created', 600);

    const staff = await signInStaff();
    const staffSocket = await openSocket(staff.token);
    const staffHeard = nextEvent<{ ticket: { reference: string } }>(staffSocket, 'ticket.created');

    const owner = await signInCustomer('+96170100001');
    await openTicket(owner);

    expect((await staffHeard)?.ticket.reference).toMatch(/^CSAS-\d{6}$/);
    expect(await otherHeard).toBeNull();
  });

  it('stops delivering once a socket leaves the room', async () => {
    await createCustomer('+96170100001');
    const customer = await signInCustomer('+96170100001');
    const id = await openTicket(customer);

    const socket = await openSocket(customer.token);
    await socket.emitWithAck('ticket.join', id);
    socket.emit('ticket.leave', id);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const staff = await signInStaff();
    const received = nextEvent(socket, 'message.posted', 600);
    await authed('post', `/api/tickets/${id}/messages`, staff).send({ body: 'Anyone there?' });

    expect(await received).toBeNull();
  });
});

describe('room names', () => {
  /* The id, not the reference: references are sequential and guessable, and a
     room name is a capability if anything ever joins one by name. */
  it('uses the opaque id', () => {
    expect(ticketRoom('507f1f77bcf86cd799439011')).toBe('ticket:507f1f77bcf86cd799439011');
    expect(STAFF_ROOM).toBe('staff');
  });
});
