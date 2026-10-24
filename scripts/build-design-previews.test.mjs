import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFonts, DIRECTIONS, FONT_SOURCES, OUT } from './build-design-previews.mjs';

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
