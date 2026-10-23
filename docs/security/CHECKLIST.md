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

Counts as of step 07, re-derived from the table by `npm run audit:checklist`
rather than written by hand: **56 done, 54 planned, 1 accepted**. (The numbered
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
| 2.1 | Code stored only as a hash | ASVS 2.5 | Hashed at creation; plaintext never persisted | `services/otp` | database document contains no code | step 08 |
| 2.2 | 6 digits, 5-minute expiry, single use, max 5 attempts | ASVS 2.5 | Enforced server-side, atomically | `services/otp` | expiry, reuse and attempt-cap tests | step 08 |
| 2.3 | Identical response whether or not the number is registered | ASVS 2.2 | One response shape for start | `services/otp` | response equality test | step 08 |
| 2.4 | Layered atomic rate limits (number, IP, prefix) | API04 | Redis counters, never read-modify-write | `services/otp` | concurrent requests cannot exceed the limit | step 08 |
| 2.5 | Destination allow-list and full-number validation | — | Lebanon only by default; full mobile validated, not a `+961` prefix | `services/messaging` | malformed and out-of-country numbers refused | step 08 |
| 2.6 | Resend cooldown | — | 30–60 s, plus a rolling allowance | `services/otp` | second send inside the window refused | step 08 |
| 2.7 | Daily/hourly send caps with a kill switch | — | Application-level budget, hard stop not an alert | `services/messaging` | cap reached → sends refused | step 08 |
| 2.8 | **The code never appears in a log, metric or error** | ASVS 7.1 | Never passed to the logger; redaction as a second line | `services/otp` | captured logs asserted to not contain the code | step 08 |
| 2.9 | Conversion monitoring (sends up, verifications down) | — | Metric + dashboard alert | `services/otp` | ratio metric emitted | step 30 |
| 2.10 | No unauthenticated "send to arbitrary number" endpoint | API05 | No such route exists | routes | route inventory test | step 08 |

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
| 4.3 | Attachments and transcripts carry the same checks | API01 | Access check before any signed URL is issued | `services/attachments` | cross-customer attachment → denied | step 12 |
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
| 7.1 | Type decided by magic bytes, not filename or client header | A08 | Sniffed and matched against an allow-list | `services/attachments` | renamed `.png` executable rejected | step 12 |
| 7.2 | Size and count limits | ASVS 12.1 | Per file and per ticket | `services/attachments` | over-limit rejected | step 12 |
| 7.3 | Images re-encoded; **all metadata stripped, including GPS** | — | Re-encode destroys payloads and EXIF | `services/attachments` | output has no EXIF; GPS absent | step 12 |
| 7.4 | Malware scanning | A08 | ClamAV, or mock detecting EICAR | `services/file-scan` | EICAR string rejected | step 12 |
| 7.5 | Stored outside the web root with unguessable ids | A01 | Private volume, random ids | `services/storage` | direct path fetch impossible | step 12 |
| 7.6 | Served only through short-lived signed URLs after an access check | API01 | Signed, expiring, owner-checked | `services/attachments` | expired URL → 403; other customer → 403 | step 12 |
| 7.7 | Retention-based deletion | — | Scheduled sweep | `jobs/retention` | file gone after the period | step 14 |
| 7.8 | Audio: size, duration and type limits, consent recorded | — | Checked before transcription | `services/voice` | over-length audio rejected; no consent → no capture | step 28 |

## 8. LLM and AI

| # | Requirement | Std | Control | Code | Test | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 8.1 | User input and KB content kept out of the system prompt | LLM01 | Structured messages; untrusted content delimited | `services/assistant` | injection corpus produces no instruction-following | step 15 |
| 8.2 | The model has no tools and no database access | LLM06 | Provider interface returns text only | `providers/llm` | interface has no tool surface | step 15 |
| 8.3 | Answers cite knowledge-base entry ids that were actually retrieved | LLM05, LLM09 | Citations validated against the retrieval set | `services/assistant` | fabricated citation rejected | step 15 |
| 8.4 | Below the confidence threshold, escalate | LLM09 | Calibrated score, risk–coverage threshold | `services/assistant` | low-confidence case escalates | step 15, 24 |
| 8.5 | Output length limits and moderation | LLM05 | Bounded generation | `services/assistant` | over-long output truncated | step 15 |
| 8.6 | Retrieval restricted to approved entries | LLM08 | Filter applied before similarity | `repositories/kb` | draft entry never retrieved | step 17 |
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
| 11.8 | Retention periods enforced per category | — | Scheduled sweeps | `jobs/retention` | record deleted after its period | step 14 |
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
| 13.1 | Rate limits on all routes, strict on sensitive ones | API04 | Redis-backed limiter | `http/rate-limit` | limit enforced; headers correct | step 08 |
| 13.2 | Bot protection on the contact form | — | Challenge plus honeypot | `routes/contact` | automated submission refused | step 32 |
| 13.3 | Metric labels bounded | — | Route pattern or `unmatched` | `observability/metrics.ts` | "collapses unmatched paths" | **done** |
| 13.4 | Jobs idempotent and bounded | — | Idempotency keys, dead-letter queue | `jobs/*` | duplicate job runs once | step 14 |
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

## Accepted, not done

| Requirement | Why | Revisit |
| :-- | :-- | :-- |
| HTTPS/HSTS (6.5) | Nothing leaves the machine; same-origin through the local proxy | Roadmap P5 |
| Secret manager | A git-ignored `.env` generated per machine | Roadmap P6 |
| WORM audit storage | Append-only by database rules and code; immutable storage is infrastructure | Roadmap P7 |
| External alerting | Alerts surface in the dashboard and dev inbox | Roadmap P7 |
| ClamAV always on | ~2 GB RAM; the mock exercises the interface | `--profile scan` |
| Distributed rate limits | One instance; counters already live in Redis | Roadmap P5 |
