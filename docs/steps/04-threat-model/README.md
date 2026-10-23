# Step 04 — Threat model and security checklist

**Phase 2. Status: complete.** No feature code — this step decides what the next
four steps are allowed to build.

## Goal

Work out what can go wrong, and write it down **before** writing the code it
would go wrong in.

Three documents come out of this step, and one small piece of tooling that keeps
the most fragile of them honest:

| File | What it answers |
| :-- | :-- |
| [`docs/security/THREAT_MODEL.md`](../../security/THREAT_MODEL.md) | What an attacker wants, where the trust boundaries are, and what goes wrong at each component and each data flow |
| [`docs/security/CHECKLIST.md`](../../security/CHECKLIST.md) | 88 numbered requirements → control → code → **the test that proves it** → status |
| [`docs/security/PRIVACY.md`](../../security/PRIVACY.md) | What personal data exists, why, for how long, and what a customer can ask for |
| `scripts/checklist-audit.mjs` | Whether the checklist is still telling the truth about itself |

## 1. Why this comes before step 05 and not after step 33

Two of the three documents change the **data model**, which step 05 is about to
write:

- Phone numbers need an encrypted column *and* a separate peppered hash column,
  because the number is both the login identifier and the most sensitive field.
  Retro-fitting that to a schema means a migration and a window where plaintext
  numbers exist.
- Every retention period needs a field to hang on — closure dates, consent
  records, `Publishable` flags. A retention rule invented after the schema is a
  rule nobody can enforce.

Writing the threat model after the features is how you get a document that
describes what was built rather than what should have been.

## 2. Decisions the threat model forces, and what they rule out

These are recorded in `THREAT_MODEL.md` §7 so that no later step quietly
reverses one. The reasoning:

### 2.1 Object-level authorization lives in the repository layer

The most likely attacker in this system is **an authenticated customer with
someone else's ticket id** — not an outsider. That is OWASP API Security #1, and
it is the risk ranked highest (9/9) in §6 of the threat model.

A check in a route handler is a check that can be forgotten in one of forty
handlers. Putting ownership enforcement in the repository means the dangerous
operation is the one that has to be *asked for explicitly*, rather than the safe
one having to be remembered.

Rejected: middleware-based checks (they do not know which object is being
touched) and per-handler checks (they rely on forty people being careful).

### 2.2 Retrieval is filtered *before* similarity, not after

The assistant must only use approved knowledge-base entries. Filtering after the
vector search would still search the whole index, which leaks the existence of
draft and archived content through timing and result counts, and turns any
future bug in the filter into a disclosure.

### 2.3 Escalation messages carry a link, never the conversation

A phone number outlives the person who owned it; a WhatsApp account can be
recycled or compromised. A notification says "ticket #123 needs you" and nothing
about what the customer wrote.

### 2.4 The OTP code is never written anywhere except its hash column

Not a log line, not an error message, not an event payload, not a metric label.
This is the reason `code` is deliberately **not** in the logger's redaction list
(step 03 §2.2): redaction is a second line of defence, and relying on it here
would blind the error-rate alerts to protect a value that should never have been
passed to the logger in the first place.

### 2.5 Identical responses to every account-existence question

OTP start, password reset, staff login. Same body, same status, and approximately
the same timing. "This number is not registered" is an enumeration oracle that
turns a leaked phone list into a verified customer list.

### 2.6 No pickle, ever

`pickle.load` is arbitrary code execution. A model artefact is a file that
arrives from a training process and gets loaded by a service — exactly the shape
of a supply-chain attack. safetensors or ONNX, with the hash recorded at
registration and verified at load, and a loader that refuses the format outright
so "just for this experiment" cannot happen.

### 2.7 The human test set is write-once

Never used for training, never used for threshold tuning, never placed in the
knowledge base. This is an integrity control, not just good science: a test set
that has leaked into training reports a number that cannot be defended.

## 3. What the privacy document changes

Grounded in `docs/research/privacy-law.md` (Lebanese **Law 81/2018**, Articles
86–109), and three findings from it drive design rather than prose:

1. **"Educational" is not a legal basis.** The research says plainly that calling
   a project a portfolio does not bring it inside the personal/private-activity
   exception. What protects this release is the *boundary*: the published
   repository contains only synthetic and licensed data. Step 05 flags every row
   imported from the real CSV `Publishable: false`, and step 37 **fails the
   release** if such a row reached a committed file. The flag is the control;
   the policy is only its justification.

2. **Support and AI training are different purposes.** The research warns that
   ordinary product improvement does not inherit the research exception. So
   consent is modelled per purpose, unchecked by default, versioned and
   timestamped — and voice recording and AI training are *separate* permissions,
   neither of which affects the support a customer receives.

3. **The 10-day rights deadline.** Article 101 says 10 days for correction;
   Article 107 penalizes failure to answer within 10 *working* days. Rather than
   argue the difference, the system uses 10 calendar days for both.

The retention schedule (12 months for tickets, 30 days for voice, 90 for
attachments, 6–12 months for audit logs, 14–30 days for application logs) comes
from the research's table, which explicitly labels these **proposed starting
policies, not legal safe harbours**. That caveat is reproduced rather than
dropped, and the ten unanswered lawyer questions are listed as open.

## 4. The checklist audit, and why a document needed a test

`CHECKLIST.md` is the document most likely to quietly become false: rows drift to
**done** while the control is still planned, or the summary counts stop matching
the table. A checklist that is wrong is worse than none, because it gets cited as
evidence.

So `npm run audit:checklist` re-derives everything from the table and fails on:

- a status that is not `done`, `step NN` or `accepted` — no "mostly", no "✔";
- a row that names no code or no test (an `accepted` row may, since that is what
  accepted means);
- a duplicated requirement id;
- header counts that disagree with the rows.

**It earned its place immediately.** The first run reported that the header I had
just written said "8 done, 72 planned, 6 accepted" while the table actually held
**18 done, 69 planned, 1 accepted**. Hand-counted numbers were wrong on the day
the document was created, which is exactly how long such numbers stay right.

What it deliberately does *not* do is claim that a **done** row's test exists and
passes — that requires reading the code, and it is step 34's job. This checks the
shape of the document, not the truth of the system.

Nine tests cover it, including the drift case that found the real error.

## 5. Where the numbers stand

```
88 requirements — 18 done, 69 planned, 1 accepted
```

The 18 already done are the ones Phase 1 produced as a side effect of building
the foundation properly: environment validation and fail-fast, no secret values
in errors, request-size limits, CORS and header hygiene, non-root containers,
pinned image digests, lockfiles and audits, log redaction, log-injection refusal,
bounded metric labels, and the secret scanner over full history.

The 69 planned rows each name the step that will implement them. Step 34 re-walks
every row against the implementation and reports what does not hold.

## 6. Exact commands

```bash
npm run audit:checklist     # re-derive the counts and check the structure
npm run verify              # now includes the checklist audit
npx vitest run --config vitest.tooling.config.ts
```

## 7. How to verify

| # | Check | Expected |
| :-- | :-- | :-- |
| 1 | `npm run audit:checklist` | `88 requirements — 18 done, 69 planned, 1 accepted` |
| 2 | Change any status cell to `mostly done`, re-run | `docs/security/CHECKLIST.md:34 (1.1): status "mostly done" is not done / step NN / accepted`, exit 1 — and it also notices the count that just changed underneath |
| 3 | Change a header count to 25, re-run | `header says "25 done, …" but the table has "18 done, …"`, exit 1 |
| 4 | `npx vitest run --config vitest.tooling.config.ts` | 69 tests pass (9 new) |
| 5 | Read `THREAT_MODEL.md` §5 against `reference/dfd-level1.drawio` | every flow in the diagram appears, plus F7–F13 that the specification adds |
| 6 | Read `CHECKLIST.md` §11 against step 03's README | the five **done** logging rows each name a test that exists |

Checks 2 and 3 were run; both failed as intended and were reverted.

Nothing to inspect in MongoDB yet — step 05 creates the first collections, and
its README starts the Compass walkthrough.

## 8. What you must do

Nothing. This step adds no configuration and no dependencies.

One thing to **know** rather than do: `THREAT_MODEL.md` §8 lists six risks
accepted for this release — no TLS locally, secrets in a `.env` file, opt-in
ClamAV, audit-log immutability by convention rather than WORM storage, no
external alerting, and per-instance rate limits. Each names the roadmap item that
revisits it. If a committee asks "what did you not secure?", that section is the
answer, and it is better to have written it than to be asked for it.

## 9. Test results

```
Tooling: 69 tests passed (4 files) — 9 new for the checklist audit
Node:    169 tests passed
Python:  32 tests passed
Lint, format, types, build, secret scan: clean
checklist-audit: 88 requirements — 18 done, 69 planned, 1 accepted
```

## 10. Known limitations opened by this step

- **ASVS L2 is a target, not a certification.** No compliance claim appears in
  the repository, and unmet requirements are marked unmet rather than omitted.
- **The threat model is only as good as the architecture it describes.** It will
  be wrong somewhere; each step updates it as it changes the system, and step 34
  re-walks it in full.
- **The privacy document is a design document, not legal advice.** Ten questions
  are open and listed. The portfolio boundary — synthetic and licensed data only
  — is what makes shipping it defensible, not the analysis.
- **The checklist audit checks structure, not substance.** A row can name a test
  that does not exist and still pass. Step 34 closes that gap by reading the
  code.

## 11. Checklist

- [x] STRIDE per component: client, proxy, server, MongoDB, Redis, ML service,
      attachments, LLM/retrieval, training pipeline
- [x] STRIDE per data flow: every flow in the level-1 DFD, plus the seven the
      specification adds (attachments, voice, escalation, KB approval, exports,
      training, sockets)
- [x] Five trust boundaries drawn, including the offline training boundary most
      models omit
- [x] OWASP Top 10, API Top 10 and LLM Top 10 mapped; ASVS L2 referenced per row
- [x] Risk ranking that actually determines build order
- [x] Residual risks stated with the reason and the roadmap item
- [x] 88 requirements with control, code, test and status
- [x] Privacy design grounded in the Lebanese research, with the retention
      schedule and the ten open legal questions reproduced honestly
- [x] A machine check that stops the checklist from drifting, with tests
- [x] Wired into `npm run verify` and into CI
