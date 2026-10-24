import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkPalette, contrast, luminance, parseHex, round } from './contrast-check.mjs';

/* The two anchors of the sRGB luminance curve. Everything else this script
   computes is interpolation between them, so if these are right the formula
   is transcribed correctly. */
describe('relative luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  /* The linear branch applies below 0.03928; #0A is 10/255 = 0.0392, just
     inside it. A naive implementation that uses the power curve everywhere
     passes every other test and fails this one. */
  it('uses the linear branch for very dark channels', () => {
    expect(luminance('#0A0A0A')).toBeCloseTo(10 / 255 / 12.92, 12);
  });
});

describe('contrast ratio', () => {
  it('is 21:1 for black on white, in both orders', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 10);
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 10);
  });

  it('is 1:1 for a colour against itself', () => {
    expect(contrast('#226149', '#226149')).toBeCloseTo(1, 10);
  });

  /* A published reference pair: #767676 is the lightest grey that still
     reaches 4.5:1 on white, which is why it appears in so many style guides. */
  it('matches the known 4.54:1 of #767676 on white', () => {
    expect(round(contrast('#767676', '#FFFFFF'))).toBe(4.54);
  });
});

describe('rounding', () => {
  /* Floor, not round: a pair at 4.498 is below AA, and reporting it as "4.5"
     would turn the check into the thing it exists to prevent. */
  it('never rounds a failing ratio up to a passing one', () => {
    expect(round(4.4999)).toBe(4.49);
    expect(round(2.999)).toBe(2.99);
  });
});

describe('hex parsing', () => {
  it('expands three-digit shorthand', () => {
    expect(parseHex('#abc')).toEqual(parseHex('#aabbcc'));
  });

  it('rejects anything that is not a colour', () => {
    expect(() => parseHex('#12345')).toThrow(/not a hex colour/);
    expect(() => parseHex('rebeccapurple')).toThrow(/not a hex colour/);
  });
});

describe('checkPalette', () => {
  it('refuses a pair whose token is missing rather than skipping it', () => {
    expect(() =>
      checkPalette({ text: '#000000' }, [{ fg: 'text', bg: 'canvas', minimum: 4.5 }]),
    ).toThrow(/missing text or canvas/);
  });

  it('marks a pair below its own minimum as failing', () => {
    const [result] = checkPalette({ a: '#777777', b: '#FFFFFF' }, [
      { label: 'grey on white', fg: 'a', bg: 'b', minimum: 4.5 },
    ]);
    expect(result.ratio).toBeLessThan(4.5);
    expect(result.passes).toBe(false);
  });
});

/* The check that actually matters: the committed palettes, not fixtures.
   This is what makes "WCAG 2.1 AA" in the design README a measurement. */
describe('the three shipped directions', () => {
  const document = JSON.parse(readFileSync('docs/design/palettes.json', 'utf8'));

  it('offers three directions, each in light and dark', () => {
    expect(document.directions).toHaveLength(3);
    for (const direction of document.directions) {
      expect(Object.keys(direction.modes).sort()).toEqual(['dark', 'light']);
    }
  });

  for (const direction of document.directions) {
    for (const mode of ['light', 'dark']) {
      it(`${direction.id} / ${mode} meets AA on every audited pair`, () => {
        const failures = checkPalette(direction.modes[mode], document.pairs)
          .filter((result) => !result.passes)
          .map((result) => `${result.label}: ${result.ratio}:1 < ${result.minimum}:1`);
        expect(failures).toEqual([]);
      });
    }
  }
});
