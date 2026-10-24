# Native-speaker review pack

The Phase 6 linguistic review, specified up front so that recruiting is a task
with a definition rather than a vague intention to "ask a Lebanese friend".

Taken from [`docs/research/localization-lebanon.md`](../research/localization-lebanon.md),
*Native-speaker recruitment*, *Native-speaker review checklist* and *Reviewer
rating form*. Nothing here has been run yet.

---

## 1. What changed from the earlier plan

Step 09 originally said "two native Lebanese reviewers". The research argues
that is the wrong shape, and gives the reason: the Lebanese WhatsApp study
(227,059 messages, 1,112 students, 33 groups, 7 universities) found meaningful
differences in script preference *between sampled groups*. Two reviewers who
both happen to write in Arabic script would systematically miss the Arabizi
users, who are a large part of the intended audience and the harder case for
this product.

So the requirement is **coverage, not count**.

## 2. Required coverage

| Profile | Why this profile exists | Minimum |
| :-- | :-- | :-- |
| Arabic-script Lebanese user | Reads the Arabic interface as Arabic; catches register and agreement errors | 1 |
| Arabizi-heavy user | The assistant's hardest input; also the bidi stress case | 1 |
| English-dominant bilingual user | Switches languages mid-conversation; tests the language-separation rules | 1 |
| Experienced support agent or administrator | The dashboard's actual user; judges terminology under task pressure | 1 |
| Accessibility-technology user | The only person who can judge A11Y-03 | where feasible |

**Five profiles, minimum five people.** This is a proposed coverage strategy,
not a representative sample, and must not be described as one.

Each reviewer records, before reviewing: their language and script preference,
their role, build and date, page or task, interface language, conversation
language, numeral preference, clock preference, browser/OS/device, and —
where applicable — screen reader, voice and versions.

## 3. Method

Reviewers work against **screenshots and working flows**, never strings in a
spreadsheet. Each item shows the English source, the Arabic string, the intended
action, the interpolated variables, and the surrounding interface.

---

## 4. Checklist

### 4.1 Language and comprehension

- [ ] The action is clear without reading the English source.
- [ ] The Arabic sounds natural rather than literally translated.
- [ ] The register matches the surface: interface, marketing, security, conversation.
- [ ] Lebanese-specific wording is appropriate, not forced.
- [ ] English aliases help the intended audience rather than substituting for translation.
- [ ] One concept uses one approved term.
- [ ] Errors explain recovery.
- [ ] Destructive actions describe the consequence.
- [ ] Gendered address is avoided where a natural alternative exists.
- [ ] Number agreement and dual/plural forms are correct.
- [ ] Tashkeel is sufficient for ambiguity without unnecessary visual density.
- [ ] Arabic punctuation and spacing are appropriate.

### 4.2 Regional formatting

- [ ] Month names follow the approved Lebanese vocabulary.
- [ ] Numeric dates are unambiguous in context.
- [ ] Clock format follows the saved preference.
- [ ] Displayed time zone is clear when operationally important.
- [ ] The Western / Arabic-Indic display preference is applied consistently.
- [ ] Prices identify LBP or USD.
- [ ] Exchange-rate and rounding information is sufficient.
- [ ] Phone numbers and ticket IDs remain recognizable and copy correctly.

### 4.3 Direction and layout

- [ ] Arabic, English and Arabizi messages each display appropriately.
- [ ] Names, emails, URLs and identifiers do not disturb surrounding punctuation.
- [ ] Parentheses and final punctuation are correct.
- [ ] Leading numbers and emoji do not produce surprising alignment.
- [ ] Buttons and menus do not truncate important text.
- [ ] Icons communicate the intended action.
- [ ] Media, maps, logos, keypads and charts follow their documented exceptions.
- [ ] Table reading and keyboard order make sense.
- [ ] Mixed text wraps and selects correctly.

### 4.4 Accessibility and AI

- [ ] Arabic labels are understandable with the selected screen reader.
- [ ] Mixed-language speech behaviour is acceptable on the recorded test stack.
- [ ] Focus and error announcements are usable.
- [ ] Chat streaming does not create excessive announcements.
- [ ] The AI understands the tested dialect and Arabizi examples.
- [ ] The AI preserves names, amounts, IDs and quoted text.
- [ ] The AI requests clarification for consequential ambiguity.
- [ ] Human-support escalation is understandable and reachable.

---

## 5. Rating form

| Score | Meaning |
| :-- | :-- |
| 1 | Unusable, misleading, or seriously incorrect |
| 2 | Major revision required |
| 3 | Understandable but noticeably awkward or inconsistent |
| 4 | Good; minor revision required |
| 5 | Natural, clear, accurate, and ready |

Scored per dimension: meaning and task clarity · natural Arabic · Lebanese
appropriateness · terminology consistency · grammar and number agreement ·
gender-inclusive wording · dates, times, numbers and currency · bidi and
punctuation · typography and readability · accessibility in the tested stack ·
AI conversation quality.

Three yes/no flags carry more weight than any score: **critical
misunderstanding**, **incorrect amount, date or ID**, and **blocked task**.

Each defect records: string key or component, English source, current Arabic,
observed problem, suggested Arabic, screenshot or recording, severity, owner,
retest result. Disposition is *approve* / *approve after corrections* /
*reject*.

The numeric thresholds are internal quality policy. They are **not** a validated
research instrument and must not be reported as one.

---

## 6. Release gate (QA-02)

A release is blocked unless:

1. No critical meaning, financial, security, identifier or task-blocking defect.
2. Every major defect corrected and retested.
3. Explicit sign-off on the glossary, the formatting policy, and the supported
   accessibility combinations.

Automation alone is not sufficient, and neither is review alone.

---

## 7. What this pack will settle

Open questions from [`LOCALIZATION.md`](LOCALIZATION.md) §6 that reviewers can
actually answer — as opposed to the ones that need a runtime audit or a study:

- Whether Western digits read as correct in a Lebanese Arabic interface, or as a
  translation that was not finished.
- Whether `طلب دعم` or `تذكرة` is the term customers expect.
- Whether the Naskh face in the Dossier direction reads as considered or as
  dated — the direct question raised by its absence from the research's sans
  shortlist.
- Whether MSA for the interface with dialect in the conversation is the right
  split, or an uncomfortable seam.
- Whether an Arabic-Indic numeral preference is worth building at all.
