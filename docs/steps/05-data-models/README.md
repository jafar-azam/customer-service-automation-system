# Step 05 — Data models, seed script and CSV import

**Phase 2. Status: complete and verified** against both the in-memory test
database and the running Compose stack on 2026-10-23.

## Goal

Turn the reference EERD into collections that can carry the whole
specification — SLA timers, attachments, consent, audit, the knowledge-base
approval gate, the ML registry — and fill a database with something real
enough to build against: **618 licensed knowledge-base entries, three demo
customers with three different contract states, and one admin**.

Three rules shaped everything here:

1. **The seed never deletes.** Not before writing, not to "reset", not ever.
2. **Unpublishable data must be unable to leak** — not by policy, by schema.
3. **The database enforces its own rules**, because the application is not the
   only thing that will ever write to it.

---

## 1. What was built

```
packages/shared/src/
├── domain.ts          every enumeration the client, server and tests share
└── phone.ts           E.164 normalization (no secrets — safe in the browser)

apps/server/src/
├── crypto/phone.ts    AES-256-GCM encryption + peppered HMAC lookup hash
├── db/
│   ├── connection.ts  connect, critical readiness probe, explicit index sync
│   ├── validators.ts  $jsonSchema validators enforced by MongoDB itself
│   ├── test-db.ts     a real in-memory replica set for tests
│   └── models/        24 collections in four files, by subject
└── seed/
    ├── index.ts       `npm run seed` — validators → indexes → admin → data
    ├── seed.ts        first admin (once), demo customers and contracts
    ├── techqa.ts      the publishable knowledge base
    ├── seniordata.ts  the real CSV: local-only, never publishable
    └── repo-root.ts   path resolution that survives being run from a workspace
```

24 collections: `staff_users`, `customers`, `contracts`, `tickets`, `messages`,
`attachments`, `resolutions`, `escalations`, `satisfaction_ratings`,
`kb_entries`, `dataset_items`, `review_records`, `sessions`, `otp_challenges`,
`password_reset_tokens`, `recovery_codes`, `audit_logs`, `notifications`,
`duty_shifts`, `contact_messages`, `feedback_events`, `model_versions`.

## 2. Mapping the EERD, and where it was changed

A reviewer holding `reference/eerd-schema.drawio` should be able to follow this
table without guessing. Every rename and every omission has a reason.

| EERD | Here | Why |
| :-- | :-- | :-- |
| `Users` ⟶ `Employee` | `staff_users` | Split by `role` into agent and admin: they need different authority |
| `Users` ⟶ `Customer` | `customers` | — |
| `Users.password` | **removed for customers** | Customers authenticate with a one-time code and have no password at all, which removes a whole class of breach. Staff keep one |
| `contracts` | `contracts` | Plus `tier`, `status` and `remindersSent` (step 31 needs idempotent reminders) |
| `Departments` | **dropped** | One support desk. A table with one row is a join that buys nothing |
| `products_purchased` | `customers.products` | An array: there is no product entity to join to in this release |
| `ticket` | `tickets` | Plus SLA fields, status history and the input form |
| `problems` | **folded into `tickets`** | The diagram allows several problems per ticket; in practice one conversation is one problem, and a second problem is a second ticket the SLA can be measured against |
| `reports` | `resolutions` | Renamed: "report" reads as analytics |
| `logs` | **split** into `messages` and `audit_logs` | The EERD conflates an interaction trace with an audit trail. They have different readers, different retention (12 months vs 6–12 months) and different rules — the audit log holds references, never content |
| — | 14 new collections | Sessions, OTP challenges, recovery codes, attachments, escalations, notifications, rota, consent, dataset items, review records, feedback events, model registry: everything the written specification adds beyond the diagram |

## 3. Decisions worth defending

### 3.1 Phone numbers: encrypted *and* searchable

The number is the login identifier, so it must be findable in one indexed read;
it is also the most sensitive field in the database, so it must not sit in
plaintext in a dump. Those requirements fight. The resolution is two columns:

```
phoneEncrypted  AES-256-GCM(number)        reversible, shown to a human
phoneHash       HMAC-SHA-256(E.164, pepper) deterministic, indexed, unique
```

Login hashes what was typed and looks up `phoneHash`; **nothing is decrypted on
the authentication path**.

Two details that matter more than they look:

- **Normalize before hashing.** `03 123 456`, `+961 3 123 456` and
  `009613123456` are one customer. Without normalization they are three — and
  three customers for one person means three OTP rate-limit buckets, which is a
  bypass, not a cosmetic bug.
- **A pepper, not just a hash.** Lebanese mobile numbers are a space of a few
  million; a plain SHA-256 of every possible number is minutes of work. The
  pepper lives in the environment, never in the database, so a stolen dump
  alone cannot be enumerated. The attacker needs the dump *and* the
  configuration.

Argon2 was rejected for the lookup: it needs a per-record salt to be worth its
cost, and a per-record salt cannot be looked up.

### 3.2 Two database identities, not one

The application user holds `readWrite` on one database. That is **not enough to
attach a schema validator**, which needs `dbAdmin` — and the discovery of that
is in §6.2, because it is the kind of thing only running the thing twice finds.

The fix was not to grant the application more. A second identity, `csas_migrator`,
holds `readWrite + dbAdmin` and is used only by `npm run seed` and future
migrations. The server process never loads it.

What that buys: **a compromised application cannot remove the rules that
constrain it** — cannot drop a validator, cannot drop an index, cannot quietly
widen an enumeration. Schema authority belongs to a command a human runs.

### 3.3 Validation in two places, deliberately

Mongoose validates what the application writes. `$jsonSchema` validators are
enforced by MongoDB, so they also hold for a migration script, a `mongosh`
session, a restored backup being patched by hand, or any future service. The
specification asks for schema validation, and "validated by the ORM" would not
be it.

They are deliberately **thin** — required fields, types, and the enumerations
that carry security meaning. Duplicating every Mongoose rule would create two
sources of truth that drift, and the drift would show up as a write that passes
in tests and fails in production. The rule used: *if getting it wrong is a
security or integrity problem, it is in both; if getting it wrong is a bug,
Mongoose alone is enough.*

`strict: 'throw'` is the other half. Mongoose's default **silently drops** a
field not in the schema — turning a typo into data that vanishes without a
sound, and a mass-assignment attempt into a quiet partial success.

### 3.4 Indexes are explicit, and stale ones are dropped

`autoIndex: false` and `autoCreate: false`: building indexes on boot is fine
with ten documents and a stall with a million. `npm run seed` synchronises them
with visible output.

`syncIndexes()` also **drops** indexes the models no longer declare. An index
left behind after a schema change costs write throughput forever and nobody
notices, because nothing fails.

### 3.5 Retention that a failed job cannot forget

TTL indexes on `sessions`, `otp_challenges` and `password_reset_tokens`: MongoDB
deletes them itself. `attachments.deleteAfter` is **required by the validator**,
so a file cannot be stored without an expiry — the retention promise in
`PRIVACY.md` is enforced by the schema rather than by remembering.

### 3.6 TechQA as the seed knowledge base

618 real support questions, each paired with a **human-selected answer span**
inside a specific document. That turns grounding from a claim into a
measurement: step 15's citation check and step 21's grounding metric can compare
what the assistant cited against what an annotator marked. A synthetic knowledge
base cannot support that, because the generator would be grading itself.

Licence: **CDLA-Permissive-1.0** (from the archive's own `README.txt` and PDF),
correcting `datasets.md`, which recorded Apache-2.0 — that is the licence on the
repository's *code*, not on the data.

Imported as **approved**, because importing a licensed reference corpus is an
administrative act; 618 rows in the review queue would make the approval queue
useless for what it is for. The import is audit-logged and every entry carries
its provenance.

**618, not 621.** Three instances are marked `ANSWERABLE: Y` and carry an empty
`ANSWER` (`DEV_Q014`, `DEV_Q094`, `VAL_Q014`). They are dropped rather than
imported as entries with no content. The number in the README is the number the
importer actually produced.

### 3.7 `seniordata.csv`: imported, never approved, never publishable

Every row is written with `license: proprietary-local` and `publishable: false`,
and lands in `pending_review` — which means **the assistant can never retrieve
it**, because retrieval reads approved entries only. There is a test for exactly
that, because it is the property that matters.

Three reasons it is not approved, and the easy choice would have been to approve
it:

1. It has not been de-identified. The free text carries first names
   — rows read like "&lt;first name&gt; called to check his porting out status",
   with the real name in place — gendered references and churn detail tied to
   identifiable people. Paraphrased here rather than quoted, for the same
   reason the file is git-ignored.
2. The domain is **Indian mobile telecom** — porting to Idea and BSNL, data
   plans — not the IT support this product is for. Approving it would teach the
   assistant to answer confidently about the wrong industry.
3. It demonstrates the approval gate on real data, which is the point of having
   the gate.

**What is deliberately not imported:** `Priority`, `SentimentScore`,
`TimeToResolution`, `SatisfactionRating`, `FollowUpRequired`,
`CallDurationSeconds`, `AgentID`, `CustomerID`, `LocationID`. Those describe a
*ticket*, not a knowledge entry. Copying them onto a knowledge entry would
manufacture operational history for incidents this system never handled —
exactly what `datasets.md` warns against. Priority and follow-up survive as
tags, where they are visibly annotations rather than measurements.

### 3.8 Tests run against a real MongoDB

`mongodb-memory-server` with a **replica set**, not a mock.

Most of what this step claims is enforced *by MongoDB*: unique indexes, TTL
expiry, `$jsonSchema` validators, transactions. A mock would assert that the
code calls the driver — a different statement, and one that would pass with
every index missing. The replica set is needed because transactions require
one, and step 06 must commit a token rotation, a session revocation and an audit
entry together.

Cost, stated honestly: the first run downloads a `mongod` binary (~90 MB,
cached afterwards). A contributor on a slow connection will notice. The
alternative — a Docker service container in CI — stays documented as the
fallback if that ever becomes a problem.

## 4. Six defects, each found by running something

This step's real lesson. None of these were visible by reading the code.

### 4.1 The second seed failed where the first succeeded

`createCollection` is permitted to `readWrite`; **`collMod` is not**. So the
first seed created the collections with validators attached and the second —
the idempotent re-run that is the whole promise — died with *"not authorized on
csas to execute command collMod"*.

The fix is §3.2's migration identity. The finding only exists because the seed
was run twice; a single run looks like success.

### 4.2 A collection-creation race

`applyValidators` listed the collections, found one absent, and then
`createCollection` failed because Mongoose had created it in the meantime —
models auto-create their collection on first use. Two fixes: `autoCreate: false`
so creation is explicit, and a fallback to `collMod` on `NamespaceExists` so the
function is safe against any state.

### 4.3 `syncIndexes` silently synchronised nothing

A test that imported only `connection.ts` revealed that index sync iterates
`mongoose.models` — which is **empty until a model module has been imported**.
In the seed it happened to work, because the seed imports models first.

`connection.ts` now imports the model registry for its side effect, and
`syncIndexes` throws if the registry is empty rather than reporting success
having created nothing. This one would have surfaced in production, months
later, as "why are these queries slow".

### 4.4 The real CSV ends mid-field

Line 54 of `seniordata.csv` opens a quote and the export stops. `csv-parse`
reports `CSV_QUOTE_NOT_CLOSED` and **discards all 52 records it had already
read**, which aborted the entire seed over one truncated line in an optional
input.

Now a failed parse is retried on the content up to the last complete line: 52
records kept, the incomplete one dropped, and the line number reported. Real
exports are truncated more often than anyone admits.

### 4.5 Paths resolved against the workspace, not the repository

npm runs a workspace script with the *workspace* as the working directory, so
`data/external/techqa` became `apps/server/data/external/techqa` and the seed
reported "no corpus found" while the corpus sat exactly where it was configured
to be. `findRepoRoot()` walks up to the manifest that declares workspaces.

### 4.6 The admin's email logged as `[redacted]`

Correct behaviour from step 03's redaction list — and useless in a seed message.
It now logs `emailMasked: "a***n@csas.local"` through `maskEmail`, which is the
convention that exists precisely for this. A small thing, but it is the first
real use of the masked-field convention, and it proves the convention works.

### 4.7 One more, found by the *clean* build

`docker compose build` failed where the local build passed: an incremental
`tsc -b` had skipped re-checking a file whose types had become too deep to
infer. Mongoose's `InferSchemaType` collapses on large schemas — and when it
collapses it does not error, it quietly returns `{ id: string }`, taking type
safety with it. Nine schemas now carry explicit interfaces, which are better
documentation than the inferred types were.

A second-order finding from the same place: annotating the shared schema options
as `SchemaOptions` widened the literal types and made **every** document type in
the project collapse, silently. The options object is deliberately unannotated,
with a comment saying why.

### 4.8 The documented `npm run seed` did not work

Found by a review pass that ran the command as the README writes it, rather
than the variant I had been typing by hand:

```
npm error command failed: node --env-file-if-exists=../../.env dist/seed/index.js
```

`MONGODB_MIGRATION_URI` names the host `mongo`, which exists only inside the
Compose network. The documented path had never been exercised — every run so
far had passed a `127.0.0.1:27018` URI on the command line.

The fix is a one-shot `seed` service in Compose (profile `seed`) built from the
server image: `npm run seed` is now `docker compose run --rm seed`. Three
things fall out of that:

* The command in the README is the command that runs.
* The seed container is the **only** thing that holds the migration
  credential. The server's environment sets `MONGODB_MIGRATION_URI` to an
  empty string on purpose, and §6.2 shows `printenv` in the running container
  returning nothing — so §3.2's separation is real rather than aspirational.
  The environment validator had to learn that an empty value means *absent*,
  or the server would refuse to boot over a variable it must not use.
* `npm run up` now ends with the seed, which is what makes the README's
  one-command promise true: 88 seconds from `down -v` to six healthy services
  and a database with 618 knowledge entries in it.

### 4.9 The seed overwrote decisions an admin had made

The sharpest finding of the review, because nothing failed — it just quietly
undid work.

Both importers wrote `status` inside `$set`, so every run re-asserted it. An
admin who archived a wrong TechQA entry would find it **back and approved**
after the next seed, and a rejected `seniordata` row would reappear in the
review queue. That defeats the approval gate the whole project rests on
(`THREAT_MODEL.md` §4.8, LLM04), silently and on a schedule.

Review state now lives in `$setOnInsert`. The source corpus stays authoritative
for the *text*; the admin stays authoritative for whether the assistant may use
it. Three tests hold the line: a status survives a re-import, the body is still
refreshed, and a rejected CSV row does not return to the queue.

### 4.10 A documented guarantee that nothing enforced

`PRIVACY.md` §1 said the published repository contains only synthetic and
licensed data, and step 05 said the `publishable: false` flag was "the
enforcement". It was not: the flag governs the *database*, and nothing at all
governed the repository.

`npm run scan:personal-data` closes that. It slices the local CSV's free-text
fields and looks for those passages in every tracked file — in `verify`, in the
pre-commit hook, and in CI. On a machine without the file it says so and exits
0, rather than pretending to have checked.

It found two leaks on its first run:

1. **This very README, and step 01's**, quoting a real interaction verbatim —
   first name included — to illustrate why the file must stay private.
2. **The test fixture in `seed.test.ts`**, copied from the real export with the
   name changed and the real resolution sentence left in place.

Both were written by me, in the act of explaining why real data must not be
published. That is the argument for the check: the rule was understood, stated
twice, and broken twice anyway.

## 5. Security controls added, and the test that proves each

| Control | Where | Test |
| :-- | :-- | :-- |
| Phone encrypted at rest; lookup by peppered hash; login never decrypts | `crypto/phone.ts` | 28 tests, incl. tamper detection and "differs under a different pepper" |
| One spelling of a number is one customer, so one rate-limit bucket | `packages/shared/src/phone.ts` | 8 spellings → one E.164 value |
| Destination allow-list (anti SMS-pumping) | same | "refuses another country" |
| Unknown fields rejected, not dropped | `db/models/shared.ts` | "are rejected rather than silently dropped" |
| Database-level validators that hold without the application | `db/validators.ts` | three inserts through the raw driver, all rejected |
| The application cannot alter schema or drop indexes | `infra/mongo/init-replica-set.js` | verified live (§6.2) |
| Credentials and the encrypted phone are not returned by default | `db/models/*` | three "sensitive fields" tests |
| Retention enforced by the database | `db/models/governance.ts` | TTL indexes asserted on three collections |
| An attachment cannot exist without an expiry | `db/validators.ts` | "reject an attachment with no deletion date" |
| A pickle model artefact cannot be registered | `db/models/governance.ts` | "refuse a pickle model artefact" |
| Unpublishable data can never be retrieved | `seed/seniordata.ts` | "never leaves an unpublishable row retrievable by the assistant" |
| The seed never deletes or re-applies a password | `seed/seed.ts` | "is idempotent and never re-applies the seed password" |
| A re-import cannot resurrect an entry an admin archived | `seed/techqa.ts`, `seed/seniordata.ts` | "never overwrites a decision an admin has made"; "does not return a rejected row to the review queue" |
| The running application holds no credential that can alter the schema | `docker-compose.yml` | verified live: `printenv MONGODB_MIGRATION_URI` in the server container is empty |
| Audit actions are a closed list | `db/validators.ts` | "reject an audit action that is not in the closed list" |
| Multi-collection writes commit atomically | `db/connection.ts` | "commit several collections together, or not at all" |

Checklist rows moved to **done**: 11.7 and the new section 12 (nine rows) plus
14.7 — `npm run audit:checklist` reports **29 done, 69 planned, 1 accepted**.

## 6. How to verify

### 6.1 Commands

```bash
npm run verify            # format, lint, clean build, secret scan, checklist, 262 tests
npm run test:coverage     # 94.63% statements, 84.05% branches
npm run seed              # validators → indexes → admin → demo data → knowledge base
npm run seed:fast         # the same, skipping the 292 MB technote metadata scan
npm run seed:native       # for a server run natively, with your own MONGODB_MIGRATION_URI
```

`npm run seed` runs in a **one-shot container**, not on the host and not inside
the server. Two reasons, both found by running it (§4.8):

* `mongo` is a hostname inside the Compose network, so the documented command
  simply did not work from a host shell;
* the seed is the only thing that holds the migration credential, and putting
  it in the server's environment would undo the separation §3.2 exists for.
  The server container sets `MONGODB_MIGRATION_URI` to an empty string, and
  that is asserted: `printenv` in the running container returns nothing.

### 6.2 What a run actually prints

From a database that already had everything (the idempotent case):

```
mongodb connected
validators applied                     collections: 13
indexes synchronised                   collections: 22
seed: an admin already exists, leaving it alone   emailMasked: a***n@csas.local
seed: demo customers and contracts ready          customers: 3  contracts: 3
techqa import complete                 inserted: 0  updated: 618  withMetadata: 496
seniordata: the file ends with an incomplete record; it was dropped   line: 54
seniordata import complete             rows: 52  inserted: 52  publishable: false
seed: complete
```

`withMetadata: 496` is **complete coverage**, not partial: there are exactly 496
distinct answer documents across the three labelled files, and all 496 were
found. The scan reads 292 MB in about 3 seconds, line by line, because
`JSON.parse` on that file costs more than a gigabyte of heap.

And the privilege separation, demonstrated rather than asserted — the same
command as the application user:

```
seed failed: not authorized on csas to execute command { collMod: "staff_users", … }
```

### 6.3 What to look at in MongoDB Compass

Connect to `mongodb://localhost:27018/?directConnection=true` (27017 for most
people — see step 02 §6.3.1) with the **root** credentials from `.env`.

| # | Look at | Expect |
| :-- | :-- | :-- |
| 1 | `kb_entries`, group by `provenance.source` | `techqa` 618 **approved / publishable: true**; `seniordata_csv` 52 **pending_review / publishable: false** |
| 2 | Any `customers` document | `phoneHash` and `phoneEncrypted` — **no readable phone number anywhere**, plus `phoneLast3` for support to confirm by voice |
| 3 | `contracts` | three demo contracts: active, expiring in 9 days, already expired — so every branch of the contract gate has data |
| 4 | `staff_users` | one admin; `passwordHash` begins `$argon2id$` and is hidden from ordinary queries |
| 5 | `audit_logs` | one `staff.created` entry, `actorType: system` |
| 6 | Indexes on `sessions` | `expiresAt_1` with `expireAfterSeconds: 0` |
| 7 | Validation rules on `customers` (Compass → Validation) | `$jsonSchema` requiring `phoneHash` **and** `phoneEncrypted` |
| 8 | `GET http://localhost:8080/api/ready` | `{"status":"ready","checks":{"mongodb":{"status":"pass",…},"ml":{…}}}` |

Checks 1–8 were run; the output above is what they produced.

## 7. What you must do

1. **Re-run `npm run setup -- --force`** if you want the migration credentials
   generated into a fresh `.env`. On an existing `.env` (this machine's case)
   the three `MONGODB_MIGRATION_*` values were appended and the Mongo init
   container re-run to create the user — nothing else is needed.
2. **The TechQA corpus is optional but recommended.** Without it the seed still
   runs and says so; with it the knowledge base has 618 real entries. It is
   12 GB, git-ignored, and configured by `TECHQA_PATH`.
3. Nothing else. No accounts, no keys.

## 8. Test results

After the review pass in §4.8–4.10:

```
Node:   290 tests, 19 files      Statements 95.48%  Branches 85.61%  Functions 91.37%
Python:  32 tests
Tooling: 81 tests
Lint, format, clean build (tsc -b --force): clean
secret-scan: clean (tracked files, and 249 blobs across full git history)
personal-data-scan: clean (101 protected passages, none in tracked files)
checklist-audit: 101 requirements — 31 done, 69 planned, 1 accepted
Stack:  6/6 healthy; /api/ready reports mongodb (critical) and ml (non-critical)
Seed:   618 knowledge entries + 52 unpublishable candidates + 3 customers + 1 admin
```

Coverage rose from 74.6% to 94.6% partly through new tests and partly through a
fix worth naming: tests imported the shared package's **built output**, so
`packages/shared` reported 0% while its own tests passed. A vitest alias now
resolves `@csas/shared` to source — the instrumented file and the imported file
are finally the same file.

## 9. Known limitations opened by this step

- **No repositories or services yet.** These are models and a seed. The
  repository layer where object-level authorization lives arrives in step 11,
  which is when checklist row 4.2 can move.
- **Embeddings are a declared field with nothing in it.** `kb_entries.embedding`
  exists with its model and dimension recorded; step 15 fills it.
- **The audit log is append-only by convention and database rules**, not WORM
  storage. Recorded in `THREAT_MODEL.md` §8.
- **The demo data is three customers.** Enough for every contract branch, not
  enough to make the dashboard look busy; step 29 decides whether that matters.
- **`mongodb-memory-server` downloads a binary on first run.** Documented as a
  cost, with the Docker-service alternative noted.

## 10. Checklist

- [x] 24 collections with timestamps, indexes, and Mongoose + MongoDB validation
- [x] EERD mapped name by name, with every rename and omission justified
- [x] Phone numbers encrypted at rest with a peppered, normalized lookup hash
- [x] Sensitive fields excluded from ordinary reads
- [x] TTL retention on sessions, OTP challenges and reset tokens
- [x] Separate migration identity; the application cannot change the schema
- [x] Idempotent seed that never deletes and never re-applies a password
- [x] First admin from the environment, audit-logged
- [x] Demo customers covering active, expiring and expired contracts
- [x] TechQA imported: 618 entries, approved, licensed, provenance recorded
- [x] `seniordata.csv` imported local-only: unpublishable, unapproved, untrainable
- [x] Tests against a real replica set, including transactions and validators
- [x] MongoDB registered as a **critical** readiness dependency
- [x] Seed run against the live stack and the result inspected in the database
- [x] Reviewed: every documented command run as written, four defects fixed
- [x] A re-import cannot undo an admin's decision
- [x] Local-only personal data cannot reach a tracked file, and the check that
      says so is itself tested
