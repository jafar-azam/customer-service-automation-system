#!/usr/bin/env node
/**
 * Builds the three static design previews for step 09.
 *
 * Generated rather than hand-written, for one reason that matters: the colours
 * come from `docs/design/palettes.json`, which is the file
 * `npm run check:contrast` audits. A hand-copied hex in a preview is a hex
 * nobody checked, and the whole point of the previews is to decide from
 * something true.
 *
 * Each direction gets its own page with the three screens the specification
 * asks for — the public home hero, one dashboard screen, and the chat screen —
 * plus a light/dark toggle and an English/Arabic toggle, because a direction
 * that only works in one mode or one script is not a direction this project
 * can use.
 *
 * House rules, enforced by what is *not* here: no gradients, no glow, no
 * blur/glassmorphism, no emoji as icons (every icon is inline SVG), no
 * autoplaying anything. Motion is opacity and transform only, 160ms, and is
 * switched off entirely under `prefers-reduced-motion`.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const OUT = 'docs/design/previews';

/* ── Per-direction design decisions ──────────────────────────────────────── */

export const DIRECTIONS = {
  'operations-desk': {
    idea: [
      'An instrument for people who work a queue all day: dense rows, numbers you can scan without reading, and colour used only where it carries a state.',
      'Neutral slate throughout so that the one amber and the one red mean something — nothing else on the screen competes with an SLA about to breach.',
    ],
    fonts: {
      note: 'One family drawn for both scripts, so Arabic and English sit on the same baseline with the same weight and colour. Monospace for references and timers, where a wandering digit width is a readability bug.',
    },
    faces: [
      ['Latin', 'plex-sans-400.woff2', 400],
      ['Latin', 'plex-sans-600.woff2', 600],
      ['Arabic', 'plex-arabic-400.woff2', 400],
      ['Arabic', 'plex-arabic-600.woff2', 600],
      ['Mono', 'plex-mono-400.woff2', 400],
    ],
    scaleNote:
      '4px base, 4px radius. Tight because an agent sees forty rows, not four; sharp because a rounded corner at this density reads as blur.',
  },
  dossier: {
    idea: [
      'A support ticket is a record, so the interface behaves like a well-kept file: warm paper, a serif for anything that is read rather than scanned, and rules instead of boxes.',
      'It slows the eye down on purpose — this is the direction for a product whose credibility comes from being careful rather than fast.',
    ],
    fonts: {
      note: 'Naskh is the Arabic tradition that actually matches a Latin serif — both are calligraphic, both carry authority. Most Arabic/Latin pairings reach for a geometric sans and lose that entirely.',
    },
    faces: [
      ['Latin', 'serif-400.woff2', 400],
      ['Latin', 'serif-600.woff2', 600],
      ['Arabic', 'naskh-400.woff2', 400],
      ['Arabic', 'naskh-600.woff2', 600],
      ['Mono', 'plex-mono-400.woff2', 400],
    ],
    scaleNote:
      '8px base, 2px radius. Generous spacing and almost-square corners: the structure comes from horizontal rules and margins, the way a printed document does.',
  },
  signal: {
    idea: [
      'The quiet, modern product: soft neutrals, one green that means resolved, and enough room that nothing feels urgent until something is.',
      'The most familiar of the three — closest to the tools people already use — which makes it the safest choice and the least distinctive one.',
    ],
    fonts: {
      note: 'Readex Pro was drawn for Arabic first and given a Latin companion, so the Arabic is not an afterthought. It is noticeably rounder than Plex, which is the point of this direction.',
    },
    faces: [
      ['Latin', 'figtree-400.woff2', 400],
      ['Latin', 'figtree-600.woff2', 600],
      ['Arabic', 'readex-400.woff2', 400],
      ['Arabic', 'readex-600.woff2', 600],
      ['Mono', 'plex-mono-400.woff2', 400],
    ],
    scaleNote:
      '6px base, 10px radius. Rounded enough to feel approachable to a customer in the chat, restrained enough not to look like a consumer app in the queue.',
  },
};

/* ── Content, in both scripts ────────────────────────────────────────────── */

export const COPY = {
  en: {
    dir: 'ltr',
    lang: 'en',
    navItems: ['Home', 'About', 'Services', 'Contact'],
    heroEyebrow: 'Support for maintenance-contract customers',
    heroTitle: 'Answers from your own documentation, not from a guess.',
    heroBody:
      'Describe the problem in Arabic, Arabizi or English. The assistant answers only from approved knowledge-base entries and cites them — and hands you to an engineer the moment it is not sure.',
    heroPrimary: 'Sign in with your phone',
    heroSecondary: 'How it works',
    heroStats: [
      ['Answered without an engineer', '62%'],
      ['Median first response', '4 min'],
      ['Written forms handled', '5'],
    ],
    queueTitle: 'Ticket queue',
    queueSubtitle: 'On duty: Karim S. · 3 breaching within the hour',
    columns: ['Ref', 'Customer', 'Subject', 'Form', 'Priority', 'SLA'],
    rows: [
      [
        'CSAS-001241',
        'Cedar Pharmaceuticals',
        'Stock sync stopped overnight',
        'Arabizi',
        'High',
        '00:12',
        'warn',
      ],
      [
        'CSAS-001240',
        'Beirut Logistics',
        'Cannot print delivery notes',
        'Lebanese',
        'Urgent',
        'breached',
        'danger',
      ],
      ['CSAS-001238', 'Tripoli Textiles', 'Second till licence', 'English', 'Low', '06:40', 'ok'],
      [
        'CSAS-001237',
        'Cedar Pharmaceuticals',
        'Batch export missing column',
        'MSA',
        'Medium',
        '02:55',
        'ok',
      ],
    ],
    chatTitle: 'Printer stopped after the update',
    chatMetaRef: 'CSAS-001240',
    chatMetaRest: 'Beirut Logistics · opened 11 minutes ago',
    customerMessage: 'el printer 3am ya3mel error ba3ed l update, chou badna na3mel?',
    customerForm: 'Arabizi',
    assistantMessage:
      'After the 4.1 update the spooler service does not restart on its own. Stop the print spooler, clear the queue folder, then start it again — the delivery-note template is unaffected.',
    citationLabel: 'Knowledge base',
    citationRef: 'KB-0412',
    citationTitle: 'Print spooler after upgrade',
    confidence: 'Confidence 0.88',
    askedSolved: 'Did this solve the problem?',
    yes: 'Yes, thank you',
    no: 'No, I need a person',
    composer: 'Write a reply…',
    send: 'Send',
  },
  ar: {
    dir: 'rtl',
    lang: 'ar-LB',
    navItems: ['الرئيسية', 'من نحن', 'الخدمات', 'اتصل بنا'],
    heroEyebrow: 'دعم لعملاء عقود الصيانة',
    heroTitle: 'إجابات من وثائقكم أنتم، لا من التخمين.',
    heroBody:
      'يمكن شرح المشكلة بالعربية أو بالعربيزي أو بالإنكليزية. المساعد يجيب فقط من مقالات قاعدة المعرفة المعتمدة ويذكر مصدره، ويحيل الطلب إلى مهندس فور أن يفقد اليقين.',
    heroPrimary: 'الدخول برقم الهاتف',
    heroSecondary: 'كيف يعمل',
    heroStats: [
      ['حُلّت دون مهندس', '62%'],
      ['وسيط أول رد', '4 دقائق'],
      ['أشكال الكتابة المدعومة', '5'],
    ],
    queueTitle: 'طلبات الدعم',
    queueSubtitle: 'الوردية الحالية · 3 طلبات تتجاوز المهلة خلال ساعة',
    columns: ['رقم الطلب', 'العميل', 'الموضوع', 'شكل الكتابة', 'الأولوية', 'المهلة'],
    rows: [
      ['CSAS-001241', 'سيدر فارما', 'توقّف مزامنة المخزون', 'عربيزي', 'عالية', '00:12', 'warn'],
      [
        'CSAS-001240',
        'بيروت لوجستيك',
        'لا تطبع إيصالات التسليم',
        'لبنانية',
        'عاجلة',
        'تجاوزت',
        'danger',
      ],
      ['CSAS-001238', 'طرابلس للنسيج', 'رخصة صندوق ثانٍ', 'إنكليزية', 'منخفضة', '06:40', 'ok'],
      ['CSAS-001237', 'سيدر فارما', 'عمود ناقص في التصدير', 'فصحى', 'متوسطة', '02:55', 'ok'],
    ],
    chatTitle: 'الطابعة توقفت بعد التحديث',
    chatMetaRef: 'CSAS-001240',
    chatMetaRest: 'بيروت لوجستيك · فُتحت قبل 11 دقيقة',
    customerMessage: 'الطابعة عم تعطي error بعد التحديث، شو بدنا نعمل؟',
    customerForm: 'لبنانية مع تبديل لغوي',
    assistantMessage:
      'بعد تحديث 4.1 لا تُعاد خدمة الطباعة تلقائيًا. الحل: إيقاف خدمة الطباعة، ثم مسح مجلد قائمة الانتظار، ثم تشغيلها من جديد — قالب إيصال التسليم لا يتأثر.',
    citationLabel: 'قاعدة المعرفة',
    citationRef: 'KB-0412',
    citationTitle: 'خدمة الطباعة بعد الترقية',
    confidence: 'الثقة 0.88',
    askedSolved: 'هل حُلّت المشكلة؟',
    yes: 'نعم، شكرًا',
    no: 'لا، أريد موظف دعم',
    composer: 'نص الرد…',
    send: 'إرسال',
  },
};

/* `lang` carries a region (`ar-LB`), so equality against 'ar' would silently
   stop matching. Compare the primary subtag, the way language negotiation does
   and the way the CSS `:lang(ar)` selector already behaves. */
const isArabic = (copy) => copy.lang.split('-')[0] === 'ar';

/* ── Icons: inline SVG, never emoji ──────────────────────────────────────── */

const icon = (path, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${String(size)}" height="${String(size)}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const icons = {
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  alert: icon(
    '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  ),
  check: icon('<path d="M20 6 9 17l-5-5"/>'),
  book: icon(
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  ),
  user: icon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  spark: icon(
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  ),
  send: icon('<path d="M4 12h15M13 6l6 6-6 6"/>'),
};

/* ── CSS ─────────────────────────────────────────────────────────────────── */

function tokensFor(mode) {
  return Object.entries(mode)
    .map(
      ([name, value]) => `    --${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`,
    )
    .join('\n');
}

function fontFaces(faces) {
  return faces
    .map(
      ([family, file, weight]) => `@font-face {
  font-family: 'CSAS ${family}';
  src: url('fonts/${file}') format('woff2');
  font-weight: ${String(weight)};
  font-display: swap;
}`,
    )
    .join('\n');
}

function css(direction, palette) {
  const { scale } = direction;
  const unit = scale.base;
  const rowPad =
    scale.density === 'dense' ? unit * 2 : scale.density === 'roomy' ? unit * 2 : unit * 2.5;

  return `${fontFaces(direction.faces)}

:root {
${tokensFor(palette.light)}
  --unit: ${String(unit)}px;
  --radius: ${String(scale.radius)}px;
  --radius-lg: ${String(scale.radiusLarge)}px;
  --body-size: ${String(scale.bodySize)}px;
  --heading-weight: ${String(scale.headingWeight)};
  --font-latin: 'CSAS Latin', system-ui, sans-serif;
  --font-arabic: 'CSAS Arabic', 'CSAS Latin', system-ui, sans-serif;
  --font-mono: 'CSAS Mono', ui-monospace, monospace;
  color-scheme: light;
}

[data-theme='dark'] {
${tokensFor(palette.dark)}
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--canvas);
  color: var(--text);
  font-family: var(--font-latin);
  font-size: var(--body-size);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

[dir='rtl'] body, [dir='rtl'] .screen { font-family: var(--font-arabic); }

h1, h2, h3 { font-weight: var(--heading-weight); line-height: 1.2; margin: 0; letter-spacing: -0.01em; }
p { margin: 0; }

/* Motion: opacity and transform only, and never for anyone who asked not to. */
.interactive { transition: background-color 160ms ease, border-color 160ms ease, opacity 160ms ease, transform 160ms ease; }
.interactive:hover { transform: translateY(-1px); }
@media (prefers-reduced-motion: reduce) {
  .interactive, .interactive:hover { transition: none; transform: none; }
}

:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 2px; }

.shell { max-width: 1120px; margin: 0 auto; padding: calc(var(--unit) * 5) calc(var(--unit) * 4); }

.screen { background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: calc(var(--unit) * 6); }
.screen-label { display: flex; align-items: center; gap: calc(var(--unit) * 1.5); padding: calc(var(--unit) * 2) calc(var(--unit) * 3); background: var(--surface-muted); border-bottom: 1px solid var(--border); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); font-family: var(--font-mono); }

/* ── Public site ──────────────────────────────────────────────────────── */
.site-nav { display: flex; align-items: center; justify-content: space-between; padding: calc(var(--unit) * 3) calc(var(--unit) * 5); border-bottom: 1px solid var(--border); background: var(--surface); }
.wordmark { font-weight: 600; letter-spacing: 0.04em; display: flex; align-items: center; gap: calc(var(--unit) * 1.5); }
.wordmark span { font-family: var(--font-mono); font-size: 13px; color: var(--text-muted); }
.site-nav ul { display: flex; gap: calc(var(--unit) * 4); list-style: none; margin: 0; padding: 0; font-size: 14px; color: var(--text-muted); }

.hero { padding: calc(var(--unit) * 10) calc(var(--unit) * 5) calc(var(--unit) * 8); background: var(--surface); }
.eyebrow { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); font-family: var(--font-mono); margin-bottom: calc(var(--unit) * 2); }
.hero h1 { font-size: clamp(28px, 4.2vw, 46px); max-width: 20ch; margin-bottom: calc(var(--unit) * 3); }
.hero p { max-width: 58ch; color: var(--text-muted); font-size: calc(var(--body-size) + 2px); margin-bottom: calc(var(--unit) * 5); }
.actions { display: flex; gap: calc(var(--unit) * 2); flex-wrap: wrap; }

.btn { display: inline-flex; align-items: center; gap: calc(var(--unit) * 1.5); border-radius: var(--radius); padding: calc(var(--unit) * 1.75) calc(var(--unit) * 3); font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; border: 1px solid transparent; }
.btn-primary { background: var(--accent); color: var(--on-accent); }
.btn-secondary { background: transparent; color: var(--text); border-color: var(--border-strong); }

.stats { display: flex; gap: calc(var(--unit) * 8); margin-top: calc(var(--unit) * 8); padding-top: calc(var(--unit) * 5); border-top: 1px solid var(--border); flex-wrap: wrap; }
.stat strong { display: block; font-size: 26px; font-weight: 600; }
.stat span { font-size: 13px; color: var(--text-muted); }

/* ── Dashboard ────────────────────────────────────────────────────────── */
.dash { display: grid; grid-template-columns: 196px 1fr; min-height: 420px; background: var(--surface); }
/* Deliberately **not** mirrored for RTL. Grid lays its columns out in the
   writing direction already, so the 196px sidebar lands on the right in
   Arabic on its own. An earlier version flipped the template by hand and
   produced the opposite of what it intended: the sidebar took the wide
   column and the ticket table was squeezed into 196px. Everything
   directional here is a logical property - border-inline-end,
   text-align:start, margin-inline-end - which is the whole technique. */
.side { background: var(--surface-muted); border-inline-end: 1px solid var(--border); padding: calc(var(--unit) * 3); }
.side h2 { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin-bottom: calc(var(--unit) * 2); font-family: var(--font-mono); }
.side a { display: flex; align-items: center; gap: calc(var(--unit) * 1.5); padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2); border-radius: var(--radius); color: var(--text-muted); text-decoration: none; font-size: 14px; }
.side a.current { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: inset 0 0 0 1px var(--border); }

.dash-main { padding: calc(var(--unit) * 4); }
.dash-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: calc(var(--unit) * 4); gap: calc(var(--unit) * 3); flex-wrap: wrap; }
.dash-head h2 { font-size: 20px; }
.dash-head p { color: var(--text-muted); font-size: 13px; margin-top: calc(var(--unit) * 0.5); }

table { width: 100%; border-collapse: collapse; font-size: ${String(scale.density === 'dense' ? 13 : 14)}px; }
th { text-align: start; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; padding: 0 calc(var(--unit) * 2) calc(var(--unit) * 1.5); border-bottom: 1px solid var(--border); white-space: nowrap; }
td { padding: ${String(rowPad)}px calc(var(--unit) * 2); border-bottom: 1px solid var(--border); vertical-align: middle; }
tbody tr:last-child td { border-bottom: 0; }
/* An identifier is an LTR token wherever it appears. Isolated rather than
   merely direction-set, so the bidi algorithm cannot let surrounding Arabic
   punctuation migrate across its edges and change what the reader sees it as.
   The markup is <bdi>, which isolates on its own; this is belt and braces for
   the copy path and for a future <span class="ref">. */
.ref { font-family: 'CSAS Mono', ui-monospace, monospace; font-size: 12px; color: var(--text-muted); direction: ltr; unicode-bidi: isolate; }

/* Arabic typography, from docs/research/localization-lebanon.md (TYPE-01).
   Letter-spacing breaks the joining behaviour that Arabic script depends on,
   and text-transform: uppercase has no meaning in Arabic while still
   mangling any Latin embedded in an Arabic string. Both are inherited from the
   label, header and eyebrow rules above, which were written for Latin; this
   switches them off for Arabic rather than removing them everywhere.

   :lang(ar) matches ar-LB too - that is how the selector is defined, and
   it is why the regional tag on <html> costs nothing here. */
:lang(ar) { letter-spacing: normal; text-transform: none; }

/* Never fake a weight. Both families ship a real 400 and 600; if a face fails
   to load, this makes it visible instead of substituting a smeared synthetic
   bold, which on Arabic destroys the letterforms rather than thickening them. */
:lang(ar) { font-synthesis: none; }

/* IBM Plex Mono carries no Arabic, so any Arabic inside a monospace rule falls
   back to whatever the system supplies - which is how the overdue label and the
   conversation meta line ended up set in a face that broke their joins. The
   mono rules are right about intent (aligned figures, an operational register),
   so rather than stripping them, the variable they read is repointed for
   Arabic. Latin-only tokens opt back in explicitly below. */
:lang(ar) { --font-mono: 'CSAS Arabic', 'CSAS Latin', system-ui, sans-serif; }

/* Figures still have to line up in a column once the mono face is gone. */
.sla, .ref, .stat strong { font-variant-numeric: tabular-nums; }

.tag { display: inline-flex; align-items: center; gap: calc(var(--unit) * 0.75); font-size: 12px; padding: 2px calc(var(--unit) * 1.25); border-radius: var(--radius); background: var(--surface-muted); color: var(--text-muted); white-space: nowrap; }
.sla { display: inline-flex; align-items: center; gap: calc(var(--unit) * 0.75); font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
.sla-ok { color: var(--text-muted); }
.sla-warn { color: var(--warning); }
.sla-danger { color: var(--danger); }

/* ── Chat ─────────────────────────────────────────────────────────────── */
.chat { background: var(--surface); padding: calc(var(--unit) * 4); }
.chat-head { padding-bottom: calc(var(--unit) * 3); border-bottom: 1px solid var(--border); margin-bottom: calc(var(--unit) * 4); }
.chat-head h2 { font-size: 18px; }
.chat-head p { color: var(--text-muted); font-size: 13px; font-family: var(--font-mono); margin-top: calc(var(--unit) * 0.5); }

.msg { display: flex; gap: calc(var(--unit) * 2); margin-bottom: calc(var(--unit) * 3); max-width: 76ch; }
.avatar { flex: 0 0 auto; width: 28px; height: 28px; border-radius: ${String(scale.radius >= 10 ? 999 : scale.radius)}px; display: grid; place-items: center; background: var(--surface-muted); color: var(--text-muted); }
.bubble { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: calc(var(--unit) * 2.5) calc(var(--unit) * 3); background: var(--surface); }
.msg-customer .bubble { background: var(--surface-muted); border-color: transparent; }
.who { font-size: 12px; color: var(--text-muted); margin-bottom: calc(var(--unit) * 1); display: flex; gap: calc(var(--unit) * 1.5); align-items: center; }

.citation { display: inline-flex; align-items: center; gap: calc(var(--unit) * 1); margin-top: calc(var(--unit) * 2); font-size: 12px; color: var(--accent); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: calc(var(--unit) * 0.75) calc(var(--unit) * 1.5); }
.confidence { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }

.resolve { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: calc(var(--unit) * 3); margin-top: calc(var(--unit) * 4); display: flex; align-items: center; justify-content: space-between; gap: calc(var(--unit) * 3); flex-wrap: wrap; background: var(--surface); }
.resolve p { font-weight: 600; }

.composer { display: flex; gap: calc(var(--unit) * 2); margin-top: calc(var(--unit) * 4); }
.composer input { flex: 1; font: inherit; font-size: 14px; padding: calc(var(--unit) * 2); border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); }
.composer input::placeholder { color: var(--text-muted); }

/* ── Controls ─────────────────────────────────────────────────────────── */
.controls { position: sticky; top: 0; z-index: 10; display: flex; gap: calc(var(--unit) * 2); align-items: center; padding: calc(var(--unit) * 2) calc(var(--unit) * 4); background: var(--surface); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.controls .name { font-weight: 600; margin-inline-end: auto; }
.toggle { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius); overflow: hidden; }
.toggle button { font: inherit; font-size: 12px; padding: calc(var(--unit) * 1) calc(var(--unit) * 2); background: var(--surface); color: var(--text-muted); border: 0; cursor: pointer; }
.toggle button[aria-pressed='true'] { background: var(--accent); color: var(--on-accent); font-weight: 600; }

.swatches { display: flex; flex-wrap: wrap; gap: calc(var(--unit) * 1); margin-top: calc(var(--unit) * 2); }
.swatch { font-family: var(--font-mono); font-size: 11px; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.swatch i { display: block; height: 34px; width: 92px; }
.swatch b { display: block; padding: 3px 6px; font-weight: 400; color: var(--text-muted); background: var(--surface); }

.notes { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: calc(var(--unit) * 4); margin-bottom: calc(var(--unit) * 6); }
.notes h2 { font-size: 18px; margin-bottom: calc(var(--unit) * 2); }
.notes p { color: var(--text-muted); margin-bottom: calc(var(--unit) * 2); max-width: 70ch; }
.notes dl { display: grid; grid-template-columns: max-content 1fr; gap: calc(var(--unit) * 1) calc(var(--unit) * 3); margin: 0; font-size: 14px; }
.notes dt { color: var(--text-muted); }
.notes dd { margin: 0; }
`;
}

/* ── Screens ─────────────────────────────────────────────────────────────── */

function heroScreen(copy) {
  return `<section class="screen">
  <div class="screen-label" lang="en">${icons.spark} Public site — home</div>
  <nav class="site-nav">
    <div class="wordmark">C.S.A.S <span>support</span></div>
    <ul>${copy.navItems.map((item) => `<li>${item}</li>`).join('')}</ul>
  </nav>
  <div class="hero">
    <div class="eyebrow">${copy.heroEyebrow}</div>
    <h1>${copy.heroTitle}</h1>
    <p>${copy.heroBody}</p>
    <div class="actions">
      <button class="btn btn-primary interactive">${icons.user} ${copy.heroPrimary}</button>
      <button class="btn btn-secondary interactive">${copy.heroSecondary}</button>
    </div>
    <div class="stats">
      ${copy.heroStats.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}
    </div>
  </div>
</section>`;
}

function dashboardScreen(copy) {
  const slaIcon = { ok: icons.clock, warn: icons.clock, danger: icons.alert };
  return `<section class="screen">
  <div class="screen-label" lang="en">${icons.clock} Dashboard — ticket queue</div>
  <div class="dash">
    <aside class="side">
      <h2 lang="en">Desk</h2>
      <a href="#" class="current">${icons.clock} ${copy.queueTitle}</a>
      <a href="#">${icons.book} ${isArabic(copy) ? 'قاعدة المعرفة' : 'Knowledge base'}</a>
      <a href="#">${icons.user} ${isArabic(copy) ? 'العملاء' : 'Customers'}</a>
      <a href="#">${icons.alert} ${isArabic(copy) ? 'المراجعة' : 'Review queue'}</a>
    </aside>
    <div class="dash-main">
      <div class="dash-head">
        <div>
          <h2>${copy.queueTitle}</h2>
          <p>${copy.queueSubtitle}</p>
        </div>
        <button class="btn btn-secondary interactive">${isArabic(copy) ? 'تصفية' : 'Filter'}</button>
      </div>
      <table>
        <thead><tr>${copy.columns.map((column) => `<th>${column}</th>`).join('')}</tr></thead>
        <tbody>
          ${copy.rows
            .map(
              ([ref, customer, subject, form, priority, sla, state]) => `<tr>
            <td><bdi class="ref" dir="ltr">${ref}</bdi></td>
            <td>${customer}</td>
            <td>${subject}</td>
            <td><span class="tag">${form}</span></td>
            <td>${priority}</td>
            <td><span class="sla sla-${state}">${slaIcon[state]} ${sla}</span></td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </div>
</section>`;
}

function chatScreen(copy) {
  return `<section class="screen">
  <div class="screen-label" lang="en">${icons.spark} Customer — conversation</div>
  <div class="chat">
    <div class="chat-head">
      <h2>${copy.chatTitle}</h2>
      <p><bdi class="ref" dir="ltr">${copy.chatMetaRef}</bdi> · ${copy.chatMetaRest}</p>
    </div>

    <div class="msg msg-customer">
      <div class="avatar">${icons.user}</div>
      <div>
        <div class="who">${isArabic(copy) ? 'العميل' : 'Customer'} <span class="tag">${copy.customerForm}</span></div>
        <div class="bubble" dir="auto">${copy.customerMessage}</div>
      </div>
    </div>

    <div class="msg">
      <div class="avatar">${icons.spark}</div>
      <div>
        <div class="who">${isArabic(copy) ? 'المساعد' : 'Assistant'} <span class="confidence">${copy.confidence}</span></div>
        <div class="bubble" dir="auto">
          ${copy.assistantMessage}
          <div><span class="citation">${icons.book} ${copy.citationLabel} · <bdi class="ref" dir="ltr">${copy.citationRef}</bdi> · ${copy.citationTitle}</span></div>
        </div>
      </div>
    </div>

    <div class="resolve">
      <p>${copy.askedSolved}</p>
      <div class="actions">
        <button class="btn btn-primary interactive">${icons.check} ${copy.yes}</button>
        <button class="btn btn-secondary interactive">${copy.no}</button>
      </div>
    </div>

    <div class="composer">
      <input dir="auto" placeholder="${copy.composer}" aria-label="${copy.composer}" />
      <button class="btn btn-primary interactive">${icons.send} ${copy.send}</button>
    </div>
  </div>
</section>`;
}

function notesSection(direction, id) {
  const { scale, fonts } = direction;
  return `<section class="notes">
  <h2>Why this one might be right</h2>
  ${direction.idea.map((line) => `<p>${line}</p>`).join('')}
  <dl>
    <dt>Latin</dt><dd>${fonts.latin}</dd>
    <dt>Arabic</dt><dd>${fonts.arabic}</dd>
    <dt>Numbers &amp; refs</dt><dd>${fonts.mono}</dd>
    <dt>Type note</dt><dd>${fonts.note}</dd>
    <dt>Spacing</dt><dd>${String(scale.base)}px base — ${[1, 2, 3, 4, 6, 8, 10].map((step) => String(step * scale.base)).join(' · ')}</dd>
    <dt>Radius</dt><dd>${String(scale.radius)}px, ${String(scale.radiusLarge)}px for panels</dd>
    <dt>Rhythm</dt><dd>${direction.scaleNote}</dd>
    <dt>Token file</dt><dd><code>docs/design/palettes.json</code> → <code>${id}</code></dd>
  </dl>
</section>`;
}

function swatches(palette) {
  return `<section class="notes">
  <h2>Palette</h2>
  <p>Every pair is checked by <code>npm run check:contrast</code>; the numbers in the step README come from that run, not from an eyeball.</p>
  <div class="swatches">
    ${Object.entries(palette)
      .map(
        ([name, value]) =>
          `<div class="swatch"><i style="background:${value}"></i><b>${name}<br>${value}</b></div>`,
      )
      .join('')}
  </div>
</section>`;
}

function page(id, direction, palette) {
  const en = COPY.en;
  const ar = COPY.ar;

  return `<!doctype html>
<html lang="en-LB" dir="ltr" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${direction.name} — C.S.A.S design direction</title>
<style>${css(direction, palette)}</style>
</head>
<body>
<div class="controls">
  <span class="name">${direction.name}</span>
  <div class="toggle" role="group" aria-label="Theme">
    <button type="button" data-theme-btn="light" aria-pressed="true">Light</button>
    <button type="button" data-theme-btn="dark" aria-pressed="false">Dark</button>
  </div>
  <div class="toggle" role="group" aria-label="Language">
    <button type="button" data-lang-btn="en" aria-pressed="true">English</button>
    <button type="button" data-lang-btn="ar" aria-pressed="false">العربية</button>
  </div>
  <a href="index.html" style="font-size:12px;color:var(--text-muted)">All three →</a>
</div>

<div class="shell">
  ${notesSection(direction, id)}
  <div data-screens="en">
    ${heroScreen(en)}
    ${dashboardScreen(en)}
    ${chatScreen(en)}
  </div>
  <div data-screens="ar" dir="rtl" lang="ar-LB" hidden>
    ${heroScreen(ar)}
    ${dashboardScreen(ar)}
    ${chatScreen(ar)}
  </div>
  ${swatches(palette.light)}
</div>

<script>
  const root = document.documentElement;

  /* '?theme=dark&lang=ar' so one particular state can be linked and
     screenshotted, rather than described in words. */
  const params = new URLSearchParams(location.search);
  const wanted = { theme: params.get('theme'), lang: params.get('lang') };
  for (const button of document.querySelectorAll('[data-theme-btn]')) {
    button.addEventListener('click', () => {
      const mode = button.dataset.themeBtn;
      root.dataset.theme = mode;
      for (const other of document.querySelectorAll('[data-theme-btn]')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
    });
  }
  for (const button of document.querySelectorAll('[data-lang-btn]')) {
    button.addEventListener('click', () => {
      const lang = button.dataset.langBtn;
      document.querySelector('[data-screens="en"]').hidden = lang !== 'en';
      document.querySelector('[data-screens="ar"]').hidden = lang !== 'ar';
      for (const other of document.querySelectorAll('[data-lang-btn]')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
    });
  }

  if (wanted.theme === 'dark') document.querySelector('[data-theme-btn="dark"]').click();
  if (wanted.lang === 'ar') document.querySelector('[data-lang-btn="ar"]').click();
</script>
</body>
</html>`;
}

function indexPage(document_) {
  const cards = document_.directions
    .map(
      (direction) => `<a class="card interactive" href="${direction.id}.html">
  <h2>${direction.name}</h2>
  <p>${DIRECTIONS[direction.id].idea[0]}</p>
  <div class="row">
    ${['accent', 'canvas', 'surface', 'text', 'warning', 'danger']
      .map((key) => `<i title="${key}" style="background:${direction.modes.light[key]}"></i>`)
      .join('')}
  </div>
  <div class="row dark">
    ${['accent', 'canvas', 'surface', 'text', 'warning', 'danger']
      .map((key) => `<i title="${key}" style="background:${direction.modes.dark[key]}"></i>`)
      .join('')}
  </div>
  <span class="go">Open ${direction.name} →</span>
</a>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>C.S.A.S — three design directions</title>
<style>
  @font-face { font-family: 'CSAS Latin'; src: url('fonts/plex-sans-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'CSAS Latin'; src: url('fonts/plex-sans-600.woff2') format('woff2'); font-weight: 600; font-display: swap; }
  :root { color-scheme: light dark; }
  body { margin: 0; background: #f3f5f7; color: #14181d; font-family: 'CSAS Latin', system-ui, sans-serif; line-height: 1.55; }
  @media (prefers-color-scheme: dark) { body { background: #0d1014; color: #e7eaee; } .card { background: #151a20 !important; border-color: #39414d !important; } .card p { color: #9aa4b1 !important; } }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 56px 24px; }
  h1 { font-size: 30px; margin: 0 0 12px; letter-spacing: -0.01em; }
  .lede { max-width: 66ch; margin: 0 0 40px; opacity: 0.75; }
  .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .card { display: block; background: #fff; border: 1px solid #c5cbd4; border-radius: 8px; padding: 24px; text-decoration: none; color: inherit; transition: transform 160ms ease, border-color 160ms ease; }
  .card:hover { transform: translateY(-2px); }
  @media (prefers-reduced-motion: reduce) { .card, .card:hover { transition: none; transform: none; } }
  .card h2 { font-size: 20px; margin: 0 0 8px; }
  .card p { font-size: 14px; color: #525a66; margin: 0 0 16px; }
  .row { display: flex; gap: 4px; margin-bottom: 6px; }
  .row i { display: block; height: 22px; flex: 1; border-radius: 3px; border: 1px solid rgba(128,128,128,0.25); }
  .go { font-size: 13px; font-weight: 600; display: inline-block; margin-top: 12px; }
  footer { margin-top: 48px; font-size: 13px; opacity: 0.7; max-width: 70ch; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Three directions for C.S.A.S</h1>
  <p class="lede">Each one is a complete answer to the same brief, not a variation on a theme. Open any of them to see the public home page, the agent's ticket queue and the customer conversation — in light and dark, in English and Arabic. Then pick one; step 10 turns it into tokens and a component library.</p>
  <div class="grid">
${cards}
  </div>
  <footer>Colours come from <code>docs/design/palettes.json</code> and every pair is verified against WCAG 2.1 AA by <code>npm run check:contrast</code>. Fonts are bundled, not loaded from a CDN. No gradients, no glow, no blur, no emoji icons, no autoplaying anything — motion is opacity and transform only, and is switched off under <code>prefers-reduced-motion</code>.</footer>
</div>
</body>
</html>`;
}

/**
 * Where each bundled face comes from.
 *
 * The previews reference `fonts/*.woff2` relative to themselves, so they open
 * from a file:// URL with no server and no network — which is the only way a
 * reviewer will actually look at them. Copying from the installed
 * `@fontsource` packages rather than committing the binaries by hand means the
 * provenance of every byte is a dependency with a recorded licence, and
 * `npm run build:previews` reproduces the directory exactly.
 *
 * All five families are SIL Open Font License 1.1; see `fonts/LICENCE.md`,
 * written by this script from the licence files in the packages themselves.
 */
export const FONT_SOURCES = {
  'plex-sans-400.woff2': '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2',
  'plex-sans-600.woff2': '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2',
  'plex-arabic-400.woff2':
    '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
  'plex-arabic-600.woff2':
    '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
  'plex-mono-400.woff2': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
  'serif-400.woff2': '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2',
  'serif-600.woff2': '@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2',
  'naskh-400.woff2':
    '@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2',
  'naskh-600.woff2':
    '@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-600-normal.woff2',
  'figtree-400.woff2': '@fontsource/figtree/files/figtree-latin-400-normal.woff2',
  'figtree-600.woff2': '@fontsource/figtree/files/figtree-latin-600-normal.woff2',
  'readex-400.woff2': '@fontsource/readex-pro/files/readex-pro-arabic-400-normal.woff2',
  'readex-600.woff2': '@fontsource/readex-pro/files/readex-pro-arabic-600-normal.woff2',
};

export function copyFonts(directory, resolve = (specifier) => join('node_modules', specifier)) {
  mkdirSync(directory, { recursive: true });
  const copied = [];
  for (const [name, specifier] of Object.entries(FONT_SOURCES)) {
    copyFileSync(resolve(specifier), join(directory, name));
    copied.push(name);
  }
  return copied;
}

function main() {
  const document_ = JSON.parse(readFileSync('docs/design/palettes.json', 'utf8'));
  mkdirSync(OUT, { recursive: true });

  const copied = copyFonts(join(OUT, 'fonts'));
  console.log(`copied ${String(copied.length)} font files into ${OUT}/fonts`);

  for (const entry of document_.directions) {
    const direction = DIRECTIONS[entry.id];
    if (!direction) throw new Error(`no design notes for ${entry.id}`);
    writeFileSync(
      join(OUT, `${entry.id}.html`),
      page(
        entry.id,
        {
          ...direction,
          name: entry.name,
          scale: entry.scale,
          /* `fonts` is split across both files on purpose: the family names are
             values the product consumes, so they live in palettes.json with the
             colours; the note explaining the pairing is prose about the
             direction and stays here. */
          fonts: { ...entry.fonts, ...direction.fonts },
        },
        entry.modes,
      ),
    );
    console.log(`built ${OUT}/${entry.id}.html`);
  }

  writeFileSync(join(OUT, 'index.html'), indexPage(document_));
  console.log(`built ${OUT}/index.html`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
