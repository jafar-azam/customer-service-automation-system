# Step 16 — Closing the loop

Resolution confirmation, a one-to-five rating, escalation to the on-duty agent,
and the signed delivery callbacks that report on the message it sends.

## Goal

Answer one question — *did that actually solve it?* — and act on the answer.

Without it, the only signal about whether the assistant is any good is the
absence of complaints, which is not a measurement. Step 21 then has nothing to
evaluate against except the assistant's own confidence scores, which is
circular: a model grading its own homework.

So the customer is asked, and **"no" is a first-class answer**. It reopens the
conversation and hands it to a person, rather than leaving someone to start
again from the beginning — which is what they do otherwise, and why a support
queue fills with three tickets about one problem.

---

## 1. What was built

| Piece | File |
| :-- | :-- |
| Confirmation, rating, escalation | `apps/server/src/services/resolution.ts` |
| One rule for which language a generated line is written in | `apps/server/src/services/reply-language.ts` |
| The two customer routes, and eligibility on the detail response | `apps/server/src/routes/tickets.ts` |
| Signed, idempotent delivery callbacks | `apps/server/src/routes/webhooks.ts` |
| The prompt, the scale and the standalone rating form | `apps/client/src/screens/TicketDetail.tsx` |
| An accessible 1–5 scale | `apps/client/src/components/index.tsx` |

New endpoints:

```
POST /api/customer/tickets/:id/confirm    { solved, score?, comment? }
POST /api/customer/tickets/:id/rating     { score, comment? }     → 204
POST /api/webhooks/messaging              signed, unauthenticated  → 202
```

---

## 2. Three decisions worth defending

### `solved` is required and has no default

A default would mean a malformed client silently records satisfaction nobody
expressed. This is the one number in the system that must not be inferred, so
a body without it is a 400.

### Only the customer may confirm

Enforced in the service, not only at the route — a later internal caller meets
the same check. An agent marking their own work as confirmed would make every
satisfaction figure meaningless, and it is exactly the shortcut a busy queue
invites.

The staff router has no such route at all, so an agent gets a **404 rather
than a 403**: an endpoint that answers "forbidden" has confirmed it exists.

### Assignment and notification happen together

Assigning without notifying produces a queue nobody is watching. Notifying
without assigning produces a message everybody assumes someone else took. Both,
or neither.

The notification carries **the reference and a link, never the subject or the
conversation**. It goes to a phone, often to a lock screen, and a customer's
words have no business there (`PRIVACY.md` §5). The live run confirms it:

```
to=+961***000  status=sent
preview=C.S.A.S: CSAS-000054 needs you (customer rejected answer). /staff/tickets/6adf5ef5…
```

The Arabic subject of that ticket — `الطابعة توقفت بعد التحديث` — appears
nowhere in it.

---

## 3. The webhook is the only unauthenticated route in the system

Three properties, and they are the whole design.

**Signed, and verified against the raw bytes.** A signature covers exactly the
bytes that were sent. Verifying against a re-serialised body compares a
signature to something the sender never signed — key order, whitespace and
number formatting all change under `JSON.parse` + `JSON.stringify`.

This is why the route is mounted **before** `express.json` in `app.ts`. A raw
parser behind the JSON parser receives an already-consumed stream: `req.body`
is an empty buffer, every honest call fails the check, and the obvious "fix" is
to verify against the parsed body — which is to say, to delete the check.
`smoke.mjs` now drives a correctly signed callback through nginx, so a refactor
that reorders the middleware fails a test rather than silently disarming it.

**Idempotent.** Providers retry on any non-2xx and sometimes on a slow 2xx. The
ordering guard is part of the update *filter*, so a redelivered or out-of-order
report matches no document — one atomic conditional update, never
read-then-write. The first version wrote unconditionally and restored the old
value if the report turned out to be stale, which loses a concurrent report
that arrives between the two writes.

**Fast and uninformative.** 202 for everything accepted, including an id that
does not exist. A callback that answers 404 for an unknown id is an enumeration
oracle. The body is capped at 64 KB and rate-limited per address.

---

## 4. Four bugs, and where each came from

### 4.1 No Arabic knowledge entry could ever be stored

Found while importing Arabic questions. Inserting a knowledge entry with
`language: 'ar'` failed outright:

```
MongoServerError: language override unsupported: ar
```

MongoDB treats a field literally named `language` as the per-document
**text-search language override**, and Community supports no Arabic text
language. This collection has exactly such a field. The text index had to say
where the override really lives:

```ts
kbEntrySchema.index(
  { title: 'text', body: 'text', question: 'text' },
  { default_language: 'none', language_override: 'textLanguage' },
);
```

Nothing caught it because every fixture in the suite was English — a bilingual
product whose tests were monolingual. `models.test.ts` now stores an Arabic
entry, an English one beside it, and searches across both; reverting the index
options fails three tests.

### 4.2 The first delivery report for every message was silently dropped

`webhooks.ts` declared a local four-element `DELIVERY_STATUSES` that shadowed
the shared six-element one, then used it for **two different jobs**: the
statuses a report may *carry*, and the statuses a report may *overwrite*. Since
every notification is created at `queued` and `queued` was absent from that
list, the guard could never match:

```
sent       →  $in: []                      ← matches nothing
delivered  →  $in: ["sent"]
```

Every first callback was accepted with a 202 and changed nothing. The two lists
are now separate — `REPORTABLE` for what a provider may say, the shared
`DELIVERY_STATUSES` for what may be overwritten — and `suppressed` outranks
everything, so a decision not to send cannot be rewritten into a delivery.

### 4.3 The provider's failure reason went nowhere

The update wrote `errorCode`; the schema field is `error`. Mongoose is `strict`
by default and drops an unknown path from an update without complaining, so the
reason a message failed was discarded on every failed send. `tsc` cannot see
this — an update object is not typed against the schema — so the test asserts
the stored document, not the call.

### 4.4 One thread, two languages

Found by reading the screen, not by a test. `CSAS-000054` was opened in Arabizi,
so `inputForm` was `arabizi`, but the question put to the assistant was typed in
Arabic script. `rag/respond.ts` chose by the script of the live text and handed
over in Arabic; step 16's confirmation chose by the recorded `inputForm` and
came back in English — same thread, same person, two languages.

Both rules were defensible; having two was the bug. `services/reply-language.ts`
is now the single rule: **text wins when there is text**, because what someone
just typed is better evidence than a label set from their first message days
earlier. Arabizi still gets English, which is the decision `respond.ts` already
recorded — a Lebanese Arabizi fixed string written by me is a guess at register
the Phase 6 reviewers have not seen.

---

## 5. Two more found by looking at the running page

Neither is step 16's code. Both were invisible to 1,000 passing tests and
obvious in a screenshot.

**Four ticket statuses had no translation.** `status` held `new`, `open`,
`inProgress`, `pending`, `resolved`, `closed` — but the enum is `open`,
`assistant_answering`, `awaiting_customer`, `escalated`, `in_progress`,
`resolved`, `closed`, `reopened`. So an Arabic page showed `awaiting_customer`
in English snake_case, and two of the keys that *were* there had never been
statuses of this system.

**Every non-customer author was labelled "Assistant".** The call site read
`message.author === 'customer' ? 'customer' : 'assistant'`, so a human agent's
reply was attributed to the AI — the one distinction this product exists to
keep honest.

The durable fix is in `i18n.test.ts`: every value of `TICKET_STATUSES` and
`MESSAGE_AUTHORS` must have a label in every locale, and a label for a status
that does not exist is a leftover. `defaultValue` is still right at the call
site — a status added tomorrow should render *something* — but a fallback that
renders the key is indistinguishable from a translation until someone reads the
screen.

---

## 6. The rating is a radio group, not five buttons

`SegmentedControl` already existed and uses `aria-pressed`. A screen reader
reading five of those announces five independent toggles. A radio group
announces "3 of 5", arrow keys move between the options, and the browser
enforces that only one is chosen — none of which has to be written.

The numbers are labelled rather than drawn as stars: a star is an image of a
quantity, and this project does not use emoji as icons. Each option carries a
full sentence as its accessible name (`4, helpful`), set as `aria-label` on the
input — the first attempt put a visually-hidden copy inside the `<label>` next
to an `aria-hidden` number and the two were concatenated into
`22, not very helpful`.

Verified with real key events, because `element.focus()` does not satisfy
`:focus-visible` in Chrome:

```
tab 1 reached: 4، مفيدة
matches :focus-visible: true
ring drawn on the label: solid 2px rgb(92, 191, 179)
after two ArrowRight presses: 2، غير مفيدة كثيرًا | checked=true
```

In RTL, `ArrowRight` correctly walks toward 1.

---

## 7. How to verify

Start the stack, then:

```bash
npx vitest run                 # 58 files, 1011 tests
node scripts/smoke/smoke.mjs   # 37 checks through nginx
npm run audit:checklist        # 125 requirements — 93 done, 31 planned, 1 accepted
```

### The loop, by hand

With a ticket in `awaiting_customer` (an agent has replied):

```bash
curl -s -b jar -X POST "http://localhost:8080/api/customer/tickets/$TID/confirm" \
  -H "authorization: Bearer $TOK" -H "x-csrf-token: $CSRF" \
  -H 'content-type: application/json' \
  -d '{"solved":false,"score":1,"comment":"same error after restarting"}'
```

```
ticket status : escalated
escalated     : True
reply to them : أُحيل الطلب إلى أحد المختصين وسيتم التواصل معك.
```

In Compass: `escalations` has one row with `reason=customer_rejected_answer`,
a `toStaffId` and a `notifiedAt`; `notifications` has the WhatsApp message with
the reference and no subject; `satisfaction_ratings` has one row per ticket, a
second submission replacing the first rather than adding to it.

### The callback lifecycle

```
start: queued
  sent       → 202   status=sent      sentAt=set
  delivered  → 202   status=delivered deliveredAt=set
  delivered  → 202   (idempotent, unchanged)
  sent       → 202   (out of order, still delivered)
  read       → 202   status=read
  unknown id → 202   (not 404)
  queued     → 400   (a status only we may set)
```

---

## 8. What this step does not do

- **Staff contact details.** `escalate` sends to a documented placeholder
  (`+96100000000`) until step 29 stores them. A fake number cannot page a
  stranger if this ever runs against a live provider by mistake.
- **Calibrated confidence.** Still step 24.
- **Reminding a customer who never answers.** The ticket sits in
  `awaiting_customer`; the SLA sweep from step 14 is what notices.

## 9. What you must configure

Nothing. The messaging provider is the mock, as always, and the dev inbox at
`/api/dev/inbox` shows every message the system would have sent.

## 10. Checklist

- [x] Confirmation, customer-only, enforced in the service
- [x] 1–5 rating, one per ticket, replaceable
- [x] Escalation assigns from the step 14 rota **and** notifies
- [x] The notification carries no customer content
- [x] Webhook signature verified against the raw body, through nginx
- [x] Redelivered and out-of-order callbacks change nothing twice
- [x] 202 for an unknown id
- [x] An accessible rating scale, keyboard-verified in both directions
- [x] `CHECKLIST.md` sections 18 and 19, six rows, all **done**
