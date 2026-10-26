# Security checklist

Every security requirement this project accepts, the control that satisfies it,
the code that implements it, and **the test that proves it**. One row per
requirement.

**How to read the status column**

| | Meaning |
| :-- | :-- |
| **done** | Implemented, with a test that fails if the control is removed |
| **step NN** | Planned, with the step that will implement it. Not a promise that it works today |
| **accepted** | Deliberately not done in this release; the reason is in [`THREAT_MODEL.md` §8](THREAT_MODEL.md#8-residual-risks-accepted-for-this-release) |

A row moves to **done** only when a test exists that would fail without the
control. "The code looks right" is not evidence; step 34 re-walks every row and
reports anything that does not hold.

**Standards referenced:** ASVS = OWASP Application Security Verification Standard
L2 · A0x = OWASP Top 10 2021 · API0x = OWASP API Security Top 10 2023 ·
LLM0x = OWASP Top 10 for LLM Applications 2025.

Counts as of step 17, re-derived from the table by `npm run audit:checklist`
rather than written by hand: **104 done, 31 planned, 1 accepted**. (The numbered
rows count one `accepted`; the five further acceptances have no requirement id
because they are infrastructure decisions, and are listed at the end.)

---

## 1. Authentication — staff

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1.1 | Passwords stored with a memory-hard hash | ASVS 2.4, A02 | Argon2id, 64 MiB, parameters inside the hash; rehash on login | `services/auth/password.ts` | "produces an Argon2id hash"; "reports the upgrade alongside a successful verification" | **done** |
| 1.2 | Password policy: length over composition | ASVS 2.1 | ≥12 chars, zxcvbn ≥3, context words refused, no composition rules | `services/auth/password.ts` | 11 policy tests incl. "rejects Password1!" | **done** |
| 1.3 | TOTP mandatory for admins, optional for agents | ASVS 2.8 | Required at login; secret encrypted at rest | `services/auth/totp.ts` | "is required for an admin who has enrolled"; "refuses an admin who has never enrolled" | **done** |
| 1.4 | Lockout with backoff after failed attempts | ASVS 2.2 | Exponential backoff per account, shared by both factors | `services/auth/login.ts` | "locks the account after five failures"; "counts a wrong code towards the lockout" | **done** |
| 1.5 | Login responses identical for unknown and known accounts | ASVS 2.2 | Same body and status; a dummy verification equalises the time | `services/auth/login.ts` | "answers identically for an unknown account and a wrong password" | **done** |
| 1.6 | `DEMO_MODE` cannot be enabled in production | — | Environment validation refuses the combination | `packages/shared/src/env.ts` | "is refused outright in production" | **done** |

## 2. Authentication — customer OTP

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 2.1 | Code stored only as a hash | ASVS 2.5 | Peppered SHA-256; plaintext never persisted | `services/auth/otp.ts` | "stores the code only as a hash" | **done** |
| 2.2 | 6 digits, 5-minute expiry, single use, max 5 attempts | ASVS 2.5 | `randomInt`; single use by update filter; attempt counted before comparison | `services/auth/otp.ts` | five tests incl. "counts the attempt before comparing" | **done** |
| 2.3 | Identical response whether or not the number is registered | ASVS 2.2 | One 202 for sent, unknown, disabled and suppressed | `services/auth/otp.ts` | "answers identically for a number that is not a customer" | **done** |
| 2.4 | Layered atomic rate limits (number, IP, prefix) | API04 | Redis `INCR`, most specific layer charged first | `services/rate-limit.ts` | "cannot be beaten by parallel requests"; 16 limiter tests | **done** |
| 2.5 | Destination allow-list and full-number validation | — | Parsing *is* the allow-list: a number that will not parse is never sent to | `packages/shared/src/phone.ts` | "refuses a number outside the allowed country" | **done** |
| 2.6 | Resend cooldown | — | 45 seconds, charged before every other layer | `services/rate-limit.ts` | "refuses a second code inside the resend cooldown"; verified live | **done** |
| 2.7 | Daily/hourly send caps with a kill switch | — | Counted only for real sends; the switch has no TTL | `services/rate-limit.ts` | "sends nothing at all while the kill switch is on"; "does not expire on a timer" | **done** |
| 2.8 | **The code never appears in a log, metric or error** | ASVS 7.1 | Never passed to the logger; the body is redacted outside DEMO_MODE | `services/providers/messaging.ts` | "never writes the code to the log" | **done** |
| 2.9 | Conversion monitoring (sends up, verifications down) | — | Metric + dashboard alert | `services/otp` | ratio metric emitted | step 30 |
| 2.10 | No unauthenticated "send to arbitrary number" endpoint | API05 | The only send path requires a registered, active customer | `services/auth/otp.ts` | "sends nothing for a customer who has been deactivated" | **done** |

## 3. Sessions

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 3.1 | Short-lived access token | ASVS 3.3 | 15-minute JWT, bearer header, never a cookie | `services/auth/tokens.ts` | "refuses an expired token" | **done** |
| 3.2 | Refresh token in `httpOnly`, `Secure`, `SameSite=Strict` cookie | ASVS 3.4 | Flags set centrally, path-scoped | `http/cookies.ts` | "marks the refresh cookie HttpOnly, Secure and SameSite=Strict" | **done** |
| 3.3 | Rotation on every use | ASVS 3.3 | New token each refresh, in a transaction | `services/auth/tokens.ts` | "rotates to a new token and retires the old one" | **done** |
| 3.4 | **Reuse detection revokes the whole family** | ASVS 3.3 | Family id; a replay revokes every live token in it | `services/auth/tokens.ts` | "revokes every live token in the family"; verified live | **done** |
| 3.5 | Server-side revocation on logout and deactivation | ASVS 3.3 | Session family checked on every authenticated request | `http/authenticate.ts` | "stops accepting the access token the moment the session is revoked" | **done** |
| 3.6 | CSRF protection on cookie-authenticated state changes | ASVS 4.2, A01 | Double-submit token compared in constant time | `http/cookies.ts` | "refuses a refresh with no CSRF header"; "refuses a header that does not match" | **done** |

## 4. Authorization

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 4.1 | Role-based access on every route | A01, API05 | `requireRole` after `requireStaff` | `http/authenticate.ts` | "refuses an agent on the same route"; 401 before 403 | **done** |
| 4.2 | **Object-level checks on every resource** | API01 | Ownership enforced in the repository layer | `repositories/*` | cross-customer ticket read → 404 | step 11 |
| 4.3 | Attachments and transcripts carry the same checks | API01 | Reached through `findTicket`, the same function the REST and socket paths use — one ownership rule, not a second one for files | `services/attachments` | upload to another's ticket → 404 and nothing decoded; download → refused | **done** |
| 4.4 | Socket rooms authorized at join | API01 | Handshake authenticated; room membership checked | `realtime/*` | joining another customer's room refused | step 11 |
| 4.5 | Function-level authorization on admin actions | API05 | Explicit allow-list per role | `http/authorize` | every admin route probed from an agent session | step 34 |

## 5. Input and output

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 5.1 | zod validation on body, query and params | ASVS 5.1, A03 | `z.strictObject`; the parsed value replaces the raw one | `http/validate.ts` | "refuses an unknown field" | **done** |
| 5.2 | NoSQL operator injection prevented | A03 | zod refuses an operator object before a query exists; `sanitizeFilter` per query on user-supplied filters | `http/validate.ts` | "refuses an operator object as a password" / "as an email" | **done** |
| 5.3 | Request size limits | ASVS 12.1 | 100 KB JSON at the app, 12 MB at the proxy | `app.ts`, `nginx.conf` | "answers 413, not 500" | **done** |
| 5.4 | Malformed JSON answered 400, not 500 | — | Body-parser errors translated | `http/errors.ts` | "answers 400 for malformed JSON" | **done** |
| 5.5 | No `dangerouslySetInnerHTML`; rich text sanitized | A03 | Lint rule plus sanitizer | client | lint rule + render test | step 10 |
| 5.6 | Output encoding on everything rendered | A03 | React escaping by default | client | component tests | step 10 |

## 6. Headers, transport and CORS

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 6.1 | helmet with a strict CSP (no `unsafe-inline`) | A05 | Nonce-based CSP | `app.ts` | CSP header asserted | step 10 |
| 6.2 | CORS allow-list from configuration; wildcard refused | A05 | Validated at startup | `packages/shared/src/env.ts` | "refuses a wildcard origin" | **done** |
| 6.3 | Framework version not advertised | A05 | `x-powered-by` disabled | `app.ts` | "does not advertise the framework" | **done** |
| 6.4 | `nosniff`, `X-Frame-Options`/frame-ancestors, Referrer-Policy | A05 | helmet defaults, reviewed | `app.ts` | header assertions | step 10 |
| 6.5 | HTTPS and HSTS | A02 | — | — | — | accepted (roadmap P5) |

## 7. Uploads

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 7.1 | Type decided by magic bytes, not filename or client header | A08 | `file-type` signature detection; the allowlist is applied to the **detected** type. Text is the one type decided by exclusion, and strictly. SVG and archives refused outright | `services/attachments/type-check.ts` | 19 tests: renamed ELF, SVG, zip, GIF, offset PDF polyglot, `.txt` containing `<script>` | **done** |
| 7.2 | Size and count limits | ASVS 12.1 | 10 MB per file enforced by multer while reading the stream, 20 per ticket, 30 uploads/hour per account. nginx allows 12m so the app returns a JSON error rather than nginx an opaque HTML 413 | `services/attachments`, `routes/attachments.ts` | over-limit and over-count rejected | **done** |
| 7.3 | Images re-encoded; **all metadata stripped, including GPS** | — | sharp re-encode to PNG. Destroys EXIF/GPS, discards anything appended past the image data, and remakes the file with a decoder we chose. Decompression bombs refused on the header | `services/attachments/sanitize.ts` | GPS fixture verified to carry GPS *before* the strip, then absent after; appended `<?php` gone; 144-megapixel bomb refused | **done** |
| 7.4 | Malware scanning | A08 | ClamAV over INSTREAM behind `--profile scan`; the default mock still detects EICAR by hash, so the infected branch is reachable and tested. `pending` and `error` are refused alongside `infected` — a scan that failed to run is not a scan that passed | `services/providers/virus-scan.ts` | infected file never stored, audited; scanner error → stored but undownloadable | **done** |
| 7.5 | Stored outside the web root with unguessable ids | A01 | A private volume no nginx rule maps to, 0700, owned by the unprivileged user. Server-generated 128-bit keys; the customer's filename is metadata and never a path. Traversal refused even though keys are generated | `services/providers/storage.ts` | `../../etc/passwd` reduced to a basename; key escaping the root throws | **done** |
| 7.6 | Served only through short-lived signed URLs after an access check | API01 | HMAC token bound to the attachment **and** the subject, 5 minutes. The signature is not the access control: the ownership check runs on every download anyway. `Content-Disposition: attachment`, `nosniff` and a sandbox CSP so nothing is ever rendered inline in this origin | `services/attachments/signed-url.ts` | expired, forged, extended, wrong-subject and wrong-attachment tokens all refused; a valid link with no session → 401 |  **done** |
| 7.7 | Retention-based deletion | — | `deleteAfter` written at upload; an hourly sweep deletes the bytes **first** and marks the record afterwards — the other order marks a file deleted that is still on disk and nothing comes back for it | `jobs/sla-sweep.ts` | bytes gone and record marked; safe to run twice; one storage failure does not stop the sweep | **done** |
| 7.8 | Audio: size, duration and type limits, consent recorded | — | Checked before transcription | `services/voice` | over-length audio rejected; no consent → no capture | step 28 |

## 8. LLM and AI

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 8.1 | User input and KB content kept out of the system prompt | LLM01 | Both are data in delimited blocks, and the delimiter is stripped from the data so a document cannot close its own block. Control and bidirectional characters removed — invisible in any review tool, so the natural place to hide an instruction | `services/rag/prompt.ts` | a poisoned KB entry and a poisoned question each fail to leak the prompt or change the answer | **done** |
| 8.2 | The model has no tools and no database access | LLM06 | `LlmProvider` takes a prompt and returns text. There is no tool surface to call and no connection to pass — a successful injection can make it say something wrong, never do anything | `services/providers/llm.ts` | the interface has one method returning a string | **done** |
| 8.3 | Answers cite knowledge-base entry ids that were actually retrieved | LLM05, LLM09 | Every citation is checked against the labels actually supplied; real database ids never enter the prompt, so an injected instruction cannot name a document it was not shown. An uncited answer escalates even if it reads well | `services/rag/answer.ts` | a fabricated `[KB-9]` escalates and the text is never shown to the customer | **done** |
| 8.4 | Below the confidence threshold, escalate | LLM09 | Two guards: an absolute floor, and a **margin** requiring the top document to beat the runner-up — because a flat ranking is noise whatever its absolute score. Both are uncalibrated; step 24 fits them against the labelled set | `services/rag/answer.ts` | a flat ranking escalates as `ambiguous` despite scoring above the floor | step 24 |
| 8.5 | Output length limits | LLM05 | The question is capped at 2,000 characters and generation at 512 tokens. Moderation of the output is not implemented — the answer is constrained to quoting approved content, which is a stronger control than filtering free generation | `routes/assistant.ts`, `providers/llm.ts` | an over-long question is refused with 400 | step 18 |
| 8.6 | Retrieval restricted to approved entries | LLM08 | `status: 'approved'` is in the index query itself, so no caller can forget it — a draft is someone's unfinished thought and an archived entry was withdrawn for a reason | `services/rag/retrieve.ts` | a draft entry matching the question exactly still escalates | **done** |
| 8.7 | Per-customer AI usage quotas | LLM10 | Counters with a refusal path | `services/assistant` | quota exceeded → refused, not degraded silently | step 18 |
| 8.8 | Timeouts, retries with jitter, circuit breaker, degraded mode | LLM10 | Resilience layer | `providers/llm` | provider down → keyword fallback, message never lost | step 18 |
| 8.9 | Prompt-injection corpus kept and run in CI | LLM01 | Fixture corpus, both languages | `tests/security` | corpus asserted clean | step 34 |

## 9. ML pipeline

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 9.1 | Only human-approved data enters training | LLM04 | Export filters on approval state | `tools/data-pipeline` | unapproved record never exported | step 19, 20 |
| 9.2 | Consent and opt-out respected at export | — | Consent checked at selection time | `tools/data-pipeline` | opted-out record excluded | step 27 |
| 9.3 | Artefacts are safetensors/ONNX with verified hashes | LLM03 | Hash recorded at registration, checked at load | `apps/ml` | tampered artefact refuses to load | step 22, 27 |
| 9.4 | **No pickle is ever loaded** | LLM03 | Loader refuses the format | `apps/ml` | pickle path raises | step 22 |
| 9.5 | Splits are lineage-aware with leakage audits | — | Group by incident family; MinHash + embedding audit | `tools/data-pipeline` | duplicate across splits fails the build | step 22 |
| 9.6 | Human test set never used for training or tuning | — | Separate store, read-only in evaluation | `data/eval` | training input asserted disjoint | step 21 |
| 9.7 | Promotion gated on no per-input-form regression, admin approval | — | Gate + shadow evaluation + rollback | `services/models` | regression blocks promotion | step 27 |
| 9.8 | Retraining never deploys automatically | — | Admin-triggered only | `services/models` | job cannot promote | step 27 |

## 10. Secrets and configuration

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 10.1 | Environment validated at startup, fail fast | ASVS 14.1 | zod schema, every problem reported at once | `packages/shared/src/env.ts` | 11 named problems, exit 1 | **done** |
| 10.2 | **No secret value in an error message** | ASVS 7.1 | Messages name the variable only | `packages/shared/src/env.ts` | "never includes the offending value" | **done** |
| 10.3 | `.env.example` carries placeholders only; placeholders refused in production | — | Placeholder detection | `packages/shared/src/env.ts` | "refuses placeholder secrets" | **done** |
| 10.4 | Nothing secret in the client bundle | ASVS 14.2 | Only `VITE_`-prefixed public values | client | bundle scanned for secret names | step 32 |
| 10.5 | Secret scanning in CI and pre-commit, over full history | — | Custom scanner, 10 rules | `scripts/secret-scan.mjs` | 57 tooling tests; history clean (188 blobs) | **done** |

## 11. Logging, auditing and privacy

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 11.1 | Personal data masked in logs | ASVS 7.1 | Field-name redaction at every depth | `observability/logger.ts` | 9 redaction cases | **done** |
| 11.2 | Free-form customer text never logged | — | Convention + scrubbing in error events | `observability/*` | scrub test includes an Arabic message | **done** |
| 11.3 | Log injection through headers refused | ASVS 7.1 | `x-request-id` character and length rules | `http/observability-middleware.ts` | newline/length/punctuation cases, both services | **done** |
| 11.4 | Internal errors leak nothing but a request id | ASVS 7.4, A09 | Bare 500 plus id | `http/errors.ts` | "leaking nothing" | **done** |
| 11.5 | Append-only audit log for security-relevant events | ASVS 7.2 | One verb, `record`; no update or delete path exists | `services/audit.ts` | four audit tests; a write failure never fails the request | **done** |
| 11.6 | Audit covers logins, recovery, roles, KB, models, exports, deletions, contracts | ASVS 7.2 | Closed action list | `services/audit.ts` | logins, lockouts, reuse, reset, enrolment, admin reset and break-glass covered; KB/model/export events follow their steps | step 17–31 |
| 11.7 | Phone numbers encrypted at rest with a hashed lookup index | — | AES-256-GCM + peppered HMAC; login never decrypts | `crypto/phone.ts` | 28 tests incl. "stores demo phone numbers encrypted and hashed, never in the clear" | **done** |
| 11.8 | Retention periods enforced per category | — | Attachments swept hourly against their own `deleteAfter`. Conversations and audit entries have their own periods and are swept in step 27's data-lifecycle work | `jobs/sla-sweep.ts` | attachment deleted after its window, not before | step 27 |
| 11.9 | Admin-triggered export and deletion of a customer's data | — | Including removal from future training data | `services/privacy` | exported bundle complete; deleted record not exportable | step 29 |
| 11.10 | Consent for recording and for AI training, with opt-out | — | Separate, unchecked by default, versioned | `services/consent` | no consent → no capture, no export | step 28, 27 |

## 12. The data layer

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 12.1 | Database-level schema validation, not only ORM validation | ASVS 5.1 | `$jsonSchema` validators applied by the seed | `db/validators.ts` | three validator tests that bypass Mongoose entirely | **done** |
| 12.2 | Unknown fields rejected, never silently dropped | API06 | `strict: 'throw'` on every schema | `db/models/shared.ts` | "are rejected rather than silently dropped" | **done** |
| 12.3 | **The application cannot alter the schema or drop an index** | A01 | Separate migration identity with `dbAdmin`; the server holds `readWrite` only | `infra/mongo/init-replica-set.js` | verified live: the app user is refused `collMod` | **done** |
| 12.4 | Credentials and personal data not returned by default | ASVS 8.1 | `select: false` on hashes, secrets and the encrypted phone | `db/models/*` | three "sensitive fields" tests | **done** |
| 12.5 | Retention enforced by the database, not only by a job | — | TTL indexes on sessions, OTP challenges, reset tokens | `db/models/governance.ts` | "are declared on sessions, OTP challenges and reset tokens" | **done** |
| 12.6 | Unpublishable data can never be retrieved by the assistant | — | Imported as `pending_review`; retrieval reads approved only | `seed/seniordata.ts` | "never leaves an unpublishable row retrievable by the assistant" | **done** |
| 12.10 | **Local-only real data cannot reach a tracked file** | — | Slices of the real export compared against every tracked file, in `verify` and pre-commit | `scripts/personal-data-scan.mjs` | 10 tests; found two real leaks on its first run | **done** |
| 12.11 | A re-import cannot resurrect an entry an admin archived | LLM04 | Review state written only on insert | `seed/techqa.ts`, `seed/seniordata.ts` | "never overwrites a decision an admin has made" | **done** |
| 12.7 | The seed never deletes, and never re-applies a changed password | — | Upserts and create-if-absent only | `seed/seed.ts` | "is idempotent and never re-applies the seed password" | **done** |
| 12.8 | A model artefact format that executes code on load cannot be recorded | LLM03 | Enumeration limited to safetensors and ONNX | `db/models/governance.ts` | "refuse a pickle model artefact" | **done** |
| 12.9 | Multi-collection invariants commit atomically | — | Single-node replica set; transactions available | `db/connection.ts` | "commit several collections together, or not at all" | **done** |

## 13. Availability and abuse

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 13.1 | Rate limits on all routes, strict on sensitive ones | API04 | Redis limiter: strict per-number/IP/prefix layers on OTP, an ordinary per-account layer on the ticket routes. Keyed on the authenticated actor, so one office NAT is not one budget and a changed address does not buy a fresh quota | `services/rate-limit.ts`, `http/rate-limit-middleware.ts` | 17 limiter tests; flood refused with `Retry-After`; limit charged per account not per address; verified live (every `rl:` key carries a TTL) | **done** |
| 13.6 | A counter cannot strand a subject permanently | API04 | Counting and setting the window are one Lua script, so no interruption can leave a counter without a TTL — and a key that has somehow lost one is repaired on the next hit. A malformed reply throws rather than comparing `NaN`, so the limiter fails closed | `services/rate-limit.ts` | "repairs a counter that has lost its expiry"; "does not extend the window on later hits" | **done** |
| 13.2 | Bot protection on the contact form | — | Challenge plus honeypot | `routes/contact` | automated submission refused | step 32 |
| 13.3 | Metric labels bounded | — | Route pattern or `unmatched` | `observability/metrics.ts` | "collapses unmatched paths" | **done** |
| 13.4 | Jobs idempotent and bounded | — | Every write is guarded by the absence of the mark it sets — `breachedAt`, `warningSentAt`, `deletedAt` — **in the query**, not in a prior read. Repeatable jobs use a fixed scheduler id so a restart replaces the entry instead of doubling the frequency. Retries are bounded with exponential backoff and completed/failed lists are capped | `jobs/queues.ts`, `jobs/sla-sweep.ts` | second sweep escalates 0 and audits once; three schedule calls leave one scheduler | **done** |
| 13.5 | Notifications are idempotent | — | Unique `idempotencyKey` per message | `db/models/governance.ts` | unique index enforced | step 31 |

## 14. Supply chain

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 14.1 | Lockfiles committed | A06 | `package-lock.json`, `uv.lock` | repo | `npm ci` in CI | **done** |
| 14.2 | `npm audit` and `pip-audit` fail on high/critical | A06 | CI job | `.github/workflows/ci.yml` | audit job; 0 vulnerabilities today | **done** |
| 14.3 | Dependabot and CodeQL enabled | A06 | Config committed | `.github/` | runs on GitHub — **unproven until the repository is pushed** | step 37 |
| 14.4 | Docker base images pinned by digest | A08 | `npm run pin:images` | Dockerfiles, compose | 9 pin-images tests; all 8 references pinned | **done** |
| 14.5 | Containers run as non-root | A05 | `node`, `mlsvc` | Dockerfiles | verified live: `whoami` per container | **done** |
| 14.6 | Third-party licence report | — | Generated at release | `docs/` | report produced and reviewed | step 37 |
| 14.7 | Every dataset record carries its licence and publishability | — | `provenance` required on knowledge and dataset records | `db/models/knowledge.ts` | import tests assert licence, publishability and lineage | **done** |

## 16. The contract gate

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 16.1 | Entitlement decided from the contract dates, not a cached status | — | `status` is a nightly cache; dates are the truth | `services/contracts.ts` | "reads the dates rather than the stored status" | **done** |
| 16.2 | A cancelled contract is never honoured | — | Excluded by status, since cancellation is a decision | `services/contracts.ts` | "ignores a cancelled contract even if its dates still cover today" | **done** |
| 16.3 | An expired contract is reported, not an authentication failure | — | The session opens; the client decides | `routes/customer-auth.ts` | "lets an expired customer sign in, and says the contract expired" | **done** |
| 16.4 | A customer cannot see another customer entitlement | API01 | Scoped by the authenticated subject | `services/contracts.ts` | "does not see another customer contract" | **done** |

## 17. Customer sessions

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 17.1 | Customer and staff tokens are mutually unusable | API05 | `kind` required on one, `role` on the other; each verifier refuses the other | `services/auth/tokens.ts` | "refuses a customer token on a staff route" | **done** |
| 17.2 | The phone number is never returned to the client | — | Only `phoneLast3` leaves the server | `routes/customer-auth.ts` | "never returns the phone number" | **done** |
| 17.3 | Customer logout is immediate | ASVS 3.3 | Same family check as staff | `http/authenticate.ts` | "logs out, and the access token stops working immediately" | **done** |
| 17.4 | Rotation and reuse detection apply to customers | ASVS 3.3 | One rotation path, both subjects | `services/auth/tokens.ts` | "rotates the refresh token, and detects a replay" | **done** |

## 15. Staff recovery

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 15.1 | Reset token single-use, hashed, 30-minute expiry | ASVS 2.5 | SHA-256 of a 256-bit token; one live token per account | `services/auth/recovery.ts` | "refuses a token that has already been used"; "refuses an expired token" | **done** |
| 15.2 | Identical response whether or not the account exists | ASVS 2.2 | One 202 for every outcome | `services/auth/recovery.ts` | "answers identically for an address that does not exist" | **done** |
| 15.3 | All sessions revoked after a reset | ASVS 3.3 | `revokeAllForStaff` in the same operation | `services/auth/recovery.ts` | "revokes every session the account had" | **done** |
| 15.4 | A reset does not bypass the second factor | ASVS 2.8 | 2FA is checked independently of the password | `services/auth/login.ts` | verified live (step 07 §5, check E) | **done** |
| 15.5 | Ten single-use recovery codes, hashed, shown once | ASVS 2.8 | Conditional update enforces single use | `services/auth/recovery.ts` | "spends the code, so it cannot be used twice" | **done** |
| 15.6 | A wrong recovery code costs a lockout attempt | ASVS 2.2 | Shared failure counter | `services/auth/login.ts` | "counts a wrong code towards the lockout" | **done** |
| 15.7 | Enrolment reachable only with a narrow, short-lived ticket | ASVS 2.8 | Separate JWT audience, five minutes | `services/auth/enrolment.ts` | "refuses an enrolment ticket as an access token" and the reverse | **done** |
| 15.8 | The TOTP secret is stored only after a code proves it | — | Written at confirm, not at start | `services/auth/enrolment.ts` | "does not store the secret until a code proves it was scanned" | **done** |
| 15.9 | Admin-assisted 2FA reset needs typed confirmation and is audited | ASVS 7.2 | Target email typed; both identities recorded | `services/auth/enrolment.ts` | four tests incl. "refuses an admin resetting their own second factor" | **done** |
| 15.10 | Break-glass requires server access and is audited | ASVS 7.2 | CLI only; `staff.break_glass_used` | `cli/break-glass.ts` | 5 argument tests; exercised live in step 07 §5 | **done** |

---

## 18. Inbound webhooks

The only route in the system reachable without an account, so the three rows
below are its whole design.

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 18.1 | Callbacks authenticated by signature over the raw body | ASVS 13.1, API02 | HMAC-SHA256 compared in constant time, length-checked first so a wrong-length forgery is a 401 rather than a 500. The route is mounted **before** `express.json`, because a raw parser behind the JSON parser receives an already-consumed stream — which fails every honest call and invites "fixing" the check against a re-serialised body the sender never signed | `routes/webhooks.ts`, `app.ts` | "verifies the signature against the bytes that were sent"; "rejects a forged signature"; "rejects an unsigned call"; "answers 401, not 500, for a signature of the wrong length"; exercised live through nginx | **done** |
| 18.2 | Redelivered and out-of-order callbacks change nothing twice | — | The ordering guard is part of the update filter, so a stale or repeated report matches no document. One atomic conditional update, never read-then-write — the first version restored the old value afterwards, which loses a concurrent report | `routes/webhooks.ts` | "applies the same report twice without moving the record twice"; "ignores a report that would move the record backwards"; 4 ordering-table tests; the full lifecycle driven live | **done** |
| 18.3 | The callback is not an oracle or an amplifier | API01, API04 | 202 for everything accepted, including an id that does not exist — a 404 there confirms which ids are real. Body capped at 64 KB, rate-limited per address, and no status only the system may set (`queued`, `suppressed`) is accepted from a caller | `routes/webhooks.ts` | "answers 202 for an id it has never seen"; "rejects an unrecognised payload"; "never overwrites suppressed" | **done** |

---

## 19. Closing the loop

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 19.1 | Only the customer may confirm a resolution | API01, API05 | Checked in the service, not only at the route, so a later internal caller meets it too. The staff router has no such route at all, so an agent gets a 404 rather than a 403 | `services/resolution.ts`, `routes/tickets.ts` | "refuses an agent confirming their own work"; "cannot confirm another customer's ticket" | **done** |
| 19.2 | Satisfaction cannot be recorded without being expressed | — | `solved` is required with no default; one rating per ticket, a second submission replaces the first | `routes/tickets.ts`, `services/resolution.ts` | "rejects a body with no answer in it"; "rejects a score outside one to five"; "replaces an earlier rating rather than adding one" | **done** |
| 19.3 | An escalation notification carries no customer content | — | Reference and link only — it lands on a lock screen (`PRIVACY.md` §5). Assignment and notification happen together: either alone produces a queue nobody watches or a message everybody assumes someone else took | `services/resolution.ts` | "escalates to the on-duty agent…" asserts the reference is present and the subject is not; verified live in MongoDB | **done** |

---

## 20. The knowledge gate

The control that makes the assistant defensible. Retrieval reads only
`approved` entries, so everything about whether the assistant can be trusted
reduces to who put an entry into that state and what they looked at first.

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 20.1 | Nothing reaches retrieval without a named human approving it | LLM04, LLM05 | Entries are created `draft` whoever is asking — there is no create-and-approve call. Only an admin may approve; an agent gets a 403. The approving and authoring ids are both recorded | `services/knowledge.ts`, `routes/knowledge.ts` | "creates everything as a draft, never approved"; "refuses to let an agent approve"; smoke walk approves through nginx | **done** |
| 20.2 | Machine output cannot be rubber-stamped | LLM04 | An entry whose provenance is `generated` is refused at approval while `version === 1` — a person must have edited it | `services/knowledge.ts` | "refuses to approve generated content nobody has edited"; "approves generated content once a person has edited it" | **done** |
| 20.3 | An approved entry cannot be silently rewritten | LLM05, A01 | A text edit demotes it to `pending_review` and clears the stale approval. Metadata-only edits do not demote, so nobody is trained to click through the queue | `services/knowledge.ts` | "sends an approved entry back for review when its text changes"; "does not demote for a metadata-only edit" | **done** |
| 20.4 | A concurrent approval approves once | — | The permitted prior statuses are part of the update filter, so the second writer matches nothing | `repositories/knowledge.ts` | "approves once under a double click" | **done** |
| 20.5 | Knowledge is not browsable by customers, and drafts are not browsable by other agents | API01 | No customer route exists at all. The visibility filter is part of the query, not a check on the result, so another agent's draft 404s rather than 403s | `repositories/knowledge.ts` | "hides another agent's unsubmitted draft"; "is not reachable with a customer session"; "never returns the embedding vector" | **done** |
| 20.6 | Bulk import cannot bypass the gate | LLM05 | The `status` column is read from the file and discarded; every imported row lands `pending_review`. Rows are capped at 1000 and the body at 2 MB | `services/knowledge-csv.ts` | "ignores the status column"; "rejects a row that still holds the placeholder, naming the line"; smoke walk round-trips 200 rows through nginx | **done** |
| 20.7 | An export cannot attack the person who opens it | A03 | Cells beginning `=`, `+`, `-`, `@` are prefixed with a quote, so a body reading `=HYPERLINK(…)` does not execute in Excel, Sheets or LibreOffice. The guard is stripped on import, so the round trip is lossless | `services/knowledge-csv.ts` | "neutralises every formula prefix"; "leaves ordinary text alone, including Arabic"; "survives the round trip without the quote sticking" | **done** |
| 20.8 | Every transition is attributable afterwards | ASVS 7.2 | `kb.created`, `kb.submitted_for_review`, `kb.approved`, `kb.rejected`, `kb.archived`, `kb.imported`, with the author and approver ids in the metadata | `services/knowledge.ts`, `services/knowledge-csv.ts` | audit rows asserted across the workflow tests | **done** |
| 20.9 | A citation stays explicable after the entry changes | — | Old versions are frozen, capped at 50 per entry; a citation records the version **and the title as it read**. Archiving removes an entry from retrieval without deleting it, so a transcript a customer holds keeps resolving | `services/knowledge.ts`, `db/models/support.ts` | "freezes what the entry said before an edit"; "shows what an assistant answer was grounded in, with the version" | **done** |
| 20.10 | A customer is shown the grounding, not the internals | API01 | The message presenter takes an audience and defaults to the narrower one; customers get the title and version, staff additionally get the entry id | `routes/tickets.ts` | "gives staff the entry id"; "gives a customer the title and version, never the id"; "defaults to the narrower audience" | **done** |

---

## Accepted, not done

| Requirement | Why | Revisit |
| :-- | :-- | :-- |
| HTTPS/HSTS (6.5) | Nothing leaves the machine; same-origin through the local proxy | Roadmap P5 |
| Secret manager | A git-ignored `.env` generated per machine | Roadmap P6 |
| WORM audit storage | Append-only by database rules and code; immutable storage is infrastructure | Roadmap P7 |
| External alerting | Alerts surface in the dashboard and dev inbox | Roadmap P7 |
| ClamAV always on | ~2 GB RAM; the mock exercises the interface | `--profile scan` |
| Distributed rate limits | One instance; counters already live in Redis | Roadmap P5 |
