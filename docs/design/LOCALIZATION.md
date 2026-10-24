# Localization contract

Derived from [`docs/research/localization-lebanon.md`](../research/localization-lebanon.md),
which is an evidence-qualified report rather than a completed Lebanese usability
study. It separates **verified** (a primary source was inspected), **recommended**
(a proposed product decision) and **unverified** (the check was not done), and
several of its most useful conclusions are of the third kind. This document keeps
that distinction instead of flattening it into false confidence.

**This file is the contract. The research is the evidence.** Where a rule below
has no supporting evidence, it says so, and says what would settle it.

---

## 1. The decisions

| Topic | Decision | Basis |
| :-- | :-- | :-- |
| Interface register | Contemporary MSA, not dialect | Moderate — Lebanese government and commercial Arabic differ, MSA is the common floor |
| Default digits | **Western `0–9` in both languages** | Moderate — observed in Lebanese Ministry of Finance, the Banking Control Commission and the 2026 citizen budget |
| Arabic-Indic digits | An optional *display* preference, step 10 at the earliest; never touches identifiers, stored data, or user text | Recommendation |
| A national numeral preference | **Not claimed.** No representative Lebanese experiment comparing `123` with `١٢٣` exists in the evidence | Unverified, and recorded as unverified |
| Month names | Levantine: كانون الثاني, شباط, آذار, نيسان, أيار, حزيران, تموز, آب, أيلول, تشرين الأول, تشرين الثاني, كانون الأول — **not** يناير | Moderate — January directly observed; the other eleven are the conventional set and are not independently verified against `ar-LB` CLDR |
| Calendar | Explicitly Gregorian, never left to a runtime default | Product policy |
| Time zone | `Asia/Beirut`, explicitly configured; never a hard-coded offset | Product policy |
| Numeric date order | Day/month/year in Arabic display | Moderate — Lebanese official sources use both d/m/y and y/m/d |
| Clock | 24-hour in the staff dashboard; a saved preference for customers | Weak as a national claim; an operational decision |
| Currency | Always labelled `LBP`/`USD` (or `ل.ل.` in consumer contexts). Never a bare `$` | Moderate |
| Ticket identifiers | Preserved exactly, isolated LTR, copied canonically | Strong — W3C bidi guidance |
| Charts | Direction stated explicitly per chart; chronological axes fixed LTR in the dashboard | Weak for Lebanese preference — a product choice made for cross-language comparison, not a claimed standard |
| Accessibility target | WCAG 2.1 AA (the specification's bar). The research recommends 2.2 AA — see §5 | Open |

### 1.1 The reversal

Step 09 originally shipped Arabic-Indic numerals (`٦٢٪`, `٤ دقائق`, `٠٠:١٢`) on
the reasoning that an Arabic interface should use Arabic digits. The research
contradicts that: Lebanese institutional Arabic — the finance ministry's service,
the Banking Control Commission's tables, the 2026 citizen budget — uses Western
digits alongside Arabic text. The interface copy was changed.

It is worth being precise about what this does and does not settle. The evidence
is **moderate**: it establishes what those publishers do, not what Lebanese users
prefer. The research says so explicitly, and declines to claim a national
preference. So this is a defensible default that the native reviewers can
overturn — not a finding.

### 1.2 Why digits are not a cosmetic question here

> `3` in an Arabizi word is not necessarily a quantity.

Arabizi uses digits as letters: `3` for ع, `7` for ح, `2` for ء. `ma 3am
ye2bal el password` contains two digits and no numbers. Any global digit
normalisation — the obvious implementation of a numeral preference — silently
corrupts the main input the assistant is built to understand. Hence LOC-06 and
LOC-07 below, and hence the normalisation boundary is the **field**, not the
application.

---

## 2. Enforceable rules

The research proposes 35 acceptance rules. This table keeps all of them, adds
the step that owns each, and marks the ones already enforced.

| ID | Rule | Enforced by | Status |
| :-- | :-- | :-- | :-- |
| LOC-01 | Root `lang` and `dir` set from the interface language | preview test; step 10 DOM assertion per route | **done (previews)** |
| LOC-02 | Interface language is separate from conversation language | step 10 state model, step 17 chat | open |
| LOC-03 | Dates, numbers and money go through shared formatters | step 10 `@csas/shared` formatters | open |
| LOC-04 | Calendar, numbering system and time zone configured explicitly | step 10 formatter unit tests | open |
| LOC-05 | Ticket identifiers preserved exactly | step 14 round-trip + clipboard tests | open |
| LOC-06 | Digits never globally converted in chat | preview test; step 17 Arabizi fixtures | **done (previews)** |
| LOC-07 | Digit normalisation only in fields declared numeric | step 11 field parsers | open |
| LOC-08 | Formatted currency never parsed as the source of truth | step 12 money type | open |
| LOC-09 | No hard-coded Beirut UTC offset | lint check, step 10 | open |
| LOC-10 | Date-only values kept distinct from instants | step 05 schema (already date-typed), step 14 boundary tests | partial |
| BIDI-01 | Unknown inserted inline text is isolated | step 10 component API | open |
| BIDI-02 | Known LTR identifiers isolated | preview test | **done (previews)** |
| BIDI-03 | Free-text input uses automatic direction | preview test; step 17 | **done (previews)** |
| BIDI-04 | Strings are never reversed to implement RTL | review + static check | **done (never used)** |
| BIDI-05 | No bidi overrides without a documented exception | control-character scan, step 11 | open |
| BIDI-06 | Copy actions return canonical values | step 14 clipboard assertions | open |
| CSS-01 | Logical properties by default | preview test (no physical property in any generated stylesheet) | **done (previews)** |
| CSS-02 | Physical properties only with a documented geometry reason | step 10 allowlist | open |
| CSS-03 | No global `scaleX(-1)` | preview test covers the generated CSS | **done (previews)** |
| CSS-04 | Only icons marked directional are mirrored | step 10 icon registry | open |
| CSS-05 | No accidental double mirroring | step 10 LTR/RTL snapshots | open |
| CSS-06 | Chart direction specified explicitly | step 29 | open |
| TYPE-01 | No unreviewed tracking or synthetic italics on Arabic | preview test | **done (previews)** |
| TYPE-02 | No fixed text heights that clip approved samples | step 10 overflow tests | open |
| TYPE-03 | User diacritics preserved in display | step 17 round-trip | open |
| TYPE-04 | Fonts ship only with recorded licence approval | `previews/fonts/LICENCE.md`, verified against the distributed files | **done** |
| MSG-01 | Complete messages translated, never concatenated fragments | preview test | **done (previews)** |
| MSG-02 | Plural boundaries tested across all six Arabic categories | step 10 locale unit tests | open |
| MSG-03 | Interpolation variables validated across languages | step 10 build-time resource check | open |
| TERM-01 | The approved glossary enforced contextually | §3 below; step 10 translation QA | partial |
| A11Y-01 | Semantic DOM and focus order preserved | step 10 axe + keyboard tests | open |
| A11Y-02 | Icon-only controls have localized accessible names | step 10 axe | open |
| A11Y-03 | Chat updates announced at a usable cadence | step 17 + reviewer pack | open |
| QA-01 | Distinct LTR and RTL visual baselines | step 33 | open |
| QA-02 | Release blocked for critical linguistic or bidi defects | `REVIEW-PACK.md` release gate | open |

### 2.1 A rule about the rules

> Avoid naïve lint checks that ban every occurrence of `left` and `right`: they
> would also catch legitimate geometry, API names, and explanatory text.

The preview test asserts on **CSS declarations** (`margin-left:`,
`text-align: right`), not on the words. Physical properties stay legitimate for
map coordinates, chart plotting surfaces, media-source annotations and image
cropping — things that express geometry rather than reading order. Step 10 adds
the allowlist with a required reason and test reference per exception.

---

## 3. Terminology

The full ~110-term bilingual glossary is in the research under *Terminology and
glossary*. It is a **proposed** glossary — not an export from Microsoft, Google
or Apple terminology, and not evidence of Lebanese preference. Terms used so far:

| English | Arabic | Note |
| :-- | :-- | :-- |
| Support ticket | طلب دعم | Chosen over `تذكرة`; the previews were changed |
| Ticket ID | رقم الطلب | Identifier itself never translated |
| Customer | العميل | `الزبون` is the alternative to test |
| Priority | الأولوية | |
| Filter | تصفية | |
| Knowledge base | قاعدة المعرفة | `مركز المساعدة` for a public article collection |
| Log in | تسجيل الدخول | Observed on the Lebanese finance service |
| Password | كلمة المرور | Observed on the Lebanese finance service |
| Verification code | رمز التحقق | |
| Resolved | تم الحل | Kept distinct from `مغلق` (closed) |
| Escalate to a specialist | إحالة الطلب إلى فريق مختص | |

### 3.1 Gender-neutral wording

Nominal action labels and impersonal problem descriptions, rather than a guessed
grammatical gender for the reader. The previews changed accordingly:

| Was | Now | Why |
| :-- | :-- | :-- |
| `اشرح المشكلة…` | `يمكن شرح المشكلة…` | Imperative addressed a male reader |
| `ويحوّلك إلى مهندس` | `ويحيل الطلب إلى مهندس` | The `ـك` suffix is gendered |
| `هل حلّ هذا المشكلة؟` | `هل حُلّت المشكلة؟` | Also a real agreement error — `المشكلة` is feminine |
| `اكتب ردًا…` | `نص الرد…` | Imperative in a placeholder |

No European-style formal/informal "you" toggle. Politeness is carried by wording
and clarity.

### 3.2 Plurals

Arabic has six plural categories, and `count === 1 ? a : b` is wrong in five of
them. Step 10 ships all six per counted noun, with boundary tests at
`0, 1, 2, 3, 11, 100, 101, 1.5`. The preview copy already respects it: *3 طلبات*
(`few`), *4 دقائق* (`few`), *11 دقيقة* (`many`, which takes the singular).

---

## 4. Bidi component contracts

| Content | Contract |
| :-- | :-- |
| Interface shell | Explicit `dir`, from the interface language |
| User message | `dir="auto"`, per message — never the interface direction |
| Arabizi message | An LTR presentation candidate. **Never tagged `lang="en"`** because its characters are Latin |
| Ticket ID, phone, email, URL | Isolated LTR token (`<bdi dir="ltr">`) |
| Unknown inserted name | `<bdi>` or a tight wrapper with `dir="auto"` |
| Code | LTR |

`dir="auto"` is direction handling, **not** language detection: it reads the
first strong directional character. It cannot tell Arabizi from English, and
nothing should pretend otherwise. Tagging Arabizi as English tells a screen
reader to pronounce Lebanese Arabic with an English voice.

The research's ten synthetic bidi fixtures are the step 17 test corpus. They
must be tested through display, wrapping, selection, caret movement, deletion,
copy/paste, search, notification previews and export — "not just screenshots".

---

## 5. The open question: WCAG 2.1 or 2.2

The specification commits to **WCAG 2.1 AA**. The research recommends **2.2 AA**.

2.2 is a superset: same 2.1 criteria, plus nine more at A/AA — focus not
obscured, dragging movements, target size (minimum), consistent help, redundant
entry, accessible authentication. Several are cheap here and two are not:
*accessible authentication* interacts with the TOTP flow in step 06, and *target
size* constrains the Operations Desk direction's deliberately dense rows.

**Recommendation: build to 2.1 AA as committed, and record the 2.2 delta per
step rather than retrofitting it at the end.** Changing the committed target is
a specification change and therefore the user's call, not mine. Step 10 is the
cheapest moment to decide.

---

## 6. What remains unverified

Carried forward from the research, unchanged, because pretending otherwise is
the failure mode this document exists to prevent:

- No representative Lebanese numeral experiment. The Western-digit default is a
  reasoned default, not a measured preference.
- `ar-LB` CLDR defaults — digits, month strings, hour cycle, patterns — were not
  inspected. The research supplies a runtime audit script; step 10 runs it and
  commits the output.
- Eleven of the twelve Levantine month names are conventional, not verified
  against the current CLDR dataset.
- No screen-reader testing on any stack. NVDA, JAWS, VoiceOver (macOS and iOS)
  and TalkBack are all **unverified**; a pass on one must never be generalised.
- The glossary has no Lebanese task-based comprehension review behind it.
- No authenticated Lebanese banking interface was inspected, so the most
  relevant commercial comparison is missing.
