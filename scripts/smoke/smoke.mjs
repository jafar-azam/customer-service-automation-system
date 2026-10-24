#!/usr/bin/env node
/**
 * One walk through the running stack, from outside it.
 *
 * Every test in this repository talks to Express directly or to Node directly.
 * That is the right default — it is fast, it is deterministic, and it does not
 * need Docker. It also cannot see the layer the product actually ships behind,
 * and three bugs in step 11 lived exactly there:
 *
 *   - supertest attaches whatever cookie it is handed and ignores the cookie's
 *     `path`, so a CSRF cookie scoped to `/api/auth` looked like it reached
 *     every route. In a browser it does not, and every ticket write failed.
 *   - the Socket.IO tests connect to the Node server directly, so nginx's
 *     missing websocket `Upgrade` block was invisible. Through the proxy every
 *     handshake failed with 400.
 *   - the client container served a stale dependency set behind a named
 *     volume, which no test could observe at all.
 *
 * The suite was green while the product was broken. This script exists to make
 * that specific failure mode impossible to repeat: it uses a real HTTP client
 * with a real cookie jar, goes through the published port only, and never
 * imports anything from `apps/`.
 *
 * It is deliberately thin. It is not a second test suite — it proves the
 * seams, and leaves behaviour to the tests that can cover it properly.
 *
 *   npm run smoke          # against an already-running stack
 *   BASE=http://host:port npm run smoke
 */
import { io } from 'socket.io-client';
import { TOTP, Secret } from 'otpauth';
import { readFileSync } from 'node:fs';

const BASE = process.env['BASE'] ?? 'http://localhost:8080';
const TIMEOUT_MS = 15_000;

/* ── A cookie jar that honours `path`, because that is the whole point ──────
   A browser will not send a cookie scoped to /api/auth to /api/tickets. Any
   client here that ignores that reproduces the bug this script exists to
   catch, so the jar is implemented rather than borrowed. */

const jar = new Map();

function storeCookies(response) {
  for (const header of response.headers.getSetCookie?.() ?? []) {
    const [pair, ...attributes] = header.split(';');
    const [name, value] = pair.split('=');
    const path =
      attributes
        .map((attribute) => attribute.trim())
        .find((attribute) => attribute.toLowerCase().startsWith('path='))
        ?.slice(5) ?? '/';
    jar.set(name.trim(), { value: value ?? '', path });
  }
}

function cookieHeaderFor(pathname) {
  const sendable = [...jar.entries()].filter(([, cookie]) => pathname.startsWith(cookie.path));
  return sendable.map(([name, cookie]) => `${name}=${cookie.value}`).join('; ');
}

export function readCookie(name) {
  return jar.get(name)?.value;
}

async function call(method, path, { token, body, headers = {} } = {}) {
  const cookies = cookieHeaderFor(path);
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(cookies === '' ? {} : { cookie: cookies }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  storeCookies(response);
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

/* ── Reporting ─────────────────────────────────────────────────────────── */

const results = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  const mark = condition ? '  ok ' : ' FAIL';
  console.log(`${mark}  ${name}${detail === '' ? '' : `  — ${detail}`}`);
  return Boolean(condition);
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function demoTotp() {
  const secret = /^DEMO_ADMIN_TOTP_SECRET=(.+)$/m.exec(readFileSync('.env', 'utf8'))?.[1];
  if (!secret) throw new Error('DEMO_ADMIN_TOTP_SECRET is not in .env');
  return new TOTP({ secret: Secret.fromBase32(secret.trim()) }).generate();
}

function adminCredentials() {
  const env = readFileSync('.env', 'utf8');
  return {
    email: /^SEED_ADMIN_EMAIL=(.+)$/m.exec(env)?.[1]?.trim(),
    password: /^SEED_ADMIN_PASSWORD=(.+)$/m.exec(env)?.[1]?.trim(),
  };
}

/** Runs a snippet inside the server container, which holds the credentials. */
async function inServer(snippet) {
  const { execFileSync } = await import('node:child_process');
  return execFileSync('docker', ['compose', 'exec', '-T', 'server', 'node', '-e', snippet], {
    encoding: 'utf8',
  }).trim();
}

/**
 * Clears the rate-limit counters before the walk.
 *
 * Both layers get in the way otherwise, and both failures look alarming while
 * being the limiter working correctly:
 *
 *   - ticket creation is capped at twenty an hour and this makes one per run;
 *   - a one-time code is capped at five an hour, and once that trips the
 *     script reads a *stale* code out of the inbox, sign-in fails, and every
 *     later check fails for a reason that has nothing to do with the seam it
 *     was testing.
 *
 * That second one is the dangerous shape: a cascade of red with a misleading
 * cause is what trains people to stop reading the output.
 *
 * Clearing is safe precisely because this script does not test the limiter.
 * The limits have their own tests, including a flood asserting the 429 and the
 * `Retry-After` header. This tests the seams between proxy, server and
 * browser, and it must not be able to exhaust itself.
 */
async function resetRateLimits() {
  await inServer(
    'const Redis=require("ioredis");(async()=>{' +
      'const c=new Redis(process.env.REDIS_URL);' +
      'const keys=await c.keys("rl:*");' +
      'if(keys.length>0)await c.del(...keys);' +
      'await c.quit();})();',
  );
}

/**
 * The OTP is never logged and never returned, so it is read the way a
 * reviewer reads it: out of the dev inbox, through the API the dev-inbox page
 * will use. Until that page exists (step 16) this reaches into the container.
 */
async function latestOtp() {
  return inServer(
    'const m=require("mongoose");(async()=>{await m.connect(process.env.MONGODB_URI);' +
      'const n=await m.connection.db.collection("notifications").find({kind:"otp"})' +
      '.sort({createdAt:-1}).limit(1).toArray();' +
      'console.log(/(\\d{6})/.exec(n[0].preview)[1]);await m.disconnect();})();',
  );
}

function connectSocket(token) {
  const socket = io(BASE, {
    path: '/api/socket.io',
    transports: ['websocket'],
    reconnection: false,
    ...(token === undefined ? {} : { auth: { token } }),
  });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ socket, connected: false, error: 'timeout' });
    }, TIMEOUT_MS);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve({ socket, connected: true });
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      resolve({ socket, connected: false, error: error.message });
    });
  });
}

function nextEvent(socket, event, ms = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/* ── The walk ──────────────────────────────────────────────────────────── */

async function main() {
  console.log(`smoke: ${BASE}\n`);
  const sockets = [];
  await resetRateLimits();

  /* 1. The proxy is up and routing to the API, not to the SPA shell. */
  const version = await call('GET', '/api/version');
  check(
    'the API answers through the proxy',
    version.body?.name === 'csas-server',
    version.body?.version,
  );

  /* nginx returns 404 here rather than letting it fall through to the client,
     which would answer 200 with the app shell and look like an exposed
     metrics endpoint to anyone auditing the proxy. */
  const metrics = await call('GET', '/metrics');
  check('the metrics endpoint is not exposed', metrics.status === 404, `got ${metrics.status}`);

  const index = await call('GET', '/');
  check('the client is served at the root', index.status === 200);

  /* 2. Customer sign-in, with a cookie jar that honours `path`. */
  const phone = '+96170100001';
  const requested = await call('POST', '/api/auth/customer/request-code', { body: { phone } });
  check('a code can be requested', requested.status === 202);

  const code = await latestOtp();
  const verified = await call('POST', '/api/auth/customer/verify', { body: { phone, code } });
  const customerToken = verified.body?.accessToken;
  check('the code signs the customer in', Boolean(customerToken));

  /* 3. The bug class. The CSRF cookie is scoped to /api/auth, so a browser
        never sends it to /api/customer/tickets. A write must still succeed,
        because these routes authenticate with a bearer header. */
  const csrfPath = jar.get('csas_csrf')?.path;
  check('the CSRF cookie is scoped to /api/auth', csrfPath === '/api/auth', csrfPath);
  check(
    'the ticket routes receive no CSRF cookie',
    cookieHeaderFor('/api/customer/tickets') === '',
    `would send: "${cookieHeaderFor('/api/customer/tickets')}"`,
  );

  const created = await call('POST', '/api/customer/tickets', {
    token: customerToken,
    body: {
      subject: 'Smoke test ticket',
      body: 'el printer 3am ya3mel error ba3ed l update',
      inputForm: 'arabizi',
    },
  });
  const ticket = created.body?.ticket;
  check(
    'a ticket can be opened without a CSRF cookie',
    created.status === 201,
    `${created.status} ${created.body?.error?.code ?? ''}`,
  );
  check(
    'it gets a human-readable reference',
    /^CSAS-\d{6}$/.test(ticket?.reference ?? ''),
    ticket?.reference,
  );

  /* 4. A request with no bearer token must still be refused. */
  const anonymous = await call('POST', '/api/customer/tickets', {
    body: { subject: 'No token', body: 'should fail' },
  });
  check('an unauthenticated write is refused', anonymous.status === 401, `got ${anonymous.status}`);

  /* 5. Staff sign-in. */
  const { email, password } = adminCredentials();
  const login = await call('POST', '/api/auth/login', {
    body: { email, password, totp: demoTotp() },
  });
  const staffToken = login.body?.accessToken;
  check('staff can sign in with TOTP', Boolean(staffToken), login.body?.error?.code ?? '');

  /* 6. The websocket, through the proxy. This is the second bug class: nginx
        has to upgrade the connection, and nothing in the test suite goes
        through nginx at all. */
  const anonSocket = await connectSocket();
  sockets.push(anonSocket.socket);
  check(
    'an anonymous websocket is refused, not dropped',
    !anonSocket.connected && anonSocket.error === 'unauthenticated',
    anonSocket.error,
  );

  const customerSocket = await connectSocket(customerToken);
  sockets.push(customerSocket.socket);
  check(
    'the websocket upgrades through nginx',
    customerSocket.connected,
    customerSocket.error ?? 'connected',
  );

  if (customerSocket.connected) {
    const mine = await customerSocket.socket.emitWithAck('ticket.join', ticket.id);
    check('the owner can join their ticket room', mine?.ok === true);

    const theirs = await customerSocket.socket.emitWithAck(
      'ticket.join',
      '507f1f77bcf86cd799439011',
    );
    check('a ticket they do not own is refused', theirs?.ok === false);
  }

  const staffSocket = await connectSocket(staffToken);
  sockets.push(staffSocket.socket);
  check('staff can open a websocket', staffSocket.connected, staffSocket.error ?? 'connected');

  /* 7. A message crosses HTTP and arrives over the socket, and an internal
        note does not reach the customer. */
  if (customerSocket.connected && staffSocket.connected) {
    const heardByCustomer = nextEvent(customerSocket.socket, 'message.posted');
    const heardByStaff = nextEvent(staffSocket.socket, 'message.posted');

    const replied = await call('POST', `/api/tickets/${ticket.id}/messages`, {
      token: staffToken,
      body: { body: 'Stop the print spooler, then start it again.' },
    });
    check('an agent can reply', replied.status === 201);
    check(
      'the reply moves the ticket to awaiting_customer',
      replied.body?.ticket?.status === 'awaiting_customer',
      replied.body?.ticket?.status,
    );

    check('the customer receives it live', (await heardByCustomer) !== null);
    check('staff receive it live', (await heardByStaff) !== null);

    const noteToCustomer = nextEvent(customerSocket.socket, 'message.posted', 1200);
    const noteToStaff = nextEvent(staffSocket.socket, 'message.posted', 1200);
    await call('POST', `/api/tickets/${ticket.id}/messages`, {
      token: staffToken,
      body: { body: 'Internal: known spooler regression.', internal: true },
    });
    check('an internal note never reaches the customer', (await noteToCustomer) === null);
    check('an internal note does reach staff', (await noteToStaff) !== null);
  }

  /* 8. The customer's own view excludes the note. */
  const conversation = await call('GET', `/api/customer/tickets/${ticket.id}/messages`, {
    token: customerToken,
  });
  const bodies = (conversation.body?.messages ?? []).map((message) => message.body).join(' ');
  check(
    'the note is absent from the customer conversation',
    !bodies.includes('Internal:'),
    `${conversation.body?.messages?.length ?? 0} messages`,
  );

  for (const socket of sockets) socket.disconnect();

  /* ── Verdict ─────────────────────────────────────────────────────────── */
  const failed = results.filter((result) => !result.ok);
  console.log('');
  if (failed.length === 0) {
    console.log(`smoke: all ${results.length} checks passed`);
    return 0;
  }
  console.error(`smoke: ${failed.length} of ${results.length} checks failed`);
  for (const failure of failed) console.error(`  ${failure.name}`);
  return 1;
}

/**
 * Exits explicitly rather than letting the event loop drain.
 *
 * A disconnected Socket.IO client still holds engine timers, so the process
 * sat there for two minutes after printing its verdict — invisible by hand and
 * a hung job in CI. `process.exit` is wrong in a library and right in a CLI
 * that has already said everything it is going to say; `stdout.write` is
 * flushed first, because exiting can truncate a buffered pipe.
 */
main()
  .then((code) => {
    process.stdout.write('', () => {
      process.exit(code);
    });
  })
  .catch((error) => {
    console.error(`smoke: ${error.message}`);
    process.exit(1);
  });
