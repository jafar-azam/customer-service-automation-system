# Step 08 — Customer login by one-time code, and the contract gate

**Phase 2. Status: complete and verified** against the in-memory test
infrastructure and the running Compose stack on 2026-10-24.

## Goal

The first two steps of the reference sequence diagram: **Login**, then
**Check Maintenance Contract Status** — with the branch to the Contact page
when it is not active.

Customers have no password and cannot sign themselves up. An admin registers
them, and the only credential is possession of a number already on file. That
removes a whole class of breach and introduces a different problem: **every code
costs money to send**, and an unauthenticated endpoint that sends paid messages
is the exact shape of SMS-pumping fraud. Most of this step is about *not*
sending.

---

## 1. What was built

```
apps/server/src/
├── db/redis.ts                      connection + a critical readiness probe
├── db/test-redis.ts                 a real Redis for tests
├── services/rate-limit.ts           atomic layered limits, budget cap, kill switch
├── services/providers/messaging.ts  WhatsApp/SMS interface + mock → dev inbox
├── services/auth/otp.ts             issue, verify, and every reason not to send
├── services/contracts.ts            the entitlement check
└── routes/customer-auth.ts          request-code · verify · me · refresh · logout
```

Customer sessions reuse the staff mechanics — rotation, family revocation on
reuse, `httpOnly` cookie, CSRF — with a different token shape and a separate
guard.

## 2. Decisions, and what each one costs

### 2.1 Redis, because the counters have to be right under concurrency

Every limit here is read-increment-compare. In MongoDB that is a transaction
per request or a race; `INCR` is atomic by construction and returns the new
value in the same round trip. Redis is already in the stack for BullMQ, so this
is the right use of a dependency that exists rather than a new one.

It is registered as a **critical** readiness dependency. Without it the limits
cannot be enforced, and an endpoint that sends messages with its limits
disabled is worse than one that is down.

**Fixed windows, not sliding.** A sliding window costs a sorted set per key and
a cleanup pass, in exchange for preventing up to 2× the limit across a
boundary. That precision matters for a quota; it does not for "stop sending
paid messages to this number", where the order of magnitude is the point.

### 2.2 Five layers, because each catches what the others miss

| Layer | Limit | Catches |
| :-- | :-- | :-- |
| resend | 1 / 45 s | a mis-click, and a tight retry loop |
| per phone | 5 / hour | one number hammered from many addresses |
| per IP | 20 / hour | many numbers from one source — the pumping pattern |
| per prefix | 200 / hour | the whole country code, if the others are spread thin |
| daily cap | 500 / day | the bill, with a kill switch that is a hard stop |

Order matters: the most specific limit is charged first, so a flood against one
number cannot consume the shared per-IP budget. A test asserts exactly that —
four requests against one number spend two IP-layer slots, not four.

The daily cap is charged **only for sends that will really happen**, so a flood
of invented numbers cannot exhaust the day's allowance for real customers.

`messaging-lebanon.md` is blunt that "alerts alone are not a hard stop", so the
kill switch has no TTL: one that expired on its own would turn itself back on
at 3 a.m. while nobody was watching.

### 2.3 The same answer for a customer and a stranger

`202 {"status":"accepted"}` for a number that exists, one that does not, a
deactivated customer, and one suppressed by the kill switch. Verified live:
both bodies identical, and only one message written.

Two things *are* distinguishable, deliberately:

* **a malformed number → 400.** It says nothing about who is a customer, and
  silently accepting a typo means the person waits for a code that will never
  arrive;
* **a rate limit → 429 with `Retry-After`.** Hiding it would mean either
  sending anyway or lying about a retry that cannot work.

### 2.4 Parsing *is* the destination allow-list

The research asks to "validate full mobile numbers rather than accepting any
string beginning with `+961`". `normalizePhone` already does precisely that, so
the allow-list is not a second list to maintain — a number that will not parse
is a number no message is sent to. `+447700900123` is refused before any
database read.

### 2.5 The code: `randomInt`, peppered hash, counted before compared

`randomInt`, never `Math.random()` — a predictable code is not a factor at all.
The range is padded rather than trimmed so `000000` is as likely as any other
value; stripping leading zeros would quietly make a tenth of the space
unreachable.

Stored as a **peppered** SHA-256. Six digits is a million possibilities, which
is seconds of offline work against an unpeppered hash of a stolen table.

The attempt counter is incremented **before** the comparison, so a process that
dies mid-verification cannot hand back a free guess. Single use is enforced by
the update's filter, so two racing requests with the correct code cannot both
succeed.

### 2.6 The dev inbox shows the code — and that is a deliberate exception

The specification asks for a dev inbox "showing every message the system would
have sent (OTP codes, …)", because otherwise nobody can try the customer login
on a machine with no phone.

So `MockMessagingProvider` stores the full body **only when `DEMO_MODE` is on**.
With the flag off the body is stored with any six-digit run replaced by
`••••••`. The containment is the same as the demo TOTP secret: the environment
validator refuses `DEMO_MODE` when `NODE_ENV=production`, and there is a test
for that. The log line never carries the body at all, in either mode.

### 2.7 An expired contract is not an authentication failure

The gate **reports** the entitlement; it does not refuse the session. The
customer is who they say they are, and locking them out would leave them unable
to read their own history or even see why they were turned away. The sequence
diagram's "redirect to the Contact page" is a decision the client makes from
`entitlement.status`.

Four outcomes, because they need four different answers:

| | Means |
| :-- | :-- |
| `active` | carry on |
| `expired` | it ran out, and when |
| `not_started` | it begins later, and when |
| `none` | nothing on file |

`not_started` is separated from `expired` deliberately: telling someone whose
contract begins on Monday that they are "not covered" sends them to support to
argue about something nobody can fix.

### 2.8 The gate reads the dates, not the status field

`status` is maintained by a nightly job (step 31), so it is a cache of a fact
that changes on its own at midnight: a contract that lapsed an hour ago still
reads `active` until the job runs. The dates are the truth. The test fixtures
all store `status: 'active'` on expired contracts precisely to prove the gate
ignores it.

The one exception is `cancelled`, because cancellation is a decision rather
than a date — there the field wins.

### 2.9 Two token shapes, two guards

A customer token carries `kind: 'customer'` and **no role**; a staff token
carries a role and no `kind`. Each verifier rejects the other's shape, so
neither can be presented as the other. Both directions are tested, and the
routers are mounted separately so a change meant for one cannot reach the other
by falling through.

## 3. Tests with a real Redis, for the same reason as a real MongoDB

What this code claims is enforced *by Redis*: `INCR` is atomic, `EXPIRE` sets a
window that really expires, `TTL` reports what is left. A fake would assert
that the limiter calls the right methods — a weaker statement that would still
pass if the window never expired.

`ioredis-mock` was the obvious choice and was rejected twice over: it pins a
peer on ioredis 5 while this project is on 6, and it would reintroduce exactly
that gap. `redis-memory-server` runs a real server, like `mongodb-memory-server`
does for the database.

## 4. Security controls, and the test that proves each

| Control | Test |
| :-- | :-- |
| Identical response for a customer and a stranger | "answers identically for a number that is not a customer" |
| Nothing sent for a deactivated customer | "sends nothing for a customer who has been deactivated" |
| Destination allow-list | "refuses a number outside the allowed country" |
| Code stored only as a peppered hash | "stores the code only as a hash" |
| The code never reaches a log | "never writes the code to the log" |
| Resend cooldown | "refuses a second code inside the resend cooldown" |
| Layered limits are atomic | "cannot be beaten by parallel requests" (20 in parallel, 3 allowed) |
| An earlier layer's refusal does not spend a later one | "does not charge later layers once an earlier one refuses" |
| Unknown numbers do not spend the budget | "does not spend the daily budget on a number that is not a customer" |
| The kill switch is a hard stop with no TTL | two tests |
| Five attempts, then the challenge is dead | "stops accepting after the attempt limit" |
| The attempt is counted before the comparison | "counts the attempt before comparing, so a crash cannot gift a guess" |
| Single use | "refuses the same code twice" |
| Expiry | "refuses an expired code" |
| Failures are indistinguishable | "answers the same for a number that never asked for a code" |
| The failed attempt is audited without the code | "records a failed verification without the code" |
| The gate reads dates, not the status field | two tests, here and in `contracts.test.ts` |
| Cancelled contracts are excluded | "ignores a cancelled contract even if its dates still cover today" |
| A customer token is refused on a staff route | "refuses a customer token on a staff route" |
| The phone number is never returned | "never returns the phone number" |
| Logout is immediate | "logs out, and the access token stops working immediately" |
| Rotation and reuse detection apply to customers too | "rotates the refresh token, and detects a replay" |

Checklist rows moved to **done**: 2.1–2.8, 2.10, 12.1, 13.1 —
`npm run audit:checklist` reports **73 done, 45 planned, 1 accepted** of 119.

## 5. How to verify, against the running stack

Every line was run; the output is what it printed.

| # | Action | Result |
| :-- | :-- | :-- |
| 1 | `/api/ready` | `mongodb`, **`redis`** and `ml` all pass |
| 2 | Request a code for `070 100 001` | `202 {"status":"accepted","expiresInSeconds":300}` |
| 3 | Request one for `070 999 999` | **the same** `202`, and no message written |
| 4 | Request one for `+447700900123` | `400 invalid_phone` |
| 5 | Read the dev inbox | `channel: whatsapp · to: +961***001 · status: sent`, body in **Arabic**, matching the customer's language |
| 6 | Verify with that code | `200`, and `entitlement: {status: "active", tier: "premium", …}` |
| 7 | `GET /me` | name, company, products, `phoneLast3: "001"` — **no phone number anywhere** |
| 8 | That customer token on `/api/auth/me` (staff) | `401` |
| 9 | Sign in as the expired-contract customer | `200`, `entitlement: {status: "expired", endDate: "2026-09-18"}` — the diagram's inactive branch, with a date to show |
| 10 | Ask for a second code immediately | `429` with `retry-after: 26` |

One honest note on how check 2 went the first time: I typed `03 100 001`, which
normalises to `+9613100001` — a different number from the demo customer's
`+96170100001` — and got the "accepted, nothing sent" path. The behaviour was
correct; the input was wrong. It is a fair illustration of why the response is
identical either way: nothing in it told me I had the wrong number, which is
exactly the property an attacker also gets.

## 6. What you must do

Nothing to configure. The demo customers are seeded with these numbers:

| Customer | Number | Contract |
| :-- | :-- | :-- |
| Rania Haddad | `070 100 001` | active (premium) |
| Karim Sleiman | `071 100 002` | expires in 9 days |
| Maya Chahine | `076 100 003` | expired |

Read the code from the dev inbox:
`db.notifications.find({kind:"otp"}).sort({createdAt:-1}).limit(1)` — step 29
turns that into a page.

## 7. Test results

```
Node:   492 tests, 29 files      (+59 in this step)
        Statements 89.67%  Branches 78.65%  Functions 90.8%  Lines 91.35%
Python:  32 tests
Tooling: 81 tests
Lint, format, clean build, secret scan, personal-data scan, checklist: clean
Stack:  6/6 healthy; the 10 live checks in §5 produced the stated output
```

## 8. Known limitations opened by this step

- **Only the OTP endpoints are rate-limited.** The limiter exists and is
  general, but it is wired into customer login alone. Staff login, the password
  reset and the contact form still rely on per-account lockout, which does not
  stop one guess sprayed across many accounts. Wiring it everywhere is a small
  change and belongs with the routes it protects.
- **No bot protection before a paid send.** The research recommends a CAPTCHA or
  risk challenge when behaviour looks suspicious; this release has the limits
  but no challenge. It needs a UI, so it goes with the public site in step 32.
- **Conversion monitoring is not implemented.** "Sends rising, verifications
  falling" is the signal that catches pumping early, and it needs the metrics
  dashboard from step 30.
- **A code can be requested for any registered number by anyone.** That is
  inherent to the design — possession of the phone is the factor — and bounded
  by the limits rather than prevented.
- **Customer sessions have no "sign out everywhere".** The mechanics exist
  (`revokeAllForStaff` has a customer equivalent in all but name); it needs the
  account screen from step 13.
- **`not_started` and `expired` are reported but not yet acted on.** The client
  that turns them into the Contact-page redirect is step 32.

## 9. Checklist

- [x] Six-digit code, cryptographically random, peppered hash, never logged
- [x] Five-minute expiry, five attempts, single use, enforced by the database
- [x] Identical responses whether or not the number belongs to a customer
- [x] Destination allow-list by parsing, not by prefix matching
- [x] Layered atomic limits: resend, per phone, per IP, per prefix
- [x] Daily budget cap with a kill switch that does not expire on its own
- [x] WhatsApp/SMS behind an interface; the mock writes the dev inbox
- [x] Codes visible in the dev inbox **only** under `DEMO_MODE`
- [x] Customer sessions with rotation, reuse detection, CSRF and immediate logout
- [x] Customer and staff tokens mutually unusable
- [x] Contract gate with four distinguishable outcomes, read from the dates
- [x] 59 new tests, a real Redis in the suite, and 10 live checks
