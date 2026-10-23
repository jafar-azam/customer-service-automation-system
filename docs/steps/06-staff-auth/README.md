# Step 06 — Staff authentication: passwords, two-factor, sessions, roles, audit

**Phase 2. Status: complete and verified** against the in-memory test database
and the running Compose stack on 2026-10-24.

## Goal

Let staff sign in, and make every part of that defensible: how a password is
stored and judged, how a second factor works, how a session is issued, rotated
and revoked, who may call what, and what is recorded about all of it.

This is the step where the threat model stops being a document. Five of its
decisions become code here, and each one has a test that fails if the control is
removed.

---

## 1. What was built

```
apps/server/src/
├── crypto/secret-cipher.ts      AES-256-GCM for any short stored secret
├── services/auth/
│   ├── password.ts              Argon2id, policy, strength, rehash-on-login
│   ├── totp.ts                  RFC 6238, secret encrypted at rest
│   ├── tokens.ts                access JWT + rotating refresh with family revocation
│   └── login.ts                 the three rules in §3.1, in one place
├── services/audit.ts            append-only; one verb, `record`
├── http/
│   ├── validate.ts              zod on body/query/params, unknown fields rejected
│   ├── authenticate.ts          requireStaff (+ session check), requireRole
│   └── cookies.ts               cookie flags, double-submit CSRF
└── routes/auth.ts               login · refresh · logout · me · an admin-only probe
```

Endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`,
`POST /api/auth/logout`, `GET /api/auth/me`, and `GET /api/auth/staff-count` —
the last one exists only so the role guard has something to guard before the
dashboard is built, and so step 34 has a target for its cross-role probe.

## 2. Decisions, and what each one costs

### 2.1 Length over composition, judged by an estimator

Twelve characters minimum, 128 maximum, every character allowed, **no
composition rules**. `Password1!` satisfies "upper, lower, digit, symbol" and is
one of the most-guessed passwords in existence; a composition rule would accept
it and reject `fourteen purple lanterns upstairs`.

Strength is judged by **zxcvbn** (score ≥ 3 of 4) rather than a downloaded
breach list. It ships its dictionaries, so the check works offline, in CI and on
a laptop with no network — and it catches patterns a list cannot: keyboard
walks, dates, l33t substitutions.

**But zxcvbn is not sufficient on its own, and that was measured, not assumed.**
With the email and all its fragments supplied as user inputs,
`csas-support-2026` still scores **4 of 4**, and `haddad-haddad-1` scores **3** —
both at or above the floor. The estimator heavily penalises a password that *is*
a user input and barely penalises one that merely *contains* it inside something
longer. So an explicit containment rule refuses any password containing a
three-character-or-longer fragment of the user's name or email, or of the
product's own name. NIST SP 800-63B asks for exactly that.

Cost: a staff member whose surname is "Sun" cannot use a password containing
"sun". Three characters is the floor precisely to keep that annoyance rare.

### 2.2 Argon2id at 64 MiB, with silent upgrades

OWASP's baseline is 19 MiB; memory is what costs a GPU attacker most, and a
handful of staff logins a day cannot notice the difference.

The parameters live inside the hash string, so `isOutdatedHash` can compare them
and a successful login re-hashes when they are behind. Raising the cost later
upgrades every password on its owner's next login, and nobody is asked to do
anything. `@node-rs/argon2` has no `needsRehash`, so this reads the parameters
back with `parseOptions` — exact, not a guess.

### 2.3 Every failure looks the same, and costs the same

Unknown account, wrong password, wrong code, locked, disabled — all
`401 invalid_credentials`, byte for byte. A test asserts the two bodies are
identical apart from the request id.

Equal *time* matters as much as equal content: a login for an account that does
not exist still spends one Argon2 verification against a dummy hash. Without it,
"no such user" returns in a millisecond and "wrong password" takes ~50 ms, which
is a remotely measurable oracle for which staff accounts exist.

Cost: a genuinely locked-out user is told nothing useful. That friendliness is
spent in step 07's recovery flow instead, where identity is proven first.

**One deliberate exception.** When the password is right but the second factor
is missing, the response says `totp_required`. That does tell the caller the
password was correct — to a caller who has just proved they know it. A generic
failure would make the UI unusable and push people towards weaker factors.

A related judgement, recorded because it is a close call: that prompt is **not**
audited. It happens on every legitimate admin login, so recording it would bury
the signal that matters — a *wrong* code — in routine noise. A wrong code is
audited, as `bad_totp`.

### 2.4 A wrong one-time code costs an attempt

Both factors share one counter. Two counters would mean five password guesses
*and* five code guesses; a six-digit code with its own fresh budget is a free
guessing game for anyone holding the password.

Lockout backoff doubles from one minute and caps at an hour. Exponential so a
human who mistypes twice is not stopped while automation slows to uselessness;
capped because a permanent lock is a denial of service any attacker can inflict
on any staff member whose email address they know.

### 2.5 Two tokens, because they are protecting against opposite things

| | Access token | Refresh token |
| :-- | :-- | :-- |
| Form | signed JWT, HS256 | 32 random bytes, opaque |
| Lives | 15 minutes | 14 days |
| Stored | nowhere | SHA-256 only |
| Sent as | `Authorization` header | `httpOnly` cookie |
| Vulnerable to | script that can read memory | nothing a script can reach |

The split is the design: the long-lived credential is unreadable by injected
script, and the script-readable one expires fast. SHA-256 rather than Argon2 for
the refresh token because it is 256 bits of randomness — there is nothing to
brute-force, and the lookup must stay one indexed read.

**The access token is still checked against the session on every request.**
Without that, "log out" would mean "log out within fifteen minutes". It is one
indexed count, and it is what makes revocation immediate — proven by a test that
logs out and finds the access token dead on the next call.

### 2.6 Rotation, and why reuse kills the whole family

Every refresh issues a new token and retires the old one. If a retired token is
presented again, exactly one thing has happened: somebody copied it, because the
legitimate client has already rotated past it.

Revoking only the replayed token would leave the thief and the victim refreshing
each other out indefinitely, each one's success invalidating the other's token.
So the **entire family** is revoked, both parties are logged out, and the audit
log records a `refresh_token_reuse_detected` entry — the one entry in this system
that says "a credential was stolen" rather than "someone failed to log in".

A different family — a second browser — is deliberately untouched. A stolen
token in one place should not be a full account lockout everywhere.

The whole rotation runs in a transaction, which is why step 02 insisted on a
replica set: retiring the old token, writing the new one and revoking the family
must all happen or none of them. A test runs two simultaneous refreshes and
asserts exactly one wins.

### 2.7 CSRF where cookies are used, and nowhere else

Double-submit: a non-`httpOnly` CSRF cookie the client echoes in a header,
compared in constant time. Applied to `/refresh` and `/logout` — the only two
endpoints that act on a cookie. Everything else authenticates with a bearer
header, which another origin cannot set.

`SameSite=Strict` is the primary defence; this is the second line, for the
browser that does not honour it and for the day someone relaxes the cookie to
`Lax` for a legitimate reason. Applying CSRF checks to bearer-authenticated
endpoints would be cargo cult.

`Secure` is set even in development: browsers treat `http://localhost` as a
trustworthy origin, so it costs nothing locally and removes the "we'll turn it
on in production" failure mode.

### 2.8 Role checks are function-level, and that is all they are

`requireRole('admin')` answers "may this role call this endpoint". It is **not**
object-level authorization — "may this actor touch *this record*" — which lives
in the repository layer from step 11, because a check that must be remembered in
forty handlers will be forgotten in one. The threat model ranks that risk 9/9;
this step does not pretend to have addressed it.

403, not 404, for a known caller with the wrong role: hiding an admin route from
an authenticated agent buys nothing, since they can read the client bundle.

### 2.9 The audit log has one verb

`record()` — no update, no delete anywhere in the application. "Append-only" is
a property of the code rather than a promise in a document.

**An audit write never fails a request.** A failure is logged at `error` for
step 36's alerts. The trade is deliberate: losing one entry is bad, and letting
an attacker who can break the audit write *deny the action they are performing*
is worse. A full disk should not be an outage.

Entries hold references, never content, and even an email address is masked —
`n***y@csas.local`. The audit log outlives the data it describes (6–12 months
against 12 for a ticket), so content here would quietly defeat the retention
schedule.

## 3. Two defects found by running it

### 3.1 `sanitizeFilter` was silently breaking queries

Step 05 enabled Mongoose's `sanitizeFilter` globally as defence in depth against
operator injection. Every authenticated request returned **500**:

```
CastError: Cast to date failed for value "{ '$gt': 2026-10-23T21:12:13.346Z }"
```

The flag rewrites `$`-prefixed keys inside filter *values* — correct for a filter
built from user input, wrong for one the application wrote itself. And the cast
error was the **lucky** case: on a same-typed field, `{ status: { $ne: 'closed' } }`
is rewritten into an equality test against a literal object and silently matches
nothing. A revocation query that quietly revokes no sessions, with no error
anywhere, is a security control that reports success while doing nothing.

It is now applied per query, on filters that carry user input
(`.setOptions({ sanitizeFilter: true })`). The primary defence was never this
flag anyway: zod refuses an operator object where a string belongs, before any
query is built, and two tests prove it on the login endpoint.

### 3.2 The demo admin could not log in

`seedAdmin` creates an admin **once and never touches it again** — which is what
stops a re-seed from reverting a changed password. Correct, and it meant an
admin seeded before this step had no TOTP secret, so mandatory admin 2FA locked
the reviewer out of their own demo with `totp_enrolment_required`.

The fix keeps both properties by separating them: enrolment moved out of
`seedAdmin` into `enrolDemoAdminTotp`, which runs only under `DEMO_MODE`, only
when no secret exists, and never alters a password or a role. An admin who has
enrolled a real authenticator is left alone — there is a test for that.

## 4. Security controls, and the test that proves each

| Control | Test |
| :-- | :-- |
| Argon2id, salted, 64 MiB | "produces an Argon2id hash"; "salts, so the same password hashes differently" |
| Password policy without composition rules | 11 policy tests incl. "rejects Password1! despite meeting every composition rule" |
| Context words refused where zxcvbn passes them | "rejects a fragment of the user email that zxcvbn considers strong enough" |
| Hash upgraded silently when parameters rise | "reports the upgrade alongside a successful verification" |
| Identical response for unknown vs wrong password | "answers identically for an unknown account and a wrong password" |
| Identical response when locked or disabled | two tests |
| Equal time for a non-existent account | "spends real verification work on an account that does not exist" |
| Lockout after five failures, cleared on success | two tests |
| Wrong one-time code counts towards lockout | "counts a wrong code towards the lockout" |
| TOTP mandatory for admins, optional for agents | three tests |
| TOTP secret encrypted at rest, fails closed if corrupt | three tests in `totp.test.ts` |
| Refresh token never stored or returned in the clear | "is never stored in the clear"; "never returns the refresh token in the body" |
| Rotation retires the old token | "refuses the old token once it has been rotated" |
| **Reuse revokes the whole family** | "revokes every live token in the family"; "records the reuse in the audit log" |
| A different family is unaffected | "leaves another family alone" |
| Revocation is immediate for access tokens too | "stops accepting the access token the moment the session is revoked" |
| `alg: none`, wrong secret, wrong audience, bad role rejected | five tests in `tokens.test.ts` |
| Cookie flags: HttpOnly, Secure, SameSite=Strict, scoped path | "marks the refresh cookie HttpOnly, Secure and SameSite=Strict" |
| CSRF required and must match | two tests |
| NoSQL operator injection refused at the edge | "refuses an operator object as a password" / "as an email" |
| Unknown fields rejected, not stripped | "refuses an unknown field" |
| Role guard: admin passes, agent 403, anonymous 401 | three tests |
| Audit records success, failure, lockout; masks the address | four tests, incl. "never writes the password to the log" |

Checklist rows moved to **done**: 1.1–1.5, 3.1–3.6, 4.1, 5.1, 5.2, 11.5 and the
login half of 11.6 — `npm run audit:checklist` reports **46 done, 54 planned, 1 accepted**.

## 5. Exact commands

```bash
npm run verify            # 382 tests
npm run test:coverage
docker compose up -d --build server && npm run seed
```

## 6. How to verify, against the running stack

Credentials come from `.env`: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and
`DEMO_ADMIN_TOTP_SECRET` for the code. Everything below was run; the output is
what it printed.

| # | Request | Result |
| :-- | :-- | :-- |
| 1 | Login with no code | `401 {"code":"totp_required"}` — admin 2FA is enforced |
| 2 | Login with a live code | `200`, access token, and both cookies set |
| 3 | `GET /api/auth/me` with the token | `{"role":"admin","totpEnrolled":true,…}` |
| 4 | `GET /api/auth/staff-count` as admin | `{"count":1}` |
| 5 | Cookie flags in the jar | `csas_refresh` HttpOnly **yes**, `csas_csrf` HttpOnly **no** — by design |
| 6 | `POST /api/auth/refresh` with no CSRF header | `403 {"code":"csrf_failed"}` |
| 7 | …with the header | `200`, new tokens |
| 8 | Replay the **old** refresh token | `401 {"code":"session_revoked"}` |
| 9 | Use the victim's *current* token afterwards | `401 session_revoked` — the whole family died |
| 10 | Login with `{"password":{"$ne":null}}` | `400` — refused by zod before any query |
| 11 | Login for an account that does not exist | `401 invalid_credentials` |

Then in MongoDB Compass:

| Look at | Expect |
| :-- | :-- |
| `sessions`, grouped by `revokedReason` | `rotation: 1`, `reuse_detected: 1` |
| `audit_logs` | `staff.created`, `staff.login.succeeded`, and two `staff.logout` with `outcome: failure` — the reuse detections |
| The `staff.login.failed` entry | `metadata: { reason: 'unknown_account', emailMasked: 'n***y@csas.local' }` — masked, and no password anywhere |
| `staff_users` | `totpSecretEncrypted` present and unreadable; `passwordHash` hidden from ordinary queries |

## 7. What you must do

Nothing to configure. Two things to know:

1. **The demo admin's credentials are in your `.env`** — email, password and the
   base32 TOTP secret. Any authenticator app can scan it; step 07 adds the
   enrolment QR code, and step 29 adds the dev inbox that shows the current code
   without an app at all.
2. **If you seeded before this step**, re-run `npm run seed`: the admin exists
   but has no second factor, and `enrolDemoAdminTotp` adds it.

## 8. Test results

```
Node:   382 tests, 23 files      (+92 in this step)
Python:  32 tests
Tooling: 81 tests
Lint, format, clean build (tsc -b --force), secret scan, personal-data scan,
checklist audit: clean
Stack:  6/6 healthy; 11 live checks in §6 produced the stated output
```

## 9. Known limitations opened by this step

- **No enrolment endpoint yet.** An admin without a TOTP secret is refused with
  `totp_enrolment_required` and has no way to fix it inside the application.
  Step 07 adds enrolment, recovery codes, password reset and the break-glass
  procedure; until then `DEMO_MODE` is the only path in.
- **No rate limiting.** Lockout bounds guesses per *account*; nothing yet bounds
  requests per IP, so an attacker can still spray one guess each across many
  accounts. Step 08 adds the limiter, and that is also where the OTP flow needs
  it.
- **Object-level authorization does not exist.** Only role checks do. The
  highest-ranked risk in the threat model is addressed in step 11.
- **No password-change endpoint**, so `mustChangePassword` is recorded and not
  yet enforced anywhere. Step 07.
- **The access-token window is fifteen minutes.** A stolen access token works
  until it expires; only the refresh side is revocable instantly. This is the
  standard trade for not reading the database on every request, and the session
  check narrows it to "revoked sessions are rejected immediately" — but a token
  stolen *and used* within its own lifetime, from a still-valid session, cannot
  be stopped.
- **TOTP replay inside one 30-second step is possible.** A code remains valid for
  its window; the industry fix is to store the last consumed step per user.
  Worth doing in step 07 alongside recovery codes.

## 10. Checklist

- [x] Argon2id with documented parameters, silent rehash on login
- [x] Password policy: length, breadth, strength estimation, context words
- [x] TOTP mandatory for admins, optional for agents, secret encrypted at rest
- [x] Lockout with exponential backoff shared by both factors
- [x] Indistinguishable failures, in content and in time
- [x] Access token short-lived and checked against a live session
- [x] Refresh token rotated, hashed at rest, family revoked on reuse
- [x] Revocation on logout, and on deactivation at the next refresh
- [x] CSRF on exactly the cookie-authenticated endpoints
- [x] zod validation rejecting unknown fields and operator objects
- [x] Role-based access control with 401/403 separated correctly
- [x] Append-only audit log with masked identifiers and no secrets
- [x] 92 tests, and a live run of all eleven checks in §6
