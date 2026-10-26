# Step 13 — History, detail, and what the customer controls

**Phase 4. Status: complete and verified** against the test suite and the
running Compose stack on 2026-10-26.

## Goal

The three things a customer does between opening a ticket and closing it: find
an old one, read what happened, and decide how they want to be contacted.

This is the first step with real screens, so the step 10 component library
finally gets used for something other than demonstrating itself.

---

## 1. What was built

```
apps/server/src/
├── repositories/tickets.ts     date range + search, escaped
├── services/transcript.ts      the conversation as a text file
├── services/tickets.ts         + canReopen, reopenClosedTicket
├── routes/tickets.ts           + timeline, transcript, reopen, totals
└── routes/preferences.ts       notification settings
apps/client/src/
├── api/client.ts               one typed fetch, errors as values
├── api/errors.ts               error codes → the reader's language
└── screens/
    ├── History.tsx             filters, applied by the server
    ├── TicketDetail.tsx        conversation, files, timeline, reopen
    └── Preferences.tsx         saves on change
```

---

## 2. Decisions, and what each one costs

### 2.1 Reopening creates a new ticket

Step 11 made `closed` terminal on purpose, so an auto-close job and a customer
cannot fight over one record indefinitely. Reopening therefore does **not**
transition the old ticket — it creates a new one carrying `reopenedFromId`.

The original keeps the history it had when it closed, and its resolution time
stays meaningful. `TICKET_REOPEN_WINDOW_DAYS` defaults to 14; `0` disables it,
because the right number is a business decision and a company doing same-day
repairs wants a different one from a company billing monthly.

`canReopen` is pure and is used **twice**: once to decide whether the request
is allowed, and once to tell the client whether to draw the button. Two copies
of that rule drift, and the copy in the browser is the one nobody re-reads.

### 2.2 The transcript is plain text

Not PDF, not HTML. It opens everywhere, carries no active content, and is the
one format where "what you see is what the file contains" is literally true. A
PDF would need a renderer in the server and hand the customer a file their own
machine parses with something far more complicated than a text editor.

It filters internal notes **again**, even though the query already excluded
them. A transcript is the worst possible place for one to appear, because it
leaves the system as a file and no later access control applies to it.

### 2.3 Search never reaches the message bodies

Subject and reference only. The bodies are the richest personal data in the
system, and a keyword search over them turns any staff account into a way to
trawl customer conversations. The pattern is escaped before it becomes a
regular expression — `.*` would otherwise match everything and `a{10000,}`
would be a denial of service (`CLAUDE.md`: never build a regular expression
from raw input).

### 2.4 Filters are applied by the server, and so is the count

Both run against the same filter object, built once. Filtering a page in the
browser makes "showing 25 of 112" a lie — the 25 are filtered and the 112 is
not — and it only works while the whole history fits in one page, which is
exactly when nobody needs filters.

### 2.5 Preferences save on change

Four independent controls, no Save button. A form that can be left unsaved is
a form people leave unsaved, and then wonder why they are still receiving
messages. The email toggle is **disabled with a reason** when there is no
address, rather than hidden: a control that silently does nothing is worse than
one that explains why it cannot.

Turning marketing off is audited as `consent.withdrawn`, because "who withdrew
consent and when" is the question a regulator asks.

### 2.6 No router

Two screens and a panel, switched by state. A router arrives when there are
URLs worth sharing — step 32's public site is where that starts to matter.
Adding one now would be a dependency serving a single `if`.

---

## 3. Three bugs found by running it

**The filters were accepted and silently ignored.** The schema gained
`openedAfter`, `openedBefore` and `search`; the object passed to the repository
did not. So the API validated them, reported success, and returned unfiltered
results — worse than refusing a filter, because the caller is told it worked.
Three tests caught it; nothing in the schema could, because the schema was
right.

**An English sentence in the middle of an Arabic page.** The screens rendered
the server's `message`, which is written for whoever reads a log:
"Authentication is required". Visible the first time the stack was opened in a
browser and invisible to every test, because no test read the page as a reader
does. The **code** is now the contract and the message is a developer detail;
an unknown code falls back to a generic sentence *in the reader's language*,
because a vague sentence they can read beats a precise one they cannot.

**The same condition in two colours.** Once errors were translated, an
unauthenticated visitor saw the identical sentence twice — blue on the history
list, red under preferences. Not being signed in is a prompt, not a failure,
and an interface that shows both in red teaches people that red means nothing.

### 3.1 And one about a test

`createdAt` is immutable under Mongoose's timestamps, so the fixture that
backdated a ticket was silently dropped and the date-range test was asserting
against a ticket created seconds earlier. `overwriteImmutable` is the
documented way to backdate one.

---

## 4. Security and privacy controls

| Control | Test |
| :-- | :-- |
| Every filter still scoped to the caller | a search matching another customer's ticket returns 0 |
| Search is escaped, not interpolated | `.*` matches nothing rather than everything |
| Search cannot reach message bodies | subject and reference only, by construction |
| Transcript excludes internal notes | asserted on the downloaded text |
| Transcript of another's ticket | 404 |
| Transcript served as a download | `Content-Disposition`, `nosniff`, `no-store` |
| Timeline reduces who acted to a role | the staff id appears nowhere in the response |
| Reopen is customer-only | staff get 404 on the route |
| Reopen respects the window | 409 `reopen_window_passed` past the deadline |
| Preferences are customer-only | staff get 401 |
| An unknown preference field | 400, not a silent partial write |
| Marketing opt-out audited as consent | `consent.withdrawn` written |
| Screens have no axe violations | history, detail and preferences × both languages |

---

## 5. How to verify

```bash
npm run test                 # 823 tests
npm run up && npm run smoke  # 30 checks
```

Then open <http://localhost:8080>. Without a session the history list says, in
the interface language, that you need to sign in — in blue, not red.

In Compass: a reopened ticket has `reopenedFromId` pointing at the original,
and the original still reads `status: "closed"` with its `closedAt` intact.

---

## 6. What this step does not do

- **No staff screens.** The agent queue is step 29.
- **No pagination control.** The server reports `total` and accepts `limit` and
  `before`; the client asks for 25 and does not yet offer a second page.
- **No attachment upload from the UI.** The endpoint exists from step 12; the
  detail screen lists files and does not add them.
- **The Arabic is still unreviewed.** More strings, same caveat —
  `REVIEW-PACK.md` is the plan.

---

## 6a. Sign-in, added after the fact

Step 13 originally shipped without one: the OTP API had worked since step 08,
but no UI called it, so in a browser every screen correctly showed its
signed-out state and nothing more. Four steps of customer-facing work that
nobody could actually see. It was built immediately afterwards and is part of
the same phase.

**The access token lives in memory, never in `localStorage`.** Anything in
local storage is readable by any script that reaches this origin, so one XSS
becomes a stolen session that outlives the page. The thing that survives a
reload is the refresh cookie, which is `httpOnly` and no script can read. The
cost is one request on load to exchange it — which is what the cookie is for.

**The session has three states, not two.** "We do not know yet" is real: the
refresh request takes a moment, and rendering the sign-in form during it would
flash a login screen at someone already signed in, on every reload.

**The second step is reached whatever the server says about the first.**
`request-code` answers identically for a number on a contract, a number that
is not, and one the kill switch has suppressed — that is the anti-enumeration
property step 08 built and tested. A screen that only advanced on "we sent it"
would hand the distinction straight back, so the wording is conditional by
design: *if* that number is on a contract, a code is on its way. The only
refusals shown are a rate limit and a malformed number, because a client that
cannot see those retries into a wall.

**An inactive contract is a state, not an error.** They are who they say they
are; the answer is about their contract.

### The dev inbox

A reviewer with no phone cannot sign in otherwise — the code is deliberately
never logged and never returned by the auth API. `GET /api/dev/inbox` shows
what would have been sent, as section 0 of the specification describes.

Three guards, because it hands out one-time codes: the router is **not mounted
at all** unless `DEMO_MODE` is on, so the path 404s rather than 403s (an
endpoint that answers "forbidden" tells you it exists); the flag is re-checked
per request; and the env validator refuses `DEMO_MODE` when
`NODE_ENV=production`.

The obvious alternative — returning the code in the `request-code` response
under `DEMO_MODE` — was rejected. It would make a known number's answer differ
from an unknown one, which is the exact property step 08 exists to protect.
There is a test asserting the two responses stay byte-identical.

### What the run proved

```
1. request a code     → 202
2. read the dev inbox → 964935 (+961***001)
3. verify             → 200 | entitlement: active
4. who am I           → Rania Haddad · Cedar Pharmaceuticals · ends in 001
5. my tickets         → 34 total
6. restore on reload  → 200 (new access token from the cookie)
   csrf rotated by refresh → true
7. sign out           → 204
8. refresh after that → 403 (must not be 200)
```

Line 8 is the one worth reading twice: logging out genuinely revokes the
session family, so the refresh cookie is dead rather than merely forgotten.

Line 6 also caught a driver bug that is worth recording, because it would have
been a real client bug: **the refresh rotates the CSRF cookie**, so a copy
captured before it is stale. The browser client reads `document.cookie` at
call time and is unaffected; a client that cached the token at sign-in would
have had its first logout after a reload fail with `csrf_failed`.

### And step 10's demo content is gone

`App.tsx` carried a fabricated ticket table and chat card from step 10, built
to show the component library rendering itself. The real screens now exercise
the same components against real data, and leaving a second, fake ticket table
on the page would be an invitation to wonder which one is true.

## 7. What you must configure

Nothing. `TICKET_REOPEN_WINDOW_DAYS` defaults to 14 and is in `.env.example`.

---

## 8. Checklist

- [x] History with status, date-range and text filters, applied by the server
- [x] A total that is counted with the same filter as the rows
- [x] Detail with conversation, attachments and status timeline
- [x] Transcript download, in either language, without internal notes
- [x] Configurable reopen window, creating a linked ticket rather than undoing
      a close
- [x] One rule for reopen eligibility, used by both the server and the client
- [x] Notification preferences, saved on change, consent audited
- [x] Errors read by the customer, in their language
- [x] axe clean on every new screen in both languages
- [x] Customer sign-in, with the access token in memory and the refresh cookie
      doing the surviving
- [x] The dev inbox, guarded three ways, without weakening the identical
      responses it exists alongside
- [x] The application actually run, and three bugs found by doing so
