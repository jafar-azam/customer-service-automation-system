# Privacy design

What personal data this system holds, why, for how long, and what a customer can
ask for. Written at step 04 because step 05 designs the data model, and a
retention rule retro-fitted to a schema is a rule nobody can enforce.

**Source.** [`docs/research/privacy-law.md`](../research/privacy-law.md) — Lebanese
**Law 81/2018** (Articles 86–109), where GDPR also applies, consent wording for
recording and AI training, and a proposed retention schedule. Evidence cutoff
22 October 2026.

**Two warnings that belong at the top.**

1. **This is a design document, not legal advice, and not a privacy policy.** The
   research is explicit that several Lebanese questions are unverified; they are
   reproduced in [§8](#8-questions-for-a-lawyer-before-any-real-use) as open
   questions rather than answered.
2. **"Educational" is not a legal basis.** The research says so directly: calling
   a project a portfolio does not bring it inside the law's personal/private
   activity exception. The protection here comes from the *boundary* — the
   published repository contains only synthetic and licensed data — not from the
   label.

---

## 1. The boundary this release relies on

| | Published repository | Local only (git-ignored) |
| :-- | :-- | :-- |
| Knowledge base | TechQA (CDLA-Permissive-1.0), downloaded by script | — |
| Demo customers | Synthetic, fabricated numbers and names | — |
| Conversations | Generated, native-speaker reviewed | — |
| `reference/data/seniordata.csv` | **never** | Real business data: first names in free text, churn detail, agent/customer ids |
| Attachments, voice | Fixtures only | Anything a local run produces |

Step 05's importer flags every row from the real CSV `Publishable: false`, and
step 37's pre-publication audit **fails the release** if a row carrying that flag
reached a committed file. The flag is the enforcement; the policy is just the
reason for it.

## 2. Data inventory

| Category | Fields | Why it is held | Sensitivity |
| :-- | :-- | :-- | :-- |
| Customer identity | Name, **phone number**, email, company, contract | Login and entitlement | **High** — the phone is both credential and identifier |
| Contracts | Dates, tier, status, details | Entitlement and SLA | Medium |
| Conversations | Customer messages, assistant answers, agent replies, internal notes | The support record | **High** — free-form, unpredictable content |
| Attachments | Images, PDFs, derived metadata | Diagnosis | **High** — screenshots expose internal systems; photos carry GPS |
| Voice | Recording, transcript, consent record | Spoken support | **High** — a voice is identifying |
| Tickets | Status, priority, timers, assignment | Operations | Low |
| Satisfaction | 1–5 rating, comment | Quality | Low–Medium |
| Staff | Account, password hash, TOTP secret, recovery codes, sessions | Staff access | **High** |
| Audit log | Actor, action, target reference, time | Accountability | Medium — references, never content |
| Operational logs | Request id, route, status, duration, IP | Debugging | Low by design (§5) |
| Training data | Approved, de-identified conversation derivatives | Model improvement | **High until de-identified**, and the research warns that removing names is not automatically anonymization |

## 3. Purposes, kept separate

The research is emphatic that support and AI development are **different
purposes**, and that ordinary product improvement does not automatically inherit
the research exception. So they are separated in the data model, not just in
prose:

| Purpose | Basis in this design | Separate permission? |
| :-- | :-- | :-- |
| Providing support | Necessary to the contract the customer holds | No — refusing means no service |
| Security and abuse prevention | Necessary, and narrow (audit log, rate-limit counters) | No |
| Voice recording | **Optional.** An equally available unrecorded path exists | **Yes**, per recording |
| Using a conversation for AI training | **Optional.** Refusing changes nothing about the support received | **Yes**, per conversation, unchecked by default |
| Analytics | Aggregated; no per-customer profiling | No |

Consent records are **versioned and timestamped**: which notice text, which
version, when, and what was chosen. A consent you cannot evidence is a consent
you do not have.

## 4. Retention schedule

Taken from the research, which labels these **proposed starting policies, not
legal safe harbours**. Implemented as scheduled sweeps in step 14, with the
period in configuration so it is a decision rather than a constant buried in
code.

| Record | Period | Note |
| :-- | :-- | :-- |
| Tickets and conversation text | **12 months** after closure, then delete or genuinely anonymize | Extended only for a documented dispute or legal hold |
| Voice recordings | **30 days** from recording | Up to 90 with a documented need |
| Transcripts | With the ticket (12 months) | The text is the useful part; the audio is not |
| Attachments | **90 days** after closure | Keep a minimal extract rather than a whole document where feasible |
| Security/audit logs | **6–12 months** | References and actions, never bodies or codes |
| Routine application logs | **14–30 days** | And they contain no personal data to begin with (§5) |
| OTP challenges | 5 minutes (expiry), record purged within 24 hours | Only ever a hash |
| Sessions and refresh tokens | Revoked at logout; expired records swept daily | |
| Pending AI-review copies | **30 days**, then approved, anonymized or deleted | "Awaiting approval" must not become indefinite storage |
| Backups | Rolling **30–90 days** | Deletions re-applied after any restore |
| Contracts and consent evidence | Separate schedule | Commercial and limitation periods — a lawyer question (§8) |

**Legal holds are narrow.** A dispute suspends deletion for the records in that
dispute, never across the whole database.

## 5. Personal data in logs — the rule, and why it is strict

The operational log is the easiest place to create a second, unmanaged copy of
everything, replicated across every archive and backup. So:

- **Free-form customer text is never logged.** Not messages, not transcripts, not
  ticket bodies. This is a rule about what is passed to the logger, not a filter
  applied afterwards.
- Field names that carry personal data are **redacted at every depth**
  (`phone`, `email`, `address`, `password`, `otp`, `totpSecret`, tokens, cookies).
  Implemented and tested in step 03.
- Query strings are never logged — a token or a number can sit in one.
- Where a partial value genuinely helps, `maskPhone` / `maskEmail` produce
  `+961***456` and `r***d@example.com`.
- Error-tracking events are scrubbed before leaving the process, including
  `message`, `transcript` and `body`. No collector is wired in this release; the
  scrubbing is written and tested anyway, so there is nothing to remember later.

## 6. Phone numbers: encrypted, but still searchable

The phone number is the login identifier, so it must be *findable*; it is also
the most sensitive single field, so it must not sit in plaintext in a dump.

```
phoneEncrypted : AES-256-GCM(number, PHONE_ENCRYPTION_KEY)   ← what gets displayed, after decryption
phoneHash      : HMAC-SHA-256(normalized number, PHONE_HASH_PEPPER)  ← what gets indexed and searched
```

Login hashes the submitted number and looks up `phoneHash`; nothing is decrypted
on the login path. The pepper lives in the environment, not the database, so a
database dump alone does not allow offline enumeration of a number list —
E.164 numbers are a small enough space to brute-force an unpeppered hash.

Numbers are normalized to E.164 **before** hashing, so `03 123 456`,
`+961 3 123 456` and `009613123456` are one customer and not three.

## 7. Rights, and how they are handled

Law 81/2018 Articles 99–102 give access, an intelligible copy, information about
processing, correction, and erasure of data that is inaccurate, incomplete,
obsolete, incompatible with its purpose or unlawfully processed. The research is
clear that this is **not an unrestricted right to delete anything on demand**,
and that there is no GDPR-equivalent general portability right in the reviewed
chapter.

| Right | Implementation | Step |
| :-- | :-- | :-- |
| Access / copy | Admin-triggered export: profile, contracts, tickets, messages, attachments, consent records — in a readable format | 29 |
| Correction | Admin edits with an audit entry | 29 |
| Erasure (qualified) | Delete or anonymize, **including removal from future training data** and from pending review queues | 29, 27 |
| Objection / withdrawal | Withdraw recording and AI-training permission at any time; future selection stops, pending identifiable examples are removed | 27, 28 |

**Deadline: 10 calendar days**, internally, for both access and correction.
Article 101 says 10 days and Article 107 penalizes failure within 10 *working*
days; the research recommends using the shorter reading rather than relying on
the difference. Identity is verified before anything is disclosed — an export
endpoint that answers anyone who asks is a data breach with good manners.

## 8. Questions for a lawyer before any real use

Reproduced from the research, unanswered on purpose. The honest position for a
defence is "these are the questions, and here is why I did not guess".

1. Has Law 81/2018, or its implementing practice, changed since the cited
   analyses? Post-2022 developments are unverified.
2. Does ordinary support processing fall under the Article 94 filing exemption,
   or does recording / AI preparation need a separate declaration under Articles
   95–96 or authorization under Article 97?
3. How do Articles 91, 94 and 97 interact when a customer *unsolicitedly* sends
   health or judicial information in a screenshot?
4. Does the voice workflow satisfy **Law 140/1999** on communications secrecy,
   including staff protections? No simple one-party/all-party rule was verified.
5. Is the basis for AI secondary use sufficient — selection, review,
   transcription, anonymization, training — and can the claimed anonymity
   withstand scrutiny?
6. Is the company a "technical service provider" under Article 72 (three-year
   traffic-data retention) or a host under Article 74 (ten years for publisher
   identification)? These are **not** blanket requirements to keep every ticket.
7. Which commercial, tax, warranty or limitation periods override the short
   operational retention periods above?
8. International transfers, if hosting ever leaves Lebanon.
9. Does GDPR Article 3 apply to any activity, and is an EU representative, DPIA
   or DPO required?
10. Do later laws adjust the Article 106–108 penalty figures?

## 9. The privacy page is a notice, not a policy

The public Privacy page (step 32) follows the research's **structure** —
controller, scope, data collected, purposes, optional features, voice, AI
training, recipients, retention, security, rights, changes — describes what this
system actually does, and carries a visible banner that it is an educational
artefact requiring legal review before real use.

It will not claim compliance, will not promise absolute security, and will not
import a retention period from a foreign regime to look thorough.

## 10. Where each control lives

| Control | Step | Checklist row |
| :-- | :-- | :-- |
| No personal data in logs | 03 ✔ | 11.1–11.4 |
| Encrypted phone + hashed index | 05 | 11.7 |
| Consent records, versioned | 27, 28 | 11.10 |
| Retention sweeps | 14 | 11.8 |
| Export and deletion | 29 | 11.9 |
| Training-export gate | 19, 27 | 9.1, 9.2 |
| Attachment metadata stripping | 12 | 7.3 |
| Publication gate on real data | 05, 37 | §1 above |
