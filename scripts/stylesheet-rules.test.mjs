import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The stylesheets, checked as text.
 *
 * These live in the tooling project rather than beside the client because
 * Vitest strips CSS content from `?inline` and `?raw` imports, so a test that
 * read them that way would assert against an empty string and pass. Reading
 * the files is both honest and stronger: it covers every stylesheet in the
 * repository, including the generated previews, rather than the four a
 * component happens to import.
 *
 * Each test names the rule it enforces from `docs/design/LOCALIZATION.md`.
 */

/**
 * Strips comments before matching.
 *
 * The first run of this suite failed on `base.css`'s own comment explaining
 * why Arabic rules are keyed on `:lang(ar)` rather than `[dir='rtl']` — the
 * check caught the prose describing the thing it forbids. That is exactly the
 * false positive the research warns about ("avoid naive lint checks that ban
 * every occurrence of left and right"), so every text assertion below runs
 * against declarations only.
 */
const withoutComments = (css) => css.replaceAll(/\/\*[\s\S]*?\*\//g, '');

const sheets = Object.fromEntries(
  globSync(['apps/client/src/**/*.css', 'docs/design/previews/*.html']).map((path) => [
    path,
    withoutComments(readFileSync(path, 'utf8')),
  ]),
);

const tokens = sheets['apps/client/src/styles/tokens.css'] ?? '';
const base = sheets['apps/client/src/styles/base.css'] ?? '';

describe('the stylesheet inventory', () => {
  it('found the files it means to check', () => {
    expect(Object.keys(sheets).length).toBeGreaterThanOrEqual(6);
    expect(tokens).not.toBe('');
    expect(base).not.toBe('');
  });
});

describe('CSS-01 — logical properties by default', () => {
  /* Asserted on *declarations*, not on the words. The research is explicit
     that a check banning every occurrence of `left` and `right` also catches
     legitimate geometry, API names and explanatory prose — so this matches
     `margin-left:` and leaves a comment about reading order alone. */
  const physical =
    /(?:^|[;{\s])(margin|padding|border|inset|scroll-margin|scroll-padding)-(left|right)\s*:/;

  for (const [path, css] of Object.entries(sheets)) {
    it(`${path} declares no physical inline property`, () => {
      const offending = css
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => physical.test(line));
      expect(offending).toEqual([]);
    });

    it(`${path} aligns text logically and never mirrors by transform`, () => {
      expect(css).not.toMatch(/text-align:\s*(left|right)\b/);
      /* CSS-03. A global flip mirrors the logo, the chart and the checkmark
         along with the layout. */
      expect(css).not.toMatch(/scaleX\(\s*-1\s*\)/);
    });
  }
});

describe('section 2 of the brief — what the visual language excludes', () => {
  for (const [path, css] of Object.entries(sheets)) {
    it(`${path} has no gradient, glow, blur or keyframes`, () => {
      expect(css).not.toMatch(/linear-gradient|radial-gradient|conic-gradient|backdrop-filter/i);
      expect(css).not.toMatch(/filter:\s*blur/i);
      expect(css).not.toMatch(/@keyframes/);
    });

    it(`${path} keeps every duration within the 250ms budget`, () => {
      for (const [, duration] of css.matchAll(/(\d+(?:\.\d+)?)ms/g)) {
        /* 0.01ms belongs to the reduced-motion override, which exists to stop
           motion rather than to produce it. */
        if (Number(duration) < 1) continue;
        expect(Number(duration), `${path} has a ${duration}ms duration`).toBeLessThanOrEqual(250);
      }
    });
  }

  it('switches motion off under prefers-reduced-motion', () => {
    expect(base).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('TYPE-01 — Arabic typography', () => {
  it('turns off tracking, case transforms and synthetic weights for Arabic', () => {
    expect(base).toMatch(/:lang\(ar\)[\s\S]*?letter-spacing:\s*normal/);
    expect(base).toMatch(/:lang\(ar\)[\s\S]*?text-transform:\s*none/);
    expect(base).toMatch(/:lang\(ar\)[\s\S]*?font-synthesis:\s*none/);
  });

  /* Keyed on the language, not the direction. They coincide today and stop
     coinciding the moment an Arabic quotation appears in the English
     interface — which it does, in the conversation. */
  it('keys Arabic rules on the language rather than the direction', () => {
    expect(base).toContain(':lang(ar)');
    expect(base).not.toMatch(/\[dir=['"]rtl['"]\]/);
  });

  /* IBM Plex Mono carries no Arabic, so a monospace rule applied to Arabic
     falls back to a system face and breaks the joins. */
  it('repoints the monospace variable for Arabic', () => {
    expect(base).toMatch(/:lang\(ar\)[\s\S]*?--font-mono:/);
  });
});

describe('tokens', () => {
  it('is generated from the chosen direction, not hand-written', () => {
    const palettes = JSON.parse(readFileSync('docs/design/palettes.json', 'utf8'));
    const header = readFileSync('apps/client/src/styles/tokens.css', 'utf8');
    expect(palettes.chosen).toBe('dossier');
    /* Read with its comments: the provenance is *in* the header comment. */
    expect(header).toContain('Direction: Dossier (dossier)');
    expect(header).toContain('build:tokens');
  });

  /* Dark defined only inside the media query is the common bug: the toggle
     then works in one direction and silently fails in the other. */
  it('defines dark for the system and for the toggle, and defends light', () => {
    expect(tokens).toContain('@media (prefers-color-scheme: dark)');
    expect(tokens).toContain("[data-theme='dark']");
    expect(tokens).toContain(":root:not([data-theme='light'])");
  });

  it('declares color-scheme so native form controls follow the theme', () => {
    expect(tokens).toMatch(/color-scheme:\s*light dark/);
  });

  /* A colour defined in one mode and not the other resolves to nothing in
     that theme, and the element renders with no background at all. */
  it('defines the same colour tokens in light and dark', () => {
    const names = (block) => new Set([...block.matchAll(/--color-[\w-]+/g)].map((m) => m[0]));
    const light = tokens.slice(0, tokens.indexOf('@media'));
    const dark = tokens.slice(tokens.indexOf("[data-theme='dark']"));
    expect(names(dark)).toEqual(names(light));
  });

  /* Every token the components reference must exist, or the rule silently
     falls back to nothing. */
  it('defines every variable the stylesheets consume', () => {
    const defined = new Set([...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
    const consumed = new Set(
      Object.entries(sheets)
        .filter(([path]) => path.startsWith('apps/client') && !path.endsWith('tokens.css'))
        .flatMap(([, css]) => [...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1])),
    );
    const missing = [...consumed].filter((name) => !defined.has(name));
    expect(missing).toEqual([]);
  });
});
