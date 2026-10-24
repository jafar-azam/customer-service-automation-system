# Step 10 — The design system

**Phase 3. Status: complete and verified** against the test suite and the
running Compose stack on 2026-10-24.

## Goal

Turn the approved direction into something the rest of the application is built
from: tokens, a component library, both themes, Arabic and English from one
layout, and `axe` in CI.

**Dossier** was chosen at the step 09 gate, and **WCAG 2.1 AA** confirmed as the
target over the research's 2.2 recommendation.

---

## 1. What was built

```
apps/client/src/
├── styles/tokens.css           generated from palettes.json — do not edit
├── styles/base.css             direction, typography, focus, motion
├── components/                 Button · Card · Field · Identifier · Tag ·
│                               Callout · SegmentedControl · icons
├── i18n/                       ar-LB and en-LB catalogues, i18next setup
├── locale-context.tsx          the language switcher; the only place lang+dir are set
├── theme.tsx                   light / dark / system
├── css-module.ts               types a CSS module's class names
└── test/axe.ts                 the accessibility harness
packages/shared/src/locale.ts   date, number, money and duration formatters
scripts/build-tokens.mjs        palettes.json → tokens.css
scripts/audit-cldr.mjs          what this runtime's ICU actually does
scripts/stylesheet-rules.test.mjs  the CSS rules, checked as text
```

Run it with `npm run up`, then open <http://localhost:8080>. The header has the
language and theme switchers; everything below them is the component library
rendering itself.

---

## 2. Decisions, and what each one costs

### 2.1 Tokens are generated, not written

`npm run build:tokens` reads the direction marked `chosen` in
`docs/design/palettes.json` and writes `tokens.css`. The alternative — a
hand-written stylesheet — gives two sources of truth that agree on the day they
are written. It also breaks the contrast guarantee: `npm run check:contrast`
runs against the JSON, so if the CSS were separate it would be checking a file
nobody renders.

CI regenerates and runs `git diff --exit-code`, which catches both an edited
output and a changed generator that nobody rebuilt.

**The other two directions are kept, not deleted.** Step 09 said this step would
remove them. They are the evidence that the approval gate was a real choice
between real alternatives, `docs/design/previews/` still renders all three, and
the generator ignores them. Deleting them would save nothing and destroy the
record.

### 2.2 Three theme states, because `system` is one of them

`system` means "follow the operating system", and someone who picks it expects
their interface to change at dusk. A boolean cannot express that, which is why
so many theme toggles stop following the system permanently after one click.
Choosing `system` **removes** `data-theme` so the media query is the only thing
deciding.

The stylesheet has to agree in all three directions:

```css
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { … } }
:root[data-theme='dark'] { … }
```

Defining dark only inside the media query is the common bug — the toggle then
works one way and silently fails the other. A test asserts all three are
present.

### 2.3 `:lang(ar)`, not `[dir='rtl']`

Every Arabic typography rule keys on the language. The two coincide today and
stop coinciding the first time an Arabic quotation appears in the English
interface — which it does, in the conversation. A test asserts `[dir='rtl']`
appears in no stylesheet.

### 2.4 axe-core directly, not a wrapper

`vitest-axe` is the obvious choice and is at **0.1.0, untouched since January
2025**. `axe-core` is current and is the part that does the work, so the wrapper
would put an unmaintained dependency in front of a maintained one to save about
thirty lines.

**axe cannot check contrast here.** jsdom has no layout engine and computes no
used colours, so `color-contrast` is disabled — and a green run would otherwise
read as if it had passed. Contrast is covered by `npm run check:contrast`
instead. The two together cover it; neither alone does.

### 2.5 A typed CSS module

`noPropertyAccessFromIndexSignature` is on, and Vite types a CSS module as
`Record<string, string>`, so `styles.button` does not compile. Writing
`styles['button']` everywhere would satisfy the compiler and discard what the
flag is for: against an index signature a typo is `string | undefined` and
silently renders an unstyled element. `css-module.ts` names the classes so a
typo is a compile error, and a test compares the list against what the
stylesheet actually exports so it cannot rot.

---

## 3. Formatting: four findings from not trusting `Intl`

The research's position is that calendar, numbering system and time zone must be
configured explicitly rather than inherited. Writing `packages/shared/src/locale.ts`
produced four concrete reasons, each now a test.

### 3.1 `ar-LB` defaults to Arabic-Indic digits

```
ar-LB → gregory/arab h12
```

Without the explicit `numberingSystem: 'latn'`, every number in the Arabic
interface would render as `٠١٢٣` — the opposite of the decision taken in step
09. The default also gives a **12-hour** clock where the dashboard wants 24.

### 3.2 Western digits with Arabic separators are dangerous

`ar-LB` with `latn` digits produces `1.234.567,89` — the European convention,
genuinely used in Lebanon. The problem is the mixture: a reader who sees Western
digits reads Western separators, so **`LBP 250.000` is read as two hundred fifty
by half the audience and as a quarter of a million by the other half.** In a
conversation about a refund that is not cosmetic.

So separators follow the digits: Western digits format through `en-LB`,
Arabic-Indic through `ar-LB`. Month names are unaffected — `تشرين الأول` is not
a separator. This is a product decision, not a finding, and it is on the
reviewer list.

### 3.3 `en-LB` has no CLDR data and falls back to American

`new Intl.DateTimeFormat('en-LB', { dateStyle: 'long' })` returns
`October 24, 2026`. Both languages now assemble the written date from parts, so
they are guaranteed to say the same thing in the same order.

### 3.4 `ar-LB` numeric dates carry invisible marks

`24‏/10‏/2026` — RIGHT-TO-LEFT MARK between the fields. Correct for
display, wrong in a string that gets compared, searched, exported or copied. The
compact date is assembled instead, and direction is handled by markup, which is
what the research recommends over control characters.

### 3.5 What the audit settled

`npm run audit:cldr` writes `docs/design/cldr-audit.json`, committed so a diff
is a finding rather than noise. It answered a question the research left open:

> Eleven of the twelve Levantine month names were **unverified** against `ar-LB`
> CLDR.

**All twelve match**, on ICU 78.3. The explicit table is kept anyway, with a test
asserting it equals what the runtime returns — explicit values *plus* a failure
if a Node upgrade ever disagrees is stronger than either alone.

---

## 4. Arabic plurals

Arabic has six plural categories, and `count === 1 ? a : b` is wrong in five of
them. i18next v26 resolves the suffix through `Intl.PluralRules`, so the
categories come from CLDR rather than from a hand-written list.

| Count | Category | Rendered |
| :-- | :-- | :-- |
| 0 | `zero` | لا توجد طلبات دعم |
| 1 | `one` | طلب دعم واحد |
| 2 | `two` | طلبا دعم |
| 3, 10 | `few` | 3 طلبات دعم |
| 11, 99 | `many` | 11 طلبًا للدعم |
| 100, 101 | `other` | عدد طلبات الدعم: 100 |

The counted noun changes shape with the category — `3 طلبات` but `11 طلبًا` —
which is why the whole message is translated rather than a noun concatenated
after a formatted number (MSG-01).

---

## 5. Security and accessibility controls, and the test proving each

| Control | Test |
| :-- | :-- |
| LOC-01 `lang` + `dir` set together, with the region | `App.test.tsx` — both languages |
| LOC-03/04 formatters explicit about calendar, numbering, zone | `locale.test.ts` — incl. formatting in Beirut from a Tokyo host |
| LOC-05 identifiers never transformed | `components.test.tsx` |
| LOC-06/07 digit normalisation confined to numeric fields | `locale.test.ts` — `3am` survives, `٣am` converts |
| BIDI-02 identifiers isolated as `<bdi dir="ltr">` | `components.test.tsx`, `App.test.tsx` |
| BIDI-03 user text takes `dir="auto"`, Arabizi never `lang="en"` | `App.test.tsx` |
| CSS-01/03 logical properties, no `scaleX(-1)` | `stylesheet-rules.test.mjs` — every stylesheet |
| TYPE-01 no tracking, case transform or synthetic weight on Arabic | `stylesheet-rules.test.mjs` |
| MSG-02 six Arabic plural categories at their boundaries | `i18n.test.ts` |
| MSG-03 catalogues agree on keys and interpolation variables | `i18n.test.ts` |
| A11Y-01 focus order, labels, landmarks | axe over the whole app × 2 languages × 2 themes |
| A11Y-02 icon-only controls have names | `components.test.tsx` |
| Errors are announced, not just coloured | `components.test.tsx` — `aria-invalid` + `role="alert"` |
| Palette meets 2.1 AA | `npm run check:contrast`, in `verify` and CI |

XSS: React escapes everything it renders and there is no
`dangerouslySetInnerHTML` anywhere. i18next's own escaping is **off** —
deliberately, because escaping twice renders `&#39;` on screen; React is the
encoder.

---

## 6. Three bugs found by running it, not by testing it

The test suite was green before any of these.

**The client image compiled Redis.** `npm ci` in a workspace installs every
workspace's dev dependencies, and `redis-memory-server`'s postinstall builds
Redis from source — which needs `make`, absent from a slim image. The server
Dockerfile already passed `--ignore-scripts`; the client's did not.

**Vite failed on a dangling project reference.** The client image copies the
root `tsconfig.json`, whose only content is references to all three projects
including `./apps/server`, which the image has no reason to contain. Nothing
noticed until the client started importing `@csas/shared` and Vite resolved the
nearest tsconfig while transforming it. The solution file is no longer copied;
each project's own config extends `tsconfig.base.json` directly.

**A named volume froze the dependency set.** `client-node-modules` persisted
across `up --build`, so the container kept serving whatever it first started
with — adding i18next, rebuilding, and watching Vite still report *failed to
resolve i18next* is how it surfaced. It is now anonymous, recreated from the
image with the container, which is what the mount was always meant to do.

One more worth knowing for next time: `docker compose up --force-recreate`
**carries anonymous volumes over**. `--renew-anon-volumes` is the flag.

---

## 7. How to verify

```bash
npm run build:tokens      # palettes.json → tokens.css
npm run audit:cldr        # what this runtime's ICU does
npm run check:contrast    # 78 pairs, all AA
npm run test              # 647 tests
npm run up                # then open http://localhost:8080
```

In the browser, in both languages:

1. **Switch language.** The text, the direction, the typeface and the stored
   choice change together. In Arabic the layout mirrors; the Arabizi message
   stays left-to-right, because direction belongs to the message.
2. **Switch theme.** Light, dark, and System — then change your OS appearance
   with System selected and watch it follow.
3. **Tab through it.** The skip link appears first. Every control draws a focus
   ring; nothing is reachable without one.
4. **Check the date and the count.** `24 تشرين الأول 2026`, not `أكتوبر`;
   `3 طلبات دعم`, not a singular with a 3 in front of it.

---

## 8. Test results

```
$ npm run check:contrast
contrast-check: every pair meets WCAG 2.1 AA

$ npm run audit:cldr
built docs/design/cldr-audit.json (Node v24.22.1, ICU 78.3)
  ar-LB  → ar-LB  gregory/arab h12  Jan=كانون الثاني
  ar     → ar     gregory/latn h12  Jan=يناير
  ar-SA  → ar-SA  gregory/arab h12  Jan=يناير
  ar-EG  → ar-EG  gregory/arab h12  Jan=يناير
  en-LB  → en     gregory/latn h12  Jan=January

$ npm run verify
secret-scan: clean (tracked files)
personal-data-scan: clean — 101 protected passages, none present in tracked files
 Test Files  35 passed (35)
      Tests  647 passed (647)
```

The four axe runs — Arabic and English, light and dark — are inside that total
and report no violations.

---

## 9. What this step does not prove

- **No screen reader has seen it.** NVDA, JAWS, VoiceOver and TalkBack are all
  unverified. axe finds roughly a third to a half of real barriers; it cannot
  tell you that an announcement is confusing.
- **axe ran in jsdom, not a browser.** No layout, so no contrast check and no
  reflow or target-size check. Step 33 runs it against a real page.
- **The Arabic strings are researched, not reviewed.** `REVIEW-PACK.md` is the
  plan; until it runs, every string is provisional.
- **Only Chrome.** Safari's handling of logical properties in grid is the thing
  I would check first.
- **The components are not a full library.** Dialog, toast, menu, date picker
  and table sorting arrive with the screens that need them, in Phase 4.

---

## 10. What you must configure

Nothing. No keys, no accounts, no services.

To change the design direction, edit `chosen` in `docs/design/palettes.json` and
run `npm run build:tokens`. All three palettes are still there.

---

## 11. Checklist

- [x] Tokens generated from the chosen direction, CI checks the output matches
- [x] Light, dark and system, agreeing in all three directions
- [x] Component library with the accessibility contract in the component
- [x] Arabic and English from one layout, logical properties throughout
- [x] Language switcher setting `lang` and `dir` together, choice persisted
- [x] Six Arabic plural categories, tested at their boundaries
- [x] Formatters explicit about calendar, numbering system and time zone
- [x] CLDR runtime audit committed; the Levantine month table verified
- [x] axe in CI over the whole application, both languages, both themes
- [x] The application actually run, and three bugs found by doing so
