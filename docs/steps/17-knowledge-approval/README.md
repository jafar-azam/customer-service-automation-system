# Step 17 — The knowledge gate

Approval workflow, versioning, audit, and a CSV round trip.

## Goal

Make step 15 defensible.

Retrieval reads only `approved` entries, so every claim about whether the
assistant can be trusted reduces to one question: **who put this text into that
state, and what did they look at first?** Until this step the answer was "the
seed script did", which is not an answer.

It also unblocks something concrete. Step 16 imported 79 Lebanese Arabic
questions and deliberately did not take their answers, so each one sits in the
queue with a placeholder body saying so. Somebody has to write those answers —
and nobody writes 79 of anything one web form at a time. They write them in a
spreadsheet.

---

## 1. What was built

| Piece | File |
| :-- | :-- |
| Visibility and the atomic transition | `apps/server/src/repositories/knowledge.ts` |
| The workflow: create, edit, submit, approve, reject, archive, restore | `apps/server/src/services/knowledge.ts` |
| Export and import | `apps/server/src/services/knowledge-csv.ts` |
| Routes, and publishing an approval to retrieval | `apps/server/src/routes/knowledge.ts` |
| Citations shown to the reader | `apps/server/src/routes/tickets.ts`, `apps/client/src/screens/TicketDetail.tsx` |

```
GET  /api/knowledge            list, filter, $text search
GET  /api/knowledge/queue      what is waiting for an admin
GET  /api/knowledge/:id        the entry and its frozen versions
POST /api/knowledge            create — always a draft
PUT  /api/knowledge/:id        edit; a text change freezes the old version
POST /api/knowledge/:id/submit
POST /api/knowledge/:id/approve|reject|archive|restore     admin only
GET  /api/knowledge/export.csv
POST /api/knowledge/import.csv
```

There is no customer route, deliberately. A customer reaches knowledge only
through an answer the assistant grounded in it. Letting them browse or search it
turns every draft into a disclosure and makes the gate decorative.

---

## 2. Four rules that are the actual security control

### Nothing is created approved

`createEntry` writes `status: 'draft'` whoever is asking, including a system
scope. There is no create-and-approve call to reach for. Writing and approving
in one step would make the gate a formality that a future caller could skip
without noticing it existed.

### Machine output cannot be rubber-stamped

An entry whose provenance is `generated` is **refused at approval** while
`version === 1` — meaning nobody has edited it since it was produced. Approving
the assistant's own words unchanged is exactly the loop that teaches it its own
mistakes (OWASP LLM04), and "an admin clicked approve" is not evidence that
anybody read it. Editing it makes it version 2, and then it approves normally.

### An approved entry that changes goes back through the gate

A text edit demotes `approved` to `pending_review` and **clears the old
approval**, because that approval was evidence about text the approver never
read. An approved entry that can be silently rewritten is an unapproved entry
with an approval stamp on it, and it is the obvious way to put arbitrary text in
front of customers.

Metadata-only edits — tags, category — do not demote. Re-approving for a typo in
a tag trains people to click through the queue without reading, which is worse
than not having the queue.

### Import cannot bypass any of it

The CSV carries a `status` column so the file is readable on its own, and the
importer **reads it and throws it away**. Everything an import touches lands
`pending_review`. The alternative is a spreadsheet that can publish.

---

## 3. The CSV round trip, and two things that would have broken it

### A byte-order mark, or the data is destroyed by the tool meant to carry it

Without a BOM, Excel on Windows opens a UTF-8 file as the system code page: the
Arabic questions arrive as mojibake and come back the same way. The export
writes one.

The smoke check for it was wrong before the server was: `Response.text()`
decodes UTF-8 and **strips the BOM**, per the WHATWG encoding standard, so
asserting on the decoded string reports a missing mark on a file that has one.
It reads the raw bytes now.

### A cell a spreadsheet would execute

A value beginning `=`, `+`, `-` or `@` is a formula to Excel, Google Sheets and
LibreOffice. An exported body reading `=HYPERLINK("http://…")` runs when a
colleague opens the file — CSV injection, whose target is the person opening the
spreadsheet rather than this server. Each such cell is prefixed with a quote,
which spreadsheets strip on display, and the importer removes it again so the
round trip is lossless.

`csv-stringify` does not do this: correct quoting and formula safety are
different problems and it solves the first.

---

## 4. Approving does something

`approveEntry` is followed by an embedding pass and an index invalidation.
Approving and stopping there produces an entry that is approved and
unfindable — which is the state step 15 shipped in, with 618 approved entries
and zero vectors.

The embedding failure is logged and swallowed rather than thrown: the approval
is committed and correct, and turning it into a 500 would invite the admin to
click approve again. The entry is picked up by the next backfill either way.

---

## 5. The run that proves the point

An admin signed in, read the queue, exported five Arabic rows, and made the
editorial decision the queue exists for.

**Three of the five transferred and were answered.** The imported questions came
from Lebanese telecom FAQs and this company supports maintenance contracts, so
"how is invoicing done?" and "what is the usage limit?" carry over, and one was
rewritten from *how do I find my phone's IMEI* to *how do I find the serial
number of a device covered by the contract* — the editor may change the question,
not only the answer.

**Two did not and were rejected**: the documents needed to buy a prepaid line,
and a named operator's internet settings. There is no answer this company could
give, and inventing one is precisely the failure the whole project is built to
avoid. Rejecting them is the correct outcome, not a gap.

> The three answers are **demonstration content written for this fictional
> company**, not advice from a domain expert, and not taken from the source —
> which was step 16's whole reason for importing questions only. The remaining
> 76 are still in the queue awaiting someone who knows the business.

```
import  → {"updated": 3, "unchanged": 0, "rejected": []}
reject  → draft ×2
approve → approved v2 ×3
embeddings → dim=256 model=mock ×3
```

Then, as a customer, in Arabic:

```
question   : كم عدد طلبات الدعم المشمولة في العقد؟
outcome    : answered | confidence 0.672
citations  : [{"version": 2, "title": "حدود الاستخدام في عقد الصيانة"}]
answer     : يحدّد كل عقد عدد طلبات الدعم وساعات التدخل المشمولة خلال السنة…
```

**That is the first grounded Arabic answer the system has produced.** Before
this step it had Arabic questions and no Arabic answers, so every Arabic
question escalated.

---

## 6. The gap the run exposed: grounding nobody could see

The citation above was already being recorded before this step — entry id,
version and score, written by step 15 — and **nothing ever showed it**. The
message presenter dropped the field.

An enforced-but-invisible guarantee is worth about as much as no guarantee: the
reader has no way to check that the answer came from anywhere. So the presenter
now returns citations, with an audience:

- **staff** get the entry id, and can open it;
- **customers** get the title and the version, and not the id — they have no
  knowledge endpoint to use an id on, and a reference to something you cannot
  look at is noise rather than evidence.

The audience parameter **defaults to `customer`**, the narrower one. A presenter
whose safe mode is the opt-in one leaks the first time somebody adds a call site.

The title is **frozen into the citation** at answer time, beside the version.
Showing the entry's current title next to an old version number would describe
the citation as something it was not.

In the interface the title is wrapped in `<bdi>`. An Arabic title inside an
English line is a bidirectional boundary, and without isolation a title ending in
Latin text or a digit drags the `(version 2)` to the wrong side of it. The test
asserts the element rather than the rendered string, so nobody simplifies it back
into one interpolation string.

---

## 7. Versions, capped

Every text edit freezes the previous title, body and status with the editor and
a change note, and bumps `version`. The history is capped at **50** in the same
`$push` — unbounded history is a document that grows until it hits MongoDB's
16 MB limit and then fails every write with an error that has nothing to do with
the edit being attempted. What falls off the end is reconstructible from the
audit log, which is append-only and never trimmed.

Archiving is not deleting, for the same reason: a message that cited an entry
has to stay explicable, and a deleted citation is a dangling reference in a
transcript a customer may still be holding.

---

## 7a. A flaky security test, and why it mattered

Two tests — `still scopes every filter to the caller` and `cannot widen its own
scope through the query string` — failed roughly once in six full-suite runs.
Both are cross-customer authorization tests.

The cause was in the fixtures, not the product. Eight test files each contained
a copy of:

```ts
const message = await Notification.findOne({ kind: 'otp' }).sort({ createdAt: -1 }).lean();
```

"The newest one-time code", with no check of **whose** it was. `createdAt` is
millisecond-resolution, so two sign-ins landing in the same millisecond made the
sort a coin flip: the second customer could verify with the first customer's
code, fail, and run the rest of the test unauthenticated. The assertion then saw
a 401 body instead of a result.

It is worth writing up because of where it landed. The honest reading of a red
isolation test is that isolation broke; the trained response to a flaky one is to
run it again. A fixture that makes a security test unreliable quietly converts
the most important tests in the suite into noise.

Replaced by one `otpCodeFor(e164)` in `test-support.ts` that filters by
recipient and breaks the remaining tie on `_id`, with a regression test that
writes two codes at an identical timestamp and asserts each number gets its own.
Six consecutive full-suite runs clean.

## 8. How to verify

```bash
npx vitest run                 # 60 files, 1038 tests
node scripts/smoke/smoke.mjs   # 44 checks through nginx
npm run audit:checklist        # 135 requirements — 103 done, 31 planned, 1 accepted
```

The round trip by hand, as an admin:

```bash
curl -s "http://localhost:8080/api/knowledge/queue" -H "authorization: Bearer $STOK" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['total'], 'awaiting review')"

curl -s "http://localhost:8080/api/knowledge/export.csv?status=pending_review&language=ar" \
  -H "authorization: Bearer $STOK" -o queue.csv
# …write answers in the body column…
curl -s -X POST "http://localhost:8080/api/knowledge/import.csv" \
  -H "authorization: Bearer $STOK" -H "x-csrf-token: $SCSRF" \
  -H 'content-type: text/csv' --data-binary @queue.csv
```

In Compass: `kb_entries` shows `versions` growing by one per text edit,
`approvedByStaffId` set on approval and unset by a later edit, and
`embeddingUpdatedAt` moving when an entry is approved.

---

## 9. What this step does not do

- **No management screen.** The approval queue as a page is step 29, with the
  rest of the dashboard. This step is the workflow and the CSV, which is what
  the 76 remaining questions actually need.
- **No automatic scan of submitted text for injection attempts.** Step 15
  neutralises control characters at prompt time and the citation check catches
  an answer citing something it was not shown; a reviewer reading the entry is
  the control here, which is the honest description of it.
- **No second-approver rule.** An admin may approve their own entry. An admin
  can already change another account's role, so forbidding it is theatre — but
  both ids are in the audit metadata, so it is visible rather than implied.

## 10. What you must configure

Nothing. One dependency was added: `csv-stringify@6.9.0` (MIT, same maintainer
as the `csv-parse` already in use).

## 11. Checklist

- [x] Entries are created `draft`; there is no create-and-approve path
- [x] Only an admin approves; an agent gets 403
- [x] Unedited `generated` content cannot be approved
- [x] A text edit demotes an approved entry and clears the approval
- [x] Concurrent approvals approve once
- [x] Versions frozen and capped; archive instead of delete
- [x] CSV export with a BOM and formula-injection guards
- [x] CSV import ignores `status`; rejections name the line
- [x] Approval embeds and invalidates the index
- [x] Citations shown, audience-scoped, title frozen, `<bdi>` isolated
- [x] `CHECKLIST.md` section 20, ten rows, all **done**
- [x] The flaky OTP fixture replaced by one recipient-filtered helper
