import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NUMBERING,
  direction,
  formatCountdown,
  formatDate,
  formatDateNumeric,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatTime,
  isLocale,
  LEVANTINE_MONTHS,
  LOCALES,
  normalizeDigits,
  primarySubtag,
  TIME_ZONE,
  type FormatPreferences,
} from './locale.js';

const ar: FormatPreferences = { locale: 'ar-LB' };
const en: FormatPreferences = { locale: 'en-LB' };

/* 24 October 2026, 15:30 Beirut (UTC+3 — Lebanon is on summer time). */
const instant = new Date('2026-10-24T12:30:00Z');

describe('locale identity', () => {
  it('recognises only the two interface locales', () => {
    expect(LOCALES.every((locale) => isLocale(locale))).toBe(true);
    expect(isLocale('ar')).toBe(false);
    expect(isLocale('fr-LB')).toBe(false);
  });

  it('reduces a regional tag to the subtag CSS and i18next key on', () => {
    expect(primarySubtag('ar-LB')).toBe('ar');
    expect(primarySubtag('en-LB')).toBe('en');
  });

  it('derives direction from the language, not from a stored flag', () => {
    expect(direction('ar-LB')).toBe('rtl');
    expect(direction('en-LB')).toBe('ltr');
  });
});

describe('numerals', () => {
  /* The decision, as a test. `ar-LB` resolves to the `arab` numbering system
     in this runtime (see docs/design/cldr-audit.json), so without the explicit
     override every number in the Arabic interface would come out as ٠١٢٣. */
  it('uses Western digits in Arabic by default', () => {
    expect(DEFAULT_NUMBERING).toBe('latn');
    expect(formatNumber(1234, ar)).toBe('1,234');
    expect(formatNumber(0.88, ar)).toBe('0.88');
  });

  it('is the runtime default that this overrides', () => {
    const untouched = new Intl.NumberFormat('ar-LB').resolvedOptions().numberingSystem;
    expect(untouched).toBe('arab');
  });

  /* Overturnable by the Phase 6 reviewers without a rewrite — that is the
     reason the numbering system is a parameter and not a constant. */
  it('can be switched to Arabic-Indic as a display preference', () => {
    expect(formatNumber(1234, { ...ar, numberingSystem: 'arab' })).toBe('١٬٢٣٤');
  });

  /* The trap this avoids. `ar-LB` with Western digits groups the European
     way, so `250.000` is read as two hundred fifty by anyone who reads the
     digits as Western. Separators follow the digits, not the interface. */
  it('pairs Western digits with Western separators', () => {
    expect(formatNumber(1_234_567.89, ar)).toBe('1,234,567.89');
    expect(new Intl.NumberFormat('ar-LB', { numberingSystem: 'latn' }).format(1_234_567.89)).toBe(
      '1.234.567,89',
    );
  });

  it('pairs Arabic-Indic digits with Arabic separators', () => {
    expect(formatNumber(1_234_567.89, { ...ar, numberingSystem: 'arab' })).toBe('١٬٢٣٤٬٥٦٧٫٨٩');
  });
});

describe('dates', () => {
  /* The research found that Lebanon writes `كانون الثاني`, while generic `ar`
     CLDR says `يناير`, and marked eleven of the twelve as unverified. They are
     verified now — but against *this* ICU build. The table stays explicit and
     this test fails if a runtime upgrade ever disagrees, which is the only way
     to notice. */
  it('matches the CLDR ar-LB month names exactly', () => {
    const fromRuntime = Array.from({ length: 12 }, (_, month) =>
      new Intl.DateTimeFormat('ar-LB', {
        calendar: 'gregory',
        timeZone: 'UTC',
        month: 'long',
      }).format(new Date(Date.UTC(2026, month, 15))),
    );
    expect(fromRuntime).toEqual([...LEVANTINE_MONTHS]);
  });

  it('is not the generic Arabic vocabulary', () => {
    expect(LEVANTINE_MONTHS[0]).toBe('كانون الثاني');
    expect(LEVANTINE_MONTHS[0]).not.toBe('يناير');
  });

  it('writes the month out in both languages', () => {
    expect(formatDate(instant, ar)).toBe('24 تشرين الأول 2026');
    expect(formatDate(instant, en)).toBe('24 October 2026');
  });

  it('writes a compact date day-first', () => {
    expect(formatDateNumeric(instant, ar)).toBe('24/10/2026');
    expect(formatDateNumeric(instant, en)).toBe('24/10/2026');
  });

  /* `ar-LB`'s own numeric pattern embeds RIGHT-TO-LEFT MARK between the
     fields. Correct for display, wrong in a string that is compared, searched
     or exported — so the compact date is assembled instead. */
  it('contains no invisible direction marks', () => {
    expect(formatDateNumeric(instant, ar)).not.toMatch(/[\u200e\u200f\u2066-\u2069]/);
    expect(new Intl.DateTimeFormat('ar-LB').format(instant)).toMatch(/\u200f/);
  });

  /* `en-LB` has no CLDR data and falls back to `en`, which is American. */
  it('does not inherit the American order from the en fallback', () => {
    expect(new Intl.DateTimeFormat('en-LB', { dateStyle: 'long' }).format(instant)).toBe(
      'October 24, 2026',
    );
    expect(formatDate(instant, en)).toBe('24 October 2026');
  });

  /* The time zone is configured, never inherited. Run this suite in Tokyo and
     it must still say Beirut's 15:30. */
  it('formats in Beirut regardless of the host time zone', () => {
    expect(TIME_ZONE).toBe('Asia/Beirut');
    expect(formatTime(instant, ar)).toBe('15:30');
    expect(formatTime(instant, { ...ar, timeZone: 'Asia/Tokyo' })).toBe('21:30');
  });

  it('defaults to a 24-hour clock and can be asked for 12', () => {
    expect(formatTime(instant, en)).toBe('15:30');
    expect(formatTime(instant, { ...en, hourCycle: 'h12' })).toMatch(/3:30\s*PM/);
  });

  /* A date is the day it falls on *in Beirut*. An instant late in the UTC day
     is already tomorrow locally, and taking the month from a UTC accessor is
     how an off-by-one-day bug gets shipped. */
  it('takes the local day, not the UTC one', () => {
    const lateUtc = new Date('2026-10-31T22:30:00Z'); // 00:30 on 1 November in Beirut
    expect(formatDate(lateUtc, ar)).toBe('1 تشرين الثاني 2026');
  });

  it('joins date and time without losing either', () => {
    expect(formatDateTime(instant, ar)).toBe('24 تشرين الأول 2026 · 15:30');
  });
});

describe('money', () => {
  /* Never a bare symbol: Lebanon runs on two currencies, and an ambiguous
     amount in a conversation about a refund is a real failure. */
  it('always names the currency', () => {
    expect(formatMoney(12.5, 'USD', en)).toContain('USD');
    expect(formatMoney(12.5, 'USD', en)).not.toContain('$');
    expect(formatMoney(250_000, 'LBP', ar)).toContain('LBP');
  });

  it('shows USD to two places and LBP whole', () => {
    expect(formatMoney(12.5, 'USD', en)).toMatch(/12\.50/);
    expect(formatMoney(250_000, 'LBP', en)).toMatch(/250,000(?!\.)/);
  });
});

describe('countdown', () => {
  it('pads to a fixed HH:MM so a column stays readable', () => {
    expect(formatCountdown(12 * 60_000, ar)).toBe('00:12');
    expect(formatCountdown((6 * 60 + 40) * 60_000, ar)).toBe('06:40');
    expect(formatCountdown(100 * 3_600_000, ar)).toBe('100:00');
  });

  /* A breach is the caller's to label; this must not render a negative time. */
  it('floors a passed deadline at zero', () => {
    expect(formatCountdown(-5000, ar)).toBe('00:00');
  });

  it('does not group the hours', () => {
    expect(formatCountdown(1000 * 3_600_000, ar)).toBe('1000:00');
  });
});

describe('digit normalisation', () => {
  it('accepts Arabic-Indic digits in a numeric field', () => {
    expect(normalizeDigits('٠٣٩٨٧٦٥٤')).toBe('03987654');
    expect(normalizeDigits('۰۳۹۸')).toBe('0398');
  });

  it('leaves Latin digits and everything else alone', () => {
    expect(normalizeDigits('+961 3 987 654')).toBe('+961 3 987 654');
  });

  /* The reason LOC-07 confines this to numeric fields. Arabizi spells عـ as 3
     and حـ as 7; run this over a chat message and `3am` becomes `am`. */
  it('is why it must never run over a chat message', () => {
    const arabizi = 'ma 3am ye2bal el password';
    expect(normalizeDigits(arabizi)).toBe(arabizi);
    expect(normalizeDigits('٣am')).toBe('3am');
  });
});
