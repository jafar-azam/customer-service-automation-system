# Step 09 — Three design directions

**Phase 3. Status: awaiting your choice.** This step is one of the two approval
gates named in `CLAUDE.md`. Nothing in `apps/client` has been styled, and
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

### 4.2 Arabic-Indic numerals

The Arabic copy uses ٠١٢٣٤٥٦٧٨٩ in prose and statistics. Lebanese usage is
genuinely mixed — Western digits are common in writing — so this is a decision
to revisit with the native reviewers in Phase 6, not a settled one. Ticket
references (`CSAS-001241`) stay Western in both languages because they are
identifiers, not quantities.

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

All five families are **SIL Open Font License 1.1**, which permits this
redistribution. `docs/design/previews/fonts/LICENCE.md` lists each file, its
family, its source package and its copyright holder.

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
      Tests  10 passed (10)
```

---

## 9. What this step does **not** prove

- **Contrast is not accessibility.** It is the one part that can be computed.
  Focus order, labels, landmarks, live regions and keyboard traps are step 10,
  where `axe` runs in CI against real components.
- **The previews are static HTML, not React.** They exist to decide, not to
  reuse; no markup from `docs/design/previews` is copied into `apps/client`.
- **The Arabic copy is mine, not a native speaker's.** It reads correctly but it
  is not reviewed. The two Lebanese reviewers in Phase 6 see the real strings.
- **Only tested in Chrome.** Safari's handling of logical properties in grid is
  the one I would check before trusting §4.

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
- [ ] **A direction chosen** ← you
