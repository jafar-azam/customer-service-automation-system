# Step 09 — Three design directions

**Phase 3. Status: awaiting your choice.** This step is one of the two approval
gates named in `CLAUDE.md`. Revised on 2026-10-24 against a sixth research
report on Lebanese localization, which reversed the numeral decision and found
three further defects — see §4.2 and §4.3. Nothing in `apps/client` has been styled, and
step 10 does not begin until you pick one of the three below.

## Goal

The brief asks for an **original** visual identity — explicitly not the
purple-and-blue-gradient, glassmorphic, emoji-iconed look that every AI product
shipped in 2024. The way to avoid that is not to try: it is to commit to three
genuinely different ideas about what kind of object this software is, build
enough of each to judge it, and then choose one on evidence.

So each direction is a complete answer to the same brief rather than a variation
on a theme, and each is rendered as a real page — the public home, the agent's
ticket queue, and the customer conversation — in **light and dark**, in
**English and Arabic**, with real bundled fonts and the real palette.

---

## 1. What was built

```
docs/design/
├── palettes.json                    the one source: 3 directions × 2 modes × 13 audited pairs
├── LOCALIZATION.md                  the Arabic/English contract: 35 rules, each owned by a step
├── REVIEW-PACK.md                   the Phase 6 native-speaker review, specified
└── previews/
    ├── index.html                   the three side by side
    ├── operations-desk.html         ┐
    ├── dossier.html                 ├ each: 3 screens × light/dark × en/ar
    ├── signal.html                  ┘
    └── fonts/                       13 subsetted woff2 + LICENCE.md
scripts/
├── contrast-check.mjs               WCAG 2.1 ratios, computed not asserted
├── contrast-check.test.mjs
├── build-design-previews.mjs        generates all four pages from palettes.json
└── build-design-previews.test.mjs
```

**Open `docs/design/previews/index.html` in a browser.** It needs no server and
no network. Each page has a Light/Dark and an English/العربية switch in its
header, and the state is in the URL (`?theme=dark&lang=ar`) so you can send me a
link to exactly what you are looking at.

---

## 2. The three directions

### 2.1 Operations Desk

> An instrument for people who work a queue all day: dense rows, numbers you can
> scan without reading, and colour used only where it carries a state. Neutral
> slate throughout so that the one amber and the one red mean something —
> nothing else on the screen competes with an SLA about to breach.

| | |
| :-- | :-- |
| Latin / Arabic / mono | IBM Plex Sans · IBM Plex Sans Arabic · IBM Plex Mono |
| Why that pairing | One family drawn for both scripts, so Arabic and English sit on the same baseline at the same weight and colour. Monospace for references and timers, where a wandering digit width is a readability bug. |
| Spacing · radius · body | 4px base · 4px radius · 14px |
| Rhythm | Tight, because an agent sees forty rows and not four; sharp, because a rounded corner at this density reads as blur. |
| Accent | Near-black slate — the primary button is the only black thing on the page |

**The case for it:** the system's real user is the agent, and this is the only
one of the three that is designed for the fortieth minute of a shift. **The case
against:** the customer-facing side inherits a tool, not a product; it is the
least warm of the three.

### 2.2 Dossier

> A support ticket is a record, so the interface behaves like a well-kept file:
> warm paper, a serif for anything that is read rather than scanned, and rules
> instead of boxes. It slows the eye down on purpose — this is the direction for
> a product whose credibility comes from being careful rather than fast.

| | |
| :-- | :-- |
| Latin / Arabic / mono | Source Serif 4 · Noto Naskh Arabic · IBM Plex Mono |
| Why that pairing | Naskh is the Arabic tradition that actually matches a Latin serif — both are calligraphic, both carry authority. Most Arabic/Latin pairings reach for a geometric sans and lose that entirely. |
| Spacing · radius · body | 8px base · 2px radius · 16px |
| Rhythm | Generous spacing, almost-square corners: the structure comes from horizontal rules and margins, the way a printed document does. |
| Accent | Deep teal on warm off-white; the dark mode is warm charcoal, not blue-black |

**The case for it:** it is the most distinctive of the three and the only one
nobody will mistake for a template, and the Arabic is better served here than
anywhere else — Naskh at 16px is genuinely pleasant to read. **The case
against:** a serif at a dense queue costs rows per screen, and the warmth has to
be defended in front of a committee that may read "paper" as "dated".

### 2.3 Signal

> The quiet, modern product: soft neutrals, one green that means resolved, and
> enough room that nothing feels urgent until something is. The most familiar of
> the three — closest to the tools people already use — which makes it the
> safest choice and the least distinctive one.

| | |
| :-- | :-- |
| Latin / Arabic / mono | Figtree · Readex Pro · IBM Plex Mono |
| Why that pairing | Readex Pro was drawn for Arabic first and given a Latin companion, so the Arabic is not an afterthought. It is noticeably rounder than Plex, which is the point of this direction. |
| Spacing · radius · body | 6px base · 10px radius · 15px |
| Rhythm | Rounded enough to feel approachable to a customer in the chat, restrained enough not to look like a consumer app in the queue. |
| Accent | A single forest green doing double duty as the accent and the "resolved" state |

**The case for it:** it is the easiest to live with and the least likely to go
wrong across forty screens. **The case against:** familiar is one step from
generic, and "it looks like every other SaaS" is a fair criticism of it.

---

## 3. Contrast is measured, not claimed

"WCAG AA compliant" is the easiest claim in interface design to make and the
easiest to get wrong — a palette that looks balanced on a good monitor routinely
misses 4.5:1 by a tenth of a point. So every number in this document is produced
by `npm run check:contrast`, which reads the same `palettes.json` the previews
and step 10 read, and `verify` fails if any pair drops below its threshold.

**78 pairs — 3 directions × 2 modes × 13 pairs — all pass.** The lowest in each:

| Direction | Light (lowest) | Dark (lowest) |
| :-- | :-- | :-- |
| Operations Desk | 4.58:1 | 3.49:1 |
| Dossier | 5.29:1 | 3.03:1 |
| Signal | 4.73:1 | 3.49:1 |

In every case the lowest pair is the **control boundary**, which WCAG 1.4.11
holds to 3:1 and not 4.5:1. The lowest *text* pair anywhere is 5.88:1 — secondary
text on a muted panel in Operations Desk light — against a 4.5:1 requirement.

`round()` floors rather than rounds, so a pair at 4.498 reports as `4.49` and
fails. Rounding up here would turn the check into the thing it exists to
prevent.

### 3.1 Two border tokens, on purpose

The first version of this check held *every* border to 3:1 and failed six pairs.
The check was wrong, not the palettes. WCAG 1.4.11 governs boundaries a person
must perceive **in order to operate a control** — not every line on the page. A
card edge separating a panel from the background is decorative; forcing 3:1 on
it is why some "accessible" interfaces look like spreadsheets.

So there are two tokens: `border`, decorative, unconstrained; and `borderStrong`
for inputs, checkboxes and segmented controls, held to 3:1 and verified. The
distinction is recorded in `palettes.json` itself so step 10 cannot quietly
collapse them back into one.

---

## 4. Bilingual, from one document

Each preview renders Arabic and English from the **same markup** — the switch
sets `dir` and `lang` and nothing else. That is the constraint that matters,
because the alternative (a second stylesheet for RTL) drifts within a month.

Everything directional is a logical property: `border-inline-end`,
`margin-inline-start`, `padding-inline`, `text-align: start`. A test asserts
that no `margin-left`, `padding-right`, `border-left` or `text-align: right`
exists in any generated stylesheet.

### 4.1 The bug this found

The Arabic dashboard came out inverted: the 196px sidebar took the **content**
column and the ticket table was squeezed into 196px. The cause was mine — I had
mirrored `grid-template-columns` by hand for RTL. CSS Grid already lays its
columns out in the writing direction, so the manual flip produced exactly the
opposite of its intent. Removing the rule fixed it.

It is in this README because it is the characteristic RTL mistake: the layout
engine already did the work, and *helping* it is what broke it. Verified by
screenshot after the fix — sidebar on the right, table in the wide column,
columns ordered right-to-left from الرقم.

### 4.2 Numerals — reversed after research

The Arabic copy originally used ٠١٢٣٤٥٦٧٨٩, on the reasoning that an Arabic
interface should use Arabic digits. I flagged it as unsettled; a sixth research
report,
[`docs/research/localization-lebanon.md`](../../research/localization-lebanon.md),
settled it the other way.

Lebanese institutional Arabic uses **Western digits**: the Ministry of Finance's
e-service displays `20/06/2026`, the Banking Control Commission's Arabic tables
use Western digits for dates, circular numbers and percentages, and the 2026
citizen-budget publication mixes Western digits with Arabic financial prose and
`ل.ل.`. The interface copy was changed — `٦٢٪` → `62%`, `٠٠:١٢` → `00:12`,
`٠٫٨٨` → `0.88`.

Two things about this that matter more than the digits:

**The evidence is moderate, not strong.** It establishes what those publishers
do, not what Lebanese users prefer. The report explicitly declines to claim a
national preference and records that no representative experiment comparing
`123` with `١٢٣` exists. So this is a defensible default the reviewers can
overturn, and `LOCALIZATION.md` says so.

**Digits are not cosmetic here.** Arabizi uses digits as letters — `3` for ع,
`7` for ح, `2` for ء. `ma 3am ye2bal el password` contains two digits and no
numbers. The obvious implementation of a numeral preference, a global digit
conversion, silently corrupts the main input this product exists to understand.
The normalisation boundary is therefore the *field*, never the application.

### 4.3 Three more findings from the same report

**Identifiers were not isolated.** `CSAS-001240 · بيروت لوجستيك · فُتحت قبل 11
دقيقة` was one pre-joined string with a Latin identifier at the head of an RTL
sentence — the worst bidi shape there is, and untranslatable besides. It is now
assembled from parts with the reference in `<bdi dir="ltr">`, which survives
selection and copy; a CSS-only `direction: ltr` does not.

**Arabic was inheriting Latin typography.** The label, eyebrow and table-header
rules set `letter-spacing` and `text-transform: uppercase`, written for Latin
and inherited by Arabic. Letter-spacing breaks the joining behaviour Arabic
script depends on, and `text-transform` means nothing in Arabic while still
mangling any Latin embedded in an Arabic string. Now switched off under
`:lang(ar)`, with `font-synthesis: none` so a missing weight fails visibly
instead of producing a smeared synthetic bold.

**Message direction belonged to the interface, not the message.** Bubbles now
carry `dir="auto"`, which demonstrates itself nicely: in the English preview the
customer writes Arabizi and the bubble resolves LTR; in the Arabic preview it
holds Arabic with an embedded Latin `error` and resolves RTL. One attribute,
both outcomes. Critically, Arabizi is never tagged `lang="en"` — it is Arabic
written in Latin characters, and that tag would tell a screen reader to
pronounce it with an English voice.

**And Arabic was being set in a Latin monospace face.** This one only showed up
in a screenshot. The SLA cell, the conversation meta line and the eyebrow all
used `--font-mono` — correct intent, aligned figures and an operational
register — but IBM Plex Mono carries no Arabic, so `تجاوزت` and
`بيروت لوجستيك` fell back to a system face and came apart at the joins
(`تجا وزت`). The mono rules are kept; the variable they read is repointed under
`:lang(ar)`, with `tabular-nums` so the figures still line up, and `.ref` pins
the real mono explicitly because an identifier is always Latin. The three
always-English preview labels are now tagged `lang="en"`, which is both the
correct markup for a known English passage inside an Arabic document and what
stops `:lang(ar)` from stripping a case transform that was right for Latin.

Alongside those, the Arabic copy picked up the report's glossary
(`طلبات الدعم` over `قائمة التذاكر`) and its gender-neutral wording — which
turned up a real grammar error I had shipped: `هل حلّ هذا المشكلة؟` disagrees
with the feminine `المشكلة`. It is now `هل حُلّت المشكلة؟`, which is both
correct and impersonal.

Eight tests now enforce these so they cannot drift back, and the full 35-rule
contract is in [`docs/design/LOCALIZATION.md`](../../design/LOCALIZATION.md).

---

## 5. What is deliberately absent

From section 2 of the brief, enforced by test where a test is possible:

- no gradient, glow, blur, glassmorphism or `backdrop-filter`
- no WebGL, 3D, canvas, particle field or autoplaying video
- no emoji as icons — the icons are inline SVG at 1.75px stroke
- no stock illustration, no "Welcome to…" heading
- the only motion is a 160ms transition on colour, opacity and a 1px
  `translateY` on press — no keyframes anywhere — and it is switched off
  entirely under `prefers-reduced-motion`
- no CDN: fonts are bundled, subsetted, and the previews open from `file://`

---

## 6. Fonts, licences and weight

Thirteen woff2 files, 364 KB in total, copied verbatim from installed
`@fontsource` packages by `npm run build:previews` rather than fetched by hand —
so the provenance of every byte is a dependency with a recorded licence and the
directory is reproducible from a clean clone.

All seven families are **SIL Open Font License 1.1** — verified by reading the
`LICENSE` file inside each installed package rather than by assuming it, which
is what rule TYPE-04 asks for and what the research explicitly marks as
unverified in its own font shortlist. `docs/design/previews/fonts/LICENCE.md`
records each file, package, version, licence line and copyright holder, with the
command to reproduce the check.

One departure is worth naming: the research's Arabic shortlist is Noto Sans
Arabic, IBM Plex Sans Arabic, Cairo and Tajawal — all sans. **Noto Naskh Arabic,
which the Dossier direction uses, is not on it.** The shortlist is framed there
as candidates for evaluation around a sans interface, so this is a departure
rather than a contradiction — but it means choosing Dossier is a decision made
against the shortlist, and the Naskh face goes to the native reviewers as a
specific question.

Only the Arabic subset is taken for Arabic faces and only the Latin subset for
Latin ones, which is why thirteen files come to 364 KB rather than several
megabytes. The chosen direction ships two or three of these; the other ten are
preview-only and go away at step 10.

---

## 7. How to verify

```bash
npm run check:contrast     # 78 pairs, all AA
npm run build:previews     # regenerates all four pages + fonts/
npx vitest run --project tooling
```

Then open `docs/design/previews/index.html`. Check, in each direction:

1. The ticket queue in **Arabic** — sidebar on the right, table filling the rest.
2. **Dark mode** — whether the accent still carries, and whether the warm
   charcoal in Dossier reads as a deliberate choice or as a wrong black.
3. The customer chat in both languages — this is the screen a customer actually
   meets, and it is where the three differ most.

---

## 8. Test results

```
$ npm run check:contrast
Operations Desk — light  (lowest 4.58:1)   ok  ×13
Operations Desk — dark   (lowest 3.49:1)   ok  ×13
Dossier — light          (lowest 5.29:1)   ok  ×13
Dossier — dark           (lowest 3.03:1)   ok  ×13
Signal — light           (lowest 4.73:1)   ok  ×13
Signal — dark            (lowest 3.49:1)   ok  ×13

contrast-check: every pair meets WCAG 2.1 AA

$ npx vitest run --project tooling scripts/contrast-check.test.mjs
 Test Files  1 passed (1)
      Tests  17 passed (17)

$ npx vitest run --project tooling scripts/build-design-previews.test.mjs
 Test Files  1 passed (1)
      Tests  18 passed (18)

$ npm run verify
 Test Files  31 passed (31)
      Tests  520 passed (520)
```

---

## 9. What this step does **not** prove

- **Contrast is not accessibility.** It is the one part that can be computed.
  Focus order, labels, landmarks, live regions and keyboard traps are step 10,
  where `axe` runs in CI against real components.
- **The previews are static HTML, not React.** They exist to decide, not to
  reuse; no markup from `docs/design/previews` is copied into `apps/client`.
- **The Arabic copy is mine, not a native speaker's.** It now follows a
  researched glossary, register and formatting policy, and one real agreement
  error was caught in the process — but researched is not reviewed. The review
  is specified in [`docs/design/REVIEW-PACK.md`](../../design/REVIEW-PACK.md),
  which replaces "two Lebanese reviewers" with **five profiles**: Arabic-script,
  Arabizi-heavy, English-dominant bilingual, a working support agent, and an
  accessibility-technology user. The reason is in the research — a Lebanese
  study of 227,059 messages across seven universities found script preference
  varies between groups, so two reviewers who both write in Arabic script would
  systematically miss the Arabizi users, who are this product's harder case.
- **Only tested in Chrome.** Safari's handling of logical properties in grid is
  the one I would check before trusting §4.
- **No screen reader has seen any of this.** NVDA, JAWS, VoiceOver on macOS and
  iOS, and TalkBack are all unverified, and the research is firm that a pass on
  one stack must never be generalised to another.
- **`ar-LB` CLDR defaults are unaudited.** The research supplies a runtime audit
  script for digits, month strings, hour cycle and date patterns; step 10 runs
  it and commits the output rather than trusting the locale name.

---

## 10. What you must do

**Pick one — Operations Desk, Dossier or Signal.** Step 10 turns the chosen
direction into CSS custom properties, a component library, both themes and the
RTL layer, and deletes the other two palettes from `palettes.json`.

You can also pick one and change part of it ("Dossier, but Plex instead of the
serif in the queue"). Mixing is cheap now and expensive after step 10.

---

## 11. Checklist

- [x] Three distinct directions, each a complete answer rather than a variation
- [x] Three screens each: public home, agent queue, customer chat
- [x] Light and dark for every direction
- [x] English LTR and Arabic RTL from one document
- [x] Every colour pair verified against WCAG 2.1 AA by script, in `verify`
- [x] Fonts bundled, subsetted, licensed, and reproducible from a clean clone
- [x] No gradient, glow, blur, canvas, emoji icon or stock illustration
- [x] Reduced-motion respected
- [x] Previews open with no server and no network
- [x] Numerals, bidi, Arabic typography and glossary follow the localization
      research, with eight tests enforcing them
- [x] Font licences verified against the distributed files, not assumed
- [x] The Phase 6 linguistic review specified with coverage, checklist, rating
      form and release gate
- [ ] **A direction chosen** ← you
