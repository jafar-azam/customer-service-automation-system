import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COPY, copyFonts, DIRECTIONS, FONT_SOURCES, OUT } from './build-design-previews.mjs';

const palettes = JSON.parse(readFileSync('docs/design/palettes.json', 'utf8'));

describe('design notes and palettes stay in step', () => {
  /* The generator throws when a palette has no notes. The reverse — notes for
     a direction that was dropped from the palettes — is silent, and leaves a
     direction described in the README that nobody can open. */
  it('has notes for every direction and no orphans', () => {
    expect(Object.keys(DIRECTIONS).sort()).toEqual(palettes.directions.map((d) => d.id).sort());
  });

  it('gives every direction two paragraphs of reasoning and a type note', () => {
    for (const direction of Object.values(DIRECTIONS)) {
      expect(direction.idea).toHaveLength(2);
      expect(direction.fonts.note.length).toBeGreaterThan(40);
      expect(direction.scaleNote.length).toBeGreaterThan(40);
    }
  });
});

describe('bundled fonts', () => {
  /* The failure this prevents: a direction naming a face that was never
     copied. The preview still renders — in a system font — so it looks like a
     styling choice rather than a missing file. */
  it('has a source for every face any direction asks for', () => {
    for (const [id, direction] of Object.entries(DIRECTIONS)) {
      for (const [, file] of direction.faces) {
        expect(FONT_SOURCES, `${id} asks for ${file}`).toHaveProperty(file);
      }
    }
  });

  it('copies every declared file', () => {
    const source = mkdtempSync(join(tmpdir(), 'csas-fonts-src-'));
    const destination = mkdtempSync(join(tmpdir(), 'csas-fonts-out-'));
    const resolve = (specifier) => {
      const file = join(source, specifier.replaceAll('/', '_'));
      writeFileSync(file, specifier);
      return file;
    };

    const copied = copyFonts(destination, resolve);

    expect(copied.sort()).toEqual(Object.keys(FONT_SOURCES).sort());
    expect(readdirSync(destination).sort()).toEqual(Object.keys(FONT_SOURCES).sort());
  });

  it('fails loudly when a source package is not installed', () => {
    const destination = mkdtempSync(join(tmpdir(), 'csas-fonts-out-'));
    expect(() => copyFonts(destination, () => '/nonexistent/font.woff2')).toThrow(/ENOENT/);
  });
});

describe('the generated previews', () => {
  const pages = palettes.directions.map((direction) => ({
    id: direction.id,
    html: readFileSync(join(OUT, `${direction.id}.html`), 'utf8'),
  }));

  it('were rebuilt after the last change to the generator', () => {
    for (const page of pages) expect(page.html).toContain(DIRECTIONS[page.id].scaleNote);
  });

  /* Section 2 of the brief, as a test rather than an intention. */
  it('contain no gradient, glow, blur or canvas', () => {
    for (const page of pages) {
      expect(page.html).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter|<canvas/i);
      expect(page.html).not.toMatch(/box-shadow:[^;]*rgba\([^)]*\)\s+\d+px\s+\d+px\s+[2-9]\dpx/i);
    }
  });

  /* Every directional rule must be a logical property, or the Arabic layout
     is a separate stylesheet that drifts from the English one. This is the
     bug that shipped once already: a hand-mirrored `grid-template-columns`
     put the sidebar in the content column and squeezed the ticket table into
     196px. Grid already lays out in the writing direction. */
  it('use logical properties, never left/right ones', () => {
    for (const page of pages) {
      const css = page.html.slice(page.html.indexOf('<style>'), page.html.indexOf('</style>'));
      expect(css, page.id).not.toMatch(/\b(margin|padding|border)-(left|right)\s*:/);
      expect(css, page.id).not.toMatch(/\btext-align:\s*(left|right)\b/);
    }
  });

  /* The brief caps motion at 150-250ms and requires it to stop entirely under
     `prefers-reduced-motion`. A keyframe animation would slip past a reading
     of the CSS; it does not slip past this. */
  it('keep motion short, transition-only, and switchable off', () => {
    for (const page of pages) {
      const css = page.html.slice(page.html.indexOf('<style>'), page.html.indexOf('</style>'));
      expect(css, page.id).not.toMatch(/@keyframes|animation\s*:/);
      expect(css, page.id).toContain('@media (prefers-reduced-motion: reduce)');
      for (const [, duration] of css.matchAll(/(\d+)ms/g)) {
        expect(Number(duration), `${page.id} has a ${duration}ms transition`).toBeLessThanOrEqual(
          250,
        );
      }
    }
  });

  it('render both languages from one document', () => {
    for (const page of pages) {
      expect(page.html).toContain("dir='rtl'");
      expect(page.html).toContain('lang=ar');
    }
  });

  it('reference only local font files', () => {
    for (const page of pages) {
      expect(page.html).not.toMatch(/https?:\/\/(fonts|cdn)/i);
      expect(page.html).toMatch(/url\('fonts\//);
    }
  });
});

/* ── The localization contract ────────────────────────────────────────────
   Rules from `docs/research/localization-lebanon.md`, enforced here so the
   previews cannot drift back. Each test names the rule id it implements;
   `docs/design/LOCALIZATION.md` maps the full set to the step that enforces
   it. These are the ones a static check can reach. */
describe('localization rules', () => {
  const pages = palettes.directions.map((direction) => ({
    id: direction.id,
    html: readFileSync(join(OUT, `${direction.id}.html`), 'utf8'),
  }));
  const css = (html) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const arabicCopy = Object.entries(COPY.ar)
    .filter(([key]) => key !== 'dir' && key !== 'lang')
    .map(([, value]) => JSON.stringify(value))
    .join(' ');

  /* The research's own headline recommendation, and a reversal of what this
     step originally shipped: Lebanese government and financial-regulatory
     Arabic uses Western digits, so the Arabic interface does too. The
     optional Arabic-Indic *display preference* it allows is a step 10
     feature; it must never reach identifiers or user-authored text. */
  it('LOC-06/07 — uses Western digits in Arabic interface copy', () => {
    const arabicIndic = [...arabicCopy].filter((character) => /[٠-٩۰-۹]/.test(character));
    expect(arabicIndic).toEqual([]);
  });

  /* `٪` and `٫` travel with Arabic-Indic digits; mixing `62٪` with Western
     digits is the inconsistency the decision table warns about. */
  it('LOC-06 — uses Western percent and decimal signs to match', () => {
    expect(arabicCopy).not.toMatch(/[٪٫٬]/);
  });

  it('LOC-01 — declares a regional language tag and an explicit direction', () => {
    for (const page of pages) {
      expect(page.html).toContain('<html lang="en-LB" dir="ltr"');
      expect(page.html).toContain('lang="ar-LB"');
      expect(page.html).toContain('dir="rtl"');
    }
  });

  /* TYPE-01. Letter-spacing breaks Arabic joining and `text-transform` is
     meaningless in Arabic while still mangling embedded Latin. The Latin
     rules that set both are kept; they are switched off for Arabic. */
  it('TYPE-01 — switches off tracking and case transforms for Arabic', () => {
    for (const page of pages) {
      expect(css(page.html), page.id).toMatch(
        /:lang\(ar\)[^}]*letter-spacing:\s*normal[^}]*text-transform:\s*none/,
      );
      expect(css(page.html), page.id).toMatch(/:lang\(ar\)[^}]*font-synthesis:\s*none/);
    }
  });

  /* BIDI-02. Every ticket and article reference is an isolated LTR token in
     the markup, not only in CSS — so it survives selection, copy and export,
     which a CSS-only fix does not. */
  it('BIDI-02 — isolates every identifier as an LTR token', () => {
    for (const page of pages) {
      const references = [...page.html.matchAll(/(CSAS-\d{6}|KB-\d{4})/g)].map((match) => match[1]);
      expect(references.length, page.id).toBeGreaterThan(0);
      for (const reference of new Set(references)) {
        const unisolated = new RegExp(`(?<!<bdi class="ref" dir="ltr">)${reference}`, 'g');
        const loose = [...page.html.matchAll(unisolated)];
        expect(loose, `${page.id} renders ${reference} outside a <bdi>`).toEqual([]);
      }
    }
  });

  /* BIDI-03. Direction belongs to the message, not to the interface: in the
     English preview the customer writes Arabizi and the bubble must resolve
     LTR; in the Arabic preview it holds Arabic with embedded Latin and must
     resolve RTL. One attribute, both outcomes. */
  it('BIDI-03 — gives user text automatic direction', () => {
    for (const page of pages) {
      expect(page.html, page.id).toMatch(/class="bubble" dir="auto"/);
      expect(page.html, page.id).toMatch(/<input dir="auto"/);
    }
  });

  /* The research is explicit that `dir="auto"` is direction handling and not
     language detection: Arabizi is Latin-script Arabic, and tagging it
     `lang="en"` tells a screen reader to read it aloud as English. */
  it('BIDI-03 — never tags a message as English by its script', () => {
    for (const page of pages) {
      expect(page.html, page.id).not.toMatch(/class="bubble"[^>]*lang="en/);
    }
  });

  /* MSG-01. An identifier buried inside a pre-joined sentence is both the
     worst bidi shape and untranslatable. Both strings that used to do it are
     now assembled from parts. */
  it('MSG-01 — does not pre-join identifiers into translated sentences', () => {
    for (const [language, copy] of Object.entries(COPY)) {
      for (const value of Object.values(copy)) {
        if (typeof value !== 'string') continue;
        const reference = /(CSAS-\d{6}|KB-\d{4})/.exec(value);
        if (!reference) continue;
        /* Carrying an identifier is fine; the field must then be *only* the
           identifier, so the surrounding sentence stays translatable and the
           token can be isolated where it is rendered. */
        expect(value.trim(), `${language}: "${value}" embeds an identifier`).toBe(reference[1]);
      }
    }
  });
});
