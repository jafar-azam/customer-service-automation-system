#!/usr/bin/env node
/**
 * WCAG 2.1 contrast ratios for the design palettes.
 *
 * Every contrast number in `docs/design` is produced by this script rather
 * than asserted, because "AA compliant" is the easiest claim in interface
 * design to make and the easiest to get wrong — a palette that looks balanced
 * on a good monitor routinely fails 4.5:1 by a tenth of a point.
 *
 * Thresholds (WCAG 2.1):
 *   4.5:1  normal text
 *   3.0:1  large text (>=24px, or >=18.66px bold) and UI component boundaries
 *
 * The palettes live in `docs/design/palettes.json` so the previews, the tokens
 * in step 10 and this check all read one source.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PALETTES = 'docs/design/palettes.json';

/** sRGB channel → linear light, per WCAG's relative-luminance definition. */
function channel(value) {
  const srgb = value / 255;
  return srgb <= 0.040_45 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex) {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded down, never up: 4.49 must not be reported as 4.5 and pass. */
export function round(ratio) {
  return Math.floor(ratio * 100) / 100;
}

export function checkPalette(palette, pairs) {
  return pairs.map((pair) => {
    const foreground = palette[pair.fg];
    const background = palette[pair.bg];
    if (!foreground || !background) {
      throw new Error(`palette is missing ${pair.fg} or ${pair.bg}`);
    }
    const ratio = round(contrast(foreground, background));
    return {
      ...pair,
      foreground,
      background,
      ratio,
      passes: ratio >= pair.minimum,
    };
  });
}

function main() {
  const document = JSON.parse(readFileSync(PALETTES, 'utf8'));
  const failures = [];

  for (const direction of document.directions) {
    for (const mode of ['light', 'dark']) {
      const results = checkPalette(direction.modes[mode], document.pairs);
      const worst = Math.min(...results.map((result) => result.ratio));

      console.log(`\n${direction.name} — ${mode}  (lowest ${String(worst)}:1)`);
      for (const result of results) {
        const mark = result.passes ? '  ok ' : ' FAIL';
        console.log(
          `${mark} ${String(result.ratio).padStart(5)}:1  (needs ${String(result.minimum)})  ${result.label}`,
        );
        if (!result.passes) failures.push(`${direction.name}/${mode}: ${result.label}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`\ncontrast-check: ${String(failures.length)} pair(s) below AA\n`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('\ncontrast-check: every pair meets WCAG 2.1 AA');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
