# Step 07 — Staff recovery: reset, enrolment, recovery codes, break-glass

**Phase 2. Status: complete and verified** against the in-memory test database
and the running Compose stack on 2026-10-24.

## Goal

Close the holes step 06 left open on purpose. After it, an admin with no second
factor could not get in, a forgotten password had no path back, a lost phone
meant a lost account, and the only admin being locked out meant the system was
unrecoverable.

Four ways back in, each needing something different, and each one audited:

| Lost | Path back | Needs |
| :-- | :-- | :-- |
| Password | reset by email | access to the mailbox |
| Authenticator | one of ten recovery codes | a code printed at enrolment |
| Both | an admin clears the second factor | **another** admin |
| Everything, and you are the only admin | break-glass CLI | access to the server |

Each rung needs strictly more than the one above it. That ladder is the design.

---

## 1. What was built

```
apps/server/src/
├── services/providers/email.ts   interface + mock; writes to the dev inbox
├── services/auth/
│   ├── recovery.ts               password reset, recovery codes
│   └── enrolment.ts              TOTP enrolment, admin-assisted reset
├── cli/break-glass.ts            the last resort, with its own audit action
└── routes/auth.ts                five new endpoints
```

`POST /api/auth/password-reset` · `/password-reset/complete` · `/totp/start` ·
`/totp/confirm` · `/totp/admin-reset`, plus `recoveryCode` accepted at login.

## 2. Decisions, and what each one costs

### 2.1 Email is a mock that writes to a dev inbox

Nothing is sent. Every message becomes a row in `notifications`, which **is**
the dev inbox the dashboard renders in step 29 — so a reviewer reads the reset
link a real deployment would have emailed, with no SMTP account, no domain and
no deliverability problem.

The recipient is **masked at write time** (`a***n@csas.local`). The address
already exists on the staff record; copying it into a second collection with a
longer retention would be a second place to leak it and a second place to have
to delete it.

### 2.2 The reset endpoint always says the same thing

`202 {"status":"accepted"}` whether or not the address belongs to an account.
It is unauthenticated by necessity, so anything else turns a leaked address list
into a verified staff directory. Verified live: both responses are byte
identical, and only one notification is written.

The attempt for an unknown address is still **audited** — a burst of them is
exactly the reconnaissance worth noticing.

### 2.3 A reset revokes every session

A reset usually means "somebody else may have had access". Leaving the existing
sessions alive would make it theatre. It also clears any lockout, because
otherwise an account locked by an attacker's guessing stays locked after
recovering.

**It does not bypass the second factor.** Verified live: after resetting the
admin's password, logging in with the new password still returned
`totp_required`. A reset that skipped 2FA would make the mailbox a single
factor for the whole account.

### 2.4 A weak new password does not burn the token

If the new password fails the policy, the token is **not** consumed. A weak
choice is a retry, not an attack, and burning it would force a whole new email
round trip for a typo.

### 2.5 Enrolment needs a ticket, not an open endpoint

Step 06's `totp_enrolment_required` had no way out. Both obvious fixes are
wrong: an unauthenticated enrolment endpoint lets anyone who knows an admin's
address attach *their own* authenticator, and auto-enrolling at first login
means the server chose the factor — which is not a second factor.

So login issues a **five-minute enrolment ticket** when, and only when, the
password was correct and no secret exists. It has its own JWT audience, so it
cannot be presented as a session token, and an access token cannot be presented
as an enrolment ticket. Both directions are tested.

**The secret is not stored until a working code proves the authenticator has
it.** Storing it at `start` would leave half-enrolled accounts that can neither
log in nor recover — the exact state this flow exists to fix.

### 2.6 Ten recovery codes, hashed, shown once

`m4w2-w4sc-rqzk` — grouped, lower case, no `0/o` or `1/l`, because someone who
has just lost their phone is typing them by hand. 12 characters from a 32-symbol
alphabet is 60 bits.

Only hashes are stored, so they genuinely cannot be shown again. Single use is
enforced by the **database**, not by read-then-write: `usedAt: { $exists: false }`
is in the update's filter, so two simultaneous attempts cannot both win.

A wrong recovery code spends an attempt from the same lockout budget as a wrong
password. Regenerating replaces the batch — ten live codes at a time, never
twenty.

### 2.7 The admin-assisted reset is deliberately inconvenient

It is unavoidably a way for a compromised admin session to strip a colleague's
second factor, so it is constrained:

* the admin must **type the target's email address**, which makes a mis-click on
  the wrong row impossible;
* every session the target had is revoked, so it cannot be used to quietly keep
  access;
* it is audited with **both** identities — one of the few entries that records
  someone acting on someone else;
* an admin **cannot use it on themselves**. That would be a one-click way to
  shed the second factor protecting a stolen session. Break-glass exists for
  that case, and it requires the server.

### 2.8 Break-glass is a CLI, and that is the security argument

Every other path needs something the locked-out admin has lost. This one needs
**access to the server** — a higher bar than all of them, and the reason it can
be trusted: if you can run it, you can already read the database.

It is awkward on purpose. No HTTP endpoint, no flag that skips the prompt
without also demanding a reason, nothing that runs as part of the application.
It clears the lockout and the second factor on **one named admin**, revokes
their sessions, and writes `staff.break_glass_used` — the one audit action that
should never appear without a matching incident note.

A new password comes from `BREAK_GLASS_PASSWORD` in the environment, never a
flag: a password in `--args` lands in shell history and in `ps` output for every
user on the box. It still has to pass the ordinary policy, and it is marked
`mustChangePassword`, because it was typed by whoever was holding the incident.

What it will not do: create an account, change a role, or touch anyone else. A
machine that can run this can do those things directly in the database — the
point is that this tool leaves a record and reaching past it does not.

## 3. Two defects found by running it

### 3.1 The route dropped the field the schema accepted

`recoveryCode` was validated by the login schema and then never passed to the
service, so every recovery-code login returned `invalid_credentials`. Five tests
failed at once, which is what made it obvious; a single test would have looked
like a logic bug in the consume path.

A validated field that no handler reads is a quiet class of bug — the request
looks accepted and the behaviour is simply absent.

### 3.2 Break-glass crashed before doing anything

```
break-glass failed: unable to determine transport target for "pino-pretty"
```

The CLI asked for pretty logging unconditionally, and `pino-pretty` is a **dev**
dependency — absent from the runtime image, which is exactly where this tool
runs. The emergency tool failed in the emergency environment and worked
everywhere else.

It now follows `LOG_PRETTY` like everything else. Its human-readable output
never went through pino anyway; the logger is only there for the audit write's
failure path.

A third, smaller one: `npm run break-glass` used the existing `seed` image, so
it ran whatever code was last built. It now passes `--build`. For a tool used
once a year, being sure you are running current code beats starting faster.

## 4. Security controls, and the test that proves each

| Control | Test |
| :-- | :-- |
| Reset answers identically for unknown addresses | "answers identically for an address that does not exist" |
| An unknown-address attempt is audited, masked | "records the attempt for an unknown address, masked" |
| Only the hash is stored; the link is not a stored credential | "stores the link but never the token on its own" |
| One live token per account | "leaves exactly one live token when asked twice" |
| Token is single use | "refuses a token that has already been used" |
| Token expires | "refuses an expired token" |
| Reset revokes every session | "revokes every session the account had" |
| Reset applies the password policy | "applies the password policy" |
| A rejected password does not burn the token | "does not consume the token when the password is refused" |
| Reset clears a lockout | "clears a lockout, so recovery actually recovers" |
| Enrolment ticket cannot be used as a session | "refuses an enrolment ticket as an access token" |
| An access token cannot be used as an enrolment ticket | "refuses an access token as an enrolment ticket" |
| The secret is not stored until proven | "does not store the secret until a code proves it was scanned" |
| Cannot re-enrol over a working factor | "refuses to re-enrol over a factor that already works" |
| Ten codes, hashed, format stable | "completes enrolment and returns ten recovery codes, once" |
| A code works once and only once | "spends the code, so it cannot be used twice" |
| The other nine still work | "leaves the other nine usable" |
| Case and separators are forgiving | "ignores case and separators" |
| A wrong code costs an attempt | "counts a wrong code towards the lockout" |
| Admin reset needs the typed address | "refuses when the confirmation does not match the target" |
| A failed confirmation is audited with both parties | "records a failed confirmation, naming both parties" |
| An admin cannot reset their own factor | "refuses an admin resetting their own second factor" |
| An agent cannot reset anyone | "refuses an agent trying to reset anyone" |
| Break-glass flags cannot silently do nothing | 5 tests in `break-glass.test.ts` |

Checklist rows moved to **done**: the new section 15 (ten rows) —
`npm run audit:checklist` reports **56 done, 54 planned, 1 accepted**.

## 5. How to verify, against the running stack

Every line below was run; the output is what it printed.

| # | Action | Result |
| :-- | :-- | :-- |
| A | Reset for the real admin | `202 {"status":"accepted"}` |
| B | Reset for an address that does not exist | **the same** `202`, and no second notification |
| C | Read the dev inbox | the full email, `to: a***n@csas.local`, with the link |
| D | Complete the reset with that token | `200 {"status":"completed","sessionsRevoked":0}` |
| E | Log in with the new password | `401 totp_required` — a reset does not bypass 2FA |
| F | Log in with the old password | `401 invalid_credentials` |
| G | Re-use the same link | `400 invalid_token` |
| I | `npm run break-glass -- --email … --reason …` | removes the factor, revokes sessions, prints what it did |
| J | The audit entry it left | `staff.break_glass_used`, reason recorded, address masked |
| K | Log in with the password alone | `403 totp_enrolment_required` **+ an enrolment ticket** |
| L | `POST /totp/start` then `/totp/confirm` | a secret, an `otpauth://` URI, and ten recovery codes |
| M | Log in with a recovery code instead of the app | `200` |
| N | The same recovery code again | `401` |

The demonstration changed the demo admin's authenticator, so the last step put
the documented state back — the secret in `.env` works again, confirmed with a
fresh login.

## 6. What you must do

Nothing to configure. Three things to know:

1. **The reset link lives in the database**, not in an inbox. Until the
   dashboard exists, read it with
   `db.notifications.find({kind:"password_reset"})`.
2. **Break-glass is `npm run break-glass -- --email <address> --reason "<why>"`.**
   It prompts for the address before doing anything; `--yes` skips only the
   prompt, never the reason.
3. **Recovery codes are shown once.** That is not a limitation to work around —
   it is why they are safe to store.

## 7. Test results

```
Node:   433 tests, 26 files      (+48 in this step)
        Statements 91.33%  Branches 79.79%  Functions 92.79%  Lines 92.56%
Python:  32 tests
Tooling: 81 tests
Lint, format, clean build, secret scan, personal-data scan, checklist: clean
Stack:  6/6 healthy; the 13 live checks in §5 produced the stated output
```

Coverage fell from 94.5% because `break-glass.ts` is **17%** covered: it reads
from a terminal and talks to a live database, so only its argument handling is
tested automatically. That is stated rather than papered over with a test that
mocks the whole file into meaninglessness — step 36's recovery drill is where
it gets exercised for real.

## 8. Known limitations opened by this step

- **Still no rate limiting.** The reset endpoint is unauthenticated and
  unthrottled, so it can be used to generate mail volume for a known address.
  Step 08 adds the limiter; until then the only brake is the per-account
  lockout, which this endpoint does not touch.
- **No password-change endpoint for a signed-in user.** `mustChangePassword` is
  recorded and still not enforced anywhere. It needs a UI to be worth building,
  so it belongs with the dashboard in step 29.
- **The reset link has no device binding.** Anyone holding the token can use it
  within thirty minutes, which is the normal design and the normal risk.
- **TOTP replay inside one 30-second window is still possible.** Storing the
  last consumed step per user is the fix; it is a one-field change and belongs
  with the first real sign-in UI rather than ahead of it.
- **Break-glass is tested by hand**, not in CI. It reads from a terminal and
  talks to a live database; only its argument handling is covered automatically.
  The recovery drill in step 36 is where it gets exercised properly.

## 9. Checklist

- [x] Password reset: hashed single-use token, 30-minute expiry, identical
      responses, every session revoked
- [x] Policy applied to the new password; a rejection does not burn the token
- [x] Ten single-use recovery codes, hashed, shown once, enforced by the database
- [x] Recovery code accepted in place of a one-time code at login
- [x] TOTP enrolment reachable by an admin who cannot otherwise sign in, via a
      narrow ticket that cannot be used as a session
- [x] The secret is stored only after a working code proves it was scanned
- [x] Admin-assisted reset with typed confirmation, session revocation, audit of
      both parties, and no self-service
- [x] Break-glass CLI requiring server access, with its own audit action
- [x] Email behind an interface; the mock writes the dev inbox
- [x] 40 new tests, and 13 live checks against the running stack
