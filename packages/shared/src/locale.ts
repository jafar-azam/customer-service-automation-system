/**
 * Locale policy, in one place, as code.
 *
 * `docs/design/LOCALIZATION.md` rules LOC-03 and LOC-04: every date, number
 * and amount goes through these functions, and calendar, numbering system and
 * time zone are configured explicitly rather than inherited from whatever the
 * runtime happens to default to.
 *
 * That last point is the whole reason this file exists. `new Date().toLocaleString('ar')`
 * returns something different on a Lebanese phone, a CI container and a
 * reviewer's laptop — different digits, a different calendar in some ICU
 * builds, and a different time zone. None of those differences are visible in
 * review and all of them are visible to a customer.
 */

/** The two interface languages, as regional tags. */
export const LOCALES = ['ar-LB', 'en-LB'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar-LB';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** `ar` for an `ar-LB` tag — what `:lang(ar)` and i18next both key on. */
export function primarySubtag(locale: Locale): string {
  const [language] = locale.split('-');
  return language ?? locale;
}

export function direction(locale: Locale): 'rtl' | 'ltr' {
  return primarySubtag(locale) === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Western digits in both languages.
 *
 * Lebanese institutional Arabic uses them: the Ministry of Finance e-service,
 * the Banking Control Commission's Arabic tables, the 2026 citizen budget. The
 * evidence is moderate — it establishes what those publishers do, not what
 * users prefer — so this is a default the Phase 6 reviewers can overturn, and
 * `NumberingSystem` exists so overturning it is a configuration change rather
 * than a rewrite.
 *
 * It must never apply to identifiers, stored values or user-authored text.
 * Arabizi uses digits as letters (3 = ع, 7 = ح, 2 = ء), so a global digit
 * conversion would corrupt the input this product exists to understand.
 */
export type NumberingSystem = 'latn' | 'arab';
export const DEFAULT_NUMBERING: NumberingSystem = 'latn';

export const TIME_ZONE = 'Asia/Beirut';

export interface FormatPreferences {
  readonly locale: Locale;
  readonly numberingSystem?: NumberingSystem;
  /** `h23` in the staff dashboard; customers get a saved preference. */
  readonly hourCycle?: 'h23' | 'h12';
  readonly timeZone?: string;
}

/**
 * The locale used to format *numbers*, which is not always the interface
 * locale.
 *
 * `ar-LB` with Western digits produces `1.234.567,89` — the European
 * convention, which is genuinely used in Lebanon. The problem is the mixture:
 * a reader who sees Western digits reads Western separators, so `LBP 250.000`
 * is read as two hundred fifty by half the audience and as a quarter of a
 * million by the other half. In a conversation about a refund that is not a
 * cosmetic defect.
 *
 * So separators follow the digits: Western digits get `en-LB`, Arabic-Indic
 * digits get `ar-LB`. Dates and month names are unaffected — those still come
 * from the interface locale, because `تشرين الأول` is not a separator.
 *
 * This is a product decision, not a finding. It is on the reviewer list in
 * `docs/design/REVIEW-PACK.md`.
 */
function numericLocale(preferences: FormatPreferences): Locale {
  return (preferences.numberingSystem ?? DEFAULT_NUMBERING) === 'arab' ? 'ar-LB' : 'en-LB';
}

function resolved(preferences: FormatPreferences): Required<FormatPreferences> {
  return {
    locale: preferences.locale,
    numberingSystem: preferences.numberingSystem ?? DEFAULT_NUMBERING,
    hourCycle: preferences.hourCycle ?? 'h23',
    timeZone: preferences.timeZone ?? TIME_ZONE,
  };
}

/**
 * Levantine month names, which is what Lebanon writes.
 *
 * CLDR's generic `ar` gives `يناير` for January; the Lebanese 2026 citizen
 * budget says `كانون الثاني`. Only January is directly evidenced — the other
 * eleven are the conventional Levantine set and are *not* verified against the
 * current `ar-LB` CLDR data, which is why they are a table here rather than a
 * trusted `Intl` default. `npm run audit:cldr` records what the runtime
 * actually returns.
 */
export const LEVANTINE_MONTHS = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
] as const;

const dateTimeFormat = (preferences: FormatPreferences, options: Intl.DateTimeFormatOptions) => {
  const { locale, numberingSystem, timeZone } = resolved(preferences);
  return new Intl.DateTimeFormat(locale, {
    calendar: 'gregory',
    numberingSystem,
    timeZone,
    ...options,
  });
};

/** The month index this instant falls in, *in Beirut* — not in UTC. */
function beirutParts(
  instant: Date,
  preferences: FormatPreferences,
): { day: string; month: number; year: string } {
  /* Always Western digits and always `en-LB` here: these are the *components*
     of a date, not its presentation, and parsing `Number('٣')` would fail. The
     caller decides how they are rendered. */
  const parts = dateTimeFormat(
    { ...preferences, locale: 'en-LB', numberingSystem: 'latn' },
    {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    },
  ).formatToParts(instant);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return { day: find('day'), month: Number(find('month')) - 1, year: find('year') };
}

/**
 * A written date: `24 تشرين الأول 2026` / `24 October 2026`.
 *
 * Written rather than numeric because Lebanese official sources use both
 * day/month/year and year/month/day, so a bare `03/04/2026` is genuinely
 * ambiguous to a Lebanese reader. Where space forces a numeric date, the
 * accessible name keeps this form.
 *
 * Assembled from parts in both languages rather than handed to a locale's
 * default pattern. `en-LB` has no CLDR data of its own and falls back to `en`,
 * which is American: `October 24, 2026`. Assembling is the only way the two
 * languages are guaranteed to say the same thing in the same order.
 *
 * The numeric form is assembled for a second reason: `ar-LB`'s own pattern
 * inserts RIGHT-TO-LEFT MARK between the fields (`24\u200f/10\u200f/2026`).
 * Those marks are correct for display and wrong to put in a string that gets
 * compared, searched, exported or copied. Direction is handled by markup here,
 * which is what the research recommends over control characters.
 */
export function formatDate(instant: Date, preferences: FormatPreferences): string {
  const { day, month, year } = beirutParts(instant, preferences);
  const name =
    primarySubtag(preferences.locale) === 'ar'
      ? LEVANTINE_MONTHS[month]
      : new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
          new Date(Date.UTC(2026, month, 15)),
        );
  return `${day} ${name ?? ''} ${year}`;
}

/** Day/month/year, the compact form. Always paired with a written full date. */
export function formatDateNumeric(instant: Date, preferences: FormatPreferences): string {
  const { day, month, year } = beirutParts(instant, preferences);
  const pad = (value: string | number) => String(value).padStart(2, '0');
  return `${pad(day)}/${pad(month + 1)}/${year}`;
}

export function formatTime(instant: Date, preferences: FormatPreferences): string {
  const { hourCycle } = resolved(preferences);
  return dateTimeFormat(preferences, { hour: '2-digit', minute: '2-digit', hourCycle }).format(
    instant,
  );
}

export function formatDateTime(instant: Date, preferences: FormatPreferences): string {
  return `${formatDate(instant, preferences)} · ${formatTime(instant, preferences)}`;
}

export function formatNumber(
  value: number,
  preferences: FormatPreferences,
  options: Intl.NumberFormatOptions = {},
): string {
  const { numberingSystem } = resolved(preferences);
  return new Intl.NumberFormat(numericLocale(preferences), { numberingSystem, ...options }).format(
    value,
  );
}

/**
 * Money, always with its currency named.
 *
 * Never a bare `$`: Lebanon runs on two currencies and an ambiguous symbol in
 * a support conversation about a refund is a real failure, not a cosmetic one.
 * `currencyDisplay: 'code'` prints `USD`/`LBP` rather than a glyph.
 *
 * LBP is shown whole. It has no practical subunit, and two decimal places on a
 * large pound figure is noise that makes the number harder to read.
 */
export function formatMoney(
  amount: number,
  currency: 'USD' | 'LBP',
  preferences: FormatPreferences,
): string {
  const fractionDigits = currency === 'USD' ? 2 : 0;
  return formatNumber(amount, preferences, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * A duration as `HH:MM`, for an SLA timer.
 *
 * Not `Intl.DurationFormat`: this is a countdown read at a glance in a column,
 * where a fixed two-and-two shape is the point and "4 hours, 12 minutes" is
 * not. Negative durations are a breach and are the caller's to label.
 */
export function formatCountdown(milliseconds: number, preferences: FormatPreferences): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const pad = (value: number) =>
    formatNumber(value, preferences, { minimumIntegerDigits: 2, useGrouping: false });
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

/**
 * Accepts Arabic-Indic and Eastern Arabic digits in a field declared numeric.
 *
 * LOC-07: only here, never globally. A customer typing `٥` into a phone field
 * means 5; the same character in a chat message is their text and is left
 * alone.
 */
export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (character) => {
    const code = character.codePointAt(0) ?? 0;
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}
