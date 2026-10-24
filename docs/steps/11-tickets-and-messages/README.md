# Step 11 — Tickets, messages, and real-time updates

**Phase 4. Status: complete and verified** against the test suite and the
running Compose stack on 2026-10-24.

## Goal

The conversation itself: a customer opens a ticket, an agent answers, both see
it happen live — and neither sees anything they should not.

The whole step is really about one sentence from `CLAUDE.md`:

> Object-level authorization lives in the repository layer, which is what makes
> the cross-customer access tests meaningful.

---

## 1. What was built

```
apps/server/src/
├── repositories/scope.ts         who is asking — required by every read
├── repositories/tickets.ts       queries with the ownership clause built in
├── repositories/messages.ts      reachable only through their ticket
├── services/tickets.ts           the state machine, creation, assignment
├── services/messages.ts          posting, and what it does to the ticket
├── services/audit-scope.ts       scope → audit actor
├── http/rate-limit-middleware.ts the ordinary per-account layer (13.1)
├── routes/tickets.ts             one router, mounted twice
├── realtime/events.ts            what the HTTP layer announces
└── realtime/socket.ts            authenticated Socket.IO, authorised rooms
db/models/governance.ts           + Counter, for human-readable references
infra/nginx/nginx.conf            the websocket upgrade
```

---

## 2. Authorization is a type, not a convention

A check that has to be remembered in forty handlers will be forgotten in one.
So there is no repository function that reads a ticket without a `Scope`:

```ts
export type Scope =
  | { kind: 'customer'; customerId: string }
  | { kind: 'staff'; staffId: string; role: StaffRole }
  | { kind: 'system'; reason: string };
```

It is not that the check is written everywhere and remembered each time — it is
that **the query cannot be built without it**. `system` is named rather than
implied by a missing scope, so "this query has no owner constraint" is always a
deliberate word in the source, and greppable.

### 2.1 The ownership clause is spread last

```ts
return { ...filter, ...ticketOwnershipFilter(scope) };
```

With the spread the other way round this is an account takeover through a query
string: a caller-supplied `customerId` would overwrite the one derived from
their session. The ordering is the security control, so there is a test that
sends exactly that query.

In fact the query is refused outright — the list schema is a `strictObject`, so
an unknown filter is a 400 rather than something silently ignored. A client
asking for `?customerId=…` should be told it is not a filter.

### 2.2 Not found, never forbidden

A 403 on someone else's ticket confirms that the ticket exists. References are
sequential, so that turns `CSAS-000001` upwards into a census of the customer
base and a timeline of when each arrived. A caller who may not see a ticket and
a caller asking for an id that does not exist get the same 404 — proved on the
live stack, not only in tests:

```
GET their ticket     → 404
GET a random id      → 404
POST to their ticket → 404
their own list       → {"tickets":[]}
?customerId= probe   → 400
```

### 2.3 Unauthorised writes are no-ops, not failures after the fact

Every write goes through `findOneAndUpdate` with the scope merged into the
filter, so an unauthorised write matches nothing and reports not-found. A
read-then-write would also be a race — two agents resolving the same ticket at
once.

---

## 3. The state machine

One table says who may move a ticket from where to where. Without it, "can this
be resolved?" is answered by whichever handler is running, and the answers
diverge: a customer closing a ticket by one path that an agent cannot by
another.

A customer has exactly **two** moves: reopening a resolved ticket, and replying
to one that was waiting on them. `closed` is terminal for everyone — step 13's
reopen window creates a *new* ticket linked to the old one, because allowing a
transition out of `closed` lets an auto-close job and a customer fight over one
record indefinitely.

### 3.1 The bug the table caught

`postMessage` applies a transition on the customer's behalf when they reply.
The table listed that edge as `['staff', 'system']` — so the message path was
making a move the state machine forbade, and the two disagreed about who may do
what. A test comparing them found it:

```
awaiting_customer → in_progress: expected false to be true
```

The customer is a genuine actor there, not just a trigger, so the **table** was
wrong — not the message path, which is the opposite of the instinct on seeing a
permission check fail. Written up in full, including why neither component's
own tests could see it:
[`docs/findings/01-state-machine-divergence.md`](../../findings/01-state-machine-divergence.md).

### 3.2 Concurrency

The expected status is part of the update query, so two agents clicking
"resolve" at the same instant produce one `200` and one `409`, with one entry in
the status history rather than two. There is a test that fires both at once.

---

## 4. Internal notes

Excluded **in the query**, never filtered out of the result. A post-filter
leaves the note in memory, in the log of a slow query, and one forgotten
`.map()` away from being sent.

The same rule governs the socket: an internal note is broadcast to the staff
room and to **no ticket room**, because a ticket room contains the customer.
Sending it to the room and not rendering it in the browser is not a security
control — the note would be on the customer's machine.

A customer who sends `internal: true` gets a 403 rather than a silent downgrade
to a public message. They are either probing or using a broken client, and
quietly publishing what they believed was private is the worse failure.

And a note does not move the ticket or stop the first-response clock. It is
staff talking to each other, not an answer.

---

## 5. Real-time

**The handshake is the authentication boundary.** A connection with no valid
token is refused before any handler runs, so no anonymous socket ever exists and
no listener has to remember an `if (!socket.user)`.

**The session family is checked, not just the signature.** This matters more
here than over HTTP: a socket is long-lived, so without it "log out" would mean
"stop receiving updates in a quarter of an hour", and the connection would
outlive the logout by longer than any request could.

**Joining a room is an authorisation decision taken by the same function the
REST handlers use.** A separate socket-side check is how the two drift apart,
and the socket side is the one nobody re-reads.

The routers depend on a `TicketEvents` interface rather than on Socket.IO, so
route tests need no server, port or transport. Startup has a genuine dependency
cycle — sockets need the HTTP server, which needs the app, whose routers need
somewhere to announce — and `DeferredTicketEvents` is where it is cut.

---

## 6. Three bugs found by running it

The suite was green before all three.

**The CSRF check did not belong here at all.** I had put `requireCsrfToken()` on
the ticket writes. The integration tests passed — because supertest attaches
whatever cookie it is handed and ignores the cookie's `path`. A browser does
not: the CSRF cookie is scoped to `/api/auth`, so it never reaches these routes
and **every write failed with `csrf_failed`** the first time I drove the stack by
hand.

The fix was to remove the check, not to widen the cookie. CSRF is an attack on
*ambient* credentials; these routes authenticate with an `Authorization` header,
which another origin cannot set without CORS permission this server does not
grant. Widening the cookie would have spread a credential further for no gain.
The existing comment in `cookies.ts` already said so.

**The websocket never upgraded.** `infra/nginx/nginx.conf` had a `/socket.io/`
block written before the server existed; the server mounts at
`/api/socket.io`, and nginx picks the longest matching prefix, so every
handshake matched the plain `/api/` block, was proxied as HTTP without the
`Upgrade` headers, and failed with `Unexpected server response: 400`. The unit
tests could not see it — they connect to the Node server directly, with no
proxy in between.

**Mongoose 9 deprecations.** `{ new: true }` on `findOneAndUpdate` now warns;
it is `{ returnDocument: 'after' }`. Caught because a warning in test output is
noise that trains people to ignore output.

---

## 6a. And a smoke test, so it cannot happen again

All three of those bugs lived in a layer the test suite cannot reach, and the
suite was green the whole time. `npm run smoke` walks one conversation through
the **published port** with a real cookie jar that honours `path`, a real
websocket through nginx, and no imports from `apps/` at all. 23 checks, two
seconds.

It is deliberately thin — it proves the seams and leaves behaviour to the tests
that can cover it properly. Both step 11 bugs were reintroduced to confirm it
actually catches them:

| Bug reintroduced | Unit tests | Smoke |
| :-- | :-- | :-- |
| `requireCsrfToken` back on the ticket routes | 34 passed | **FAIL** `403 csrf_failed` |
| nginx's `/api/socket.io/` upgrade block removed | 34 passed | **FAIL** ×3, websocket error |

It replaces the two hand-written `curl` assertions in CI's compose job.

## 7. Security controls, and the test proving each

| Control | Test |
| :-- | :-- |
| A customer cannot read another's ticket | `tickets.test.ts` — detail, list, messages |
| …or write to it, or move it | same, asserting nothing changed |
| …and cannot tell it apart from a nonexistent one | identical 404s, asserted side by side |
| …and cannot widen scope through the query string | `?customerId=` → 400 |
| Internal notes never reach a customer over HTTP | query-level exclusion |
| …or over the socket | a customer in the room hears nothing |
| A customer cannot author an internal note | 403, and no document written |
| The handshake refuses anonymous, forged and revoked tokens | `socket.test.ts` |
| A customer cannot join another's room | same function as the REST guard |
| Staff-room events never reach a customer | plus the converse, so it cannot pass vacuously |
| Reference allocation is race-free | 8 concurrent creates, 8 distinct references |
| Simultaneous resolves do not double-apply | `[200, 409]`, one history entry |
| The audit log records the reference, never the body | asserted on the entry's JSON |
| Internal ids do not leak to customers | explicit projection, asserted absent |
| Rate limits on every ticket route (checklist 13.1) | flood refused with `Retry-After`; charged per account, not per address |

The audit log deliberately has **no entry per ordinary message**. It records
decisions and access to personal data; one row per chat line would bury those
in noise, and the conversation is itself the record.

---

## 8. How to verify

```bash
npm run test -w @csas/server     # 425 tests
npm run up                       # then the flow below
```

Sign in as the seeded customer `+96170100001` (the code is in the dev inbox —
it is never logged), open a ticket, then sign in as `admin@csas.local` and
reply. Watch the status move to `awaiting_customer`, and the internal note
reach staff only.

### What the run produced

```
anonymous: refused — unauthenticated
customer: connected
customer: join own ticket     → {"ok":true}
customer: join a random ticket → {"ok":false}
staff:    connected
agent public reply → awaiting_customer

customer received: ["Stop the print spooler, clear the queue folder, …"]
staff received   : ["Stop the print spooler, clear the queue folder, …",
                    "Internal: known 4.1 spooler regression, see KB-0412."]
```

and afterwards:

```
status: awaiting_customer | firstRespondedAt: 2026-10-24T10:52:48.403Z
allowed: ['in_progress']
```

In Compass: `tickets` has one document with `reference: "CSAS-000001"` and two
entries in `statusHistory`; `counters` has `{_id: "ticket", value: 1}`;
`messages` has three, one with `internal: true`.

---

## 9. Test results

```
$ npm run verify
secret-scan: clean (tracked files)
personal-data-scan: clean — 101 protected passages, none present in tracked files
contrast-check: every pair meets WCAG 2.1 AA
 Test Files  38 passed (38)
      Tests  708 passed (708)
```

---

## 10. What this step does not do

- **No SLA timers.** The fields exist and `firstRespondedAt` is set, but nothing
  computes a due date or escalates. Step 14.
- **No attachments.** Step 12.
- **No assistant.** Every reply here is a human. `assistant_answering` is in the
  state machine and only the system may enter it; Phase 5 makes it reachable.
- **No automatic assignment.** An agent can claim a ticket and an admin can
  assign one; the rota is step 14.
- **No client UI.** The components exist from step 10 but no screen uses them
  yet — step 13 builds history and detail.
- **The rate limits are starting values**, not thresholds tuned against real
  traffic. They are a ceiling on automation — 20 tickets an hour, 60 messages a
  minute — chosen so no real person meets them.
- **No pagination beyond a keyset `before`.** The list caps at 100 and has no
  total count; step 13 adds filters that need one.

---

## 11. What you must configure

Nothing. The seeded customers and `admin@csas.local` already exist.

---

## 12. Checklist

- [x] Tickets with human-readable, race-free references
- [x] Messages, with internal notes invisible to customers in the query
- [x] An explicit state machine, with who may make each move
- [x] Object-level authorization in the repository layer, impossible to skip
- [x] Cross-customer access returns 404, never 403
- [x] Authenticated Socket.IO handshake, checking the session family
- [x] Room authorization through the same function as the REST guard
- [x] Internal notes never broadcast to a room containing the customer
- [x] Rate limits on every route, closing checklist 13.1
- [x] The application actually run end to end, and three bugs found by doing so
