/**
 * When the company is actually open.
 *
 * An SLA is a promise about *our* response, so the clock may only run while
 * someone could be responding. A four-hour target that burns through a Sunday
 * night is not a promise anyone made, and reporting a breach for it teaches
 * agents to ignore breaches.
 *
 * Everything here is computed in `Asia/Beirut`, which is why the environment
 * pins `TZ`. Beirut observes summer time, so an offset is never hard-coded:
 * the hour is asked of `Intl` for the instant in question.
 */

export interface BusinessHours {
  /** Minutes from local midnight. 08:30 is 510. */
  readonly openMinute: number;
  readonly closeMinute: number;
  /** 0 = Sunday … 6 = Saturday. */
  readonly workingDays: readonly number[];
}

/**
 * Lebanon works Monday to Friday, with Saturday a half-day in many firms.
 *
 * Saturday is excluded here and that is a configuration choice rather than a
 * fact: a company that opens on Saturday changes one array. Friday is a
 * working day — Lebanon is not a Sunday-Thursday week.
 */
export const DEFAULT_HOURS: BusinessHours = {
  openMinute: 8 * 60 + 30,
  closeMinute: 17 * 60 + 30,
  workingDays: [1, 2, 3, 4, 5],
};

/**
 * Public holidays, as dates rather than as rules.
 *
 * Lebanon's calendar mixes four systems: fixed Gregorian dates, Western
 * Easter, Orthodox Easter, and the Islamic lunar calendar. The lunar dates
 * are *announced*, not computed — they depend on a moon sighting, and a
 * library that calculates them is confidently wrong about one or two days
 * every year.
 *
 * So this is a table, with the year it was entered for, and a loud failure
 * when asked about a year nobody has filled in. The alternative — silently
 * treating an unknown year as having no holidays — would quietly make every
 * SLA in that year too tight, and nobody would notice until the reports were
 * already wrong.
 *
 * Source: Lebanese public-sector holiday decrees. Dates are `YYYY-MM-DD` in
 * Beirut local time.
 */
export const HOLIDAYS: Readonly<Record<number, readonly string[]>> = {
  2026: [
    '2026-01-01', // New Year's Day
    '2026-01-06', // Armenian Orthodox Christmas
    '2026-02-09', // Saint Maron
    '2026-02-14', // Rafic Hariri Memorial Day
    '2026-03-19', // Eid al-Fitr (announced)
    '2026-03-20', // Eid al-Fitr
    '2026-03-21', // Eid al-Fitr
    '2026-03-25', // Feast of the Annunciation
    '2026-04-03', // Good Friday (Western)
    '2026-04-06', // Easter Monday (Western)
    '2026-04-10', // Good Friday (Orthodox)
    '2026-04-13', // Easter Monday (Orthodox)
    '2026-05-01', // Labour Day
    '2026-05-25', // Resistance and Liberation Day
    '2026-05-26', // Eid al-Adha (announced)
    '2026-05-27', // Eid al-Adha
    '2026-05-28', // Eid al-Adha
    '2026-06-16', // Islamic New Year
    '2026-06-25', // Ashura
    '2026-08-15', // Assumption of the Virgin Mary
    '2026-08-25', // Prophet's Birthday
    '2026-11-22', // Independence Day
    '2026-12-25', // Christmas Day
  ],
  2027: [
    '2027-01-01',
    '2027-01-06',
    '2027-02-09',
    '2027-02-14',
    '2027-03-09', // Eid al-Fitr (provisional — confirm against the decree)
    '2027-03-10',
    '2027-03-11',
    '2027-03-25',
    '2027-03-26', // Good Friday (Western)
    '2027-03-29', // Easter Monday (Western)
    '2027-04-30', // Good Friday (Orthodox)
    '2027-05-01',
    '2027-05-03', // Easter Monday (Orthodox)
    '2027-05-16', // Eid al-Adha (provisional)
    '2027-05-17',
    '2027-05-18',
    '2027-05-25',
    '2027-06-06', // Islamic New Year
    '2027-06-15', // Ashura
    '2027-08-15',
    '2027-08-15', // Prophet's Birthday (provisional)
    '2027-11-22',
    '2027-12-25',
  ],
};

export class UnknownYear extends Error {
  constructor(readonly year: number) {
    super(
      `no holiday table for ${String(year)}. Lebanese lunar and Orthodox dates are announced, ` +
        'not computed — add the year to HOLIDAYS rather than letting the SLA clock run through it.',
    );
    this.name = 'UnknownYear';
  }
}

/* ── Local time, without hard-coding an offset ──────────────────────────── */

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Beirut',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAYS: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface LocalMoment {
  readonly isoDate: string;
  readonly year: number;
  readonly weekday: number;
  readonly minuteOfDay: number;
}

/**
 * The instant, as Beirut sees it.
 *
 * `formatToParts` rather than arithmetic on the UTC value: Beirut is UTC+2 in
 * winter and UTC+3 in summer, so `getUTCHours() + 2` is wrong for half the
 * year and wrong in the other direction across a transition.
 */
export function localMoment(instant: Date): LocalMoment {
  const parts = Object.fromEntries(
    PARTS.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    isoDate: `${parts['year'] ?? ''}-${parts['month'] ?? ''}-${parts['day'] ?? ''}`,
    year: Number(parts['year']),
    weekday: WEEKDAYS[parts['weekday'] ?? ''] ?? 0,
    minuteOfDay: Number(parts['hour']) * 60 + Number(parts['minute']),
  };
}

export function isHoliday(instant: Date): boolean {
  const moment = localMoment(instant);
  const table = HOLIDAYS[moment.year];
  if (!table) throw new UnknownYear(moment.year);
  return table.includes(moment.isoDate);
}

export function isWorkingDay(instant: Date, hours: BusinessHours = DEFAULT_HOURS): boolean {
  const moment = localMoment(instant);
  return hours.workingDays.includes(moment.weekday) && !isHoliday(instant);
}

export function isOpen(instant: Date, hours: BusinessHours = DEFAULT_HOURS): boolean {
  if (!isWorkingDay(instant, hours)) return false;
  const { minuteOfDay } = localMoment(instant);
  return minuteOfDay >= hours.openMinute && minuteOfDay < hours.closeMinute;
}

/* ── Working-time arithmetic ────────────────────────────────────────────── */

const MINUTE = 60_000;

/**
 * Steps forward to the next moment the company is open.
 *
 * Walks in whole minutes to the next opening rather than trying to compute
 * it: the day-by-day version has to handle a holiday falling on a Monday,
 * three in a row around Eid, and a summer-time transition inside the gap.
 * Minute steps are obviously correct and bounded by `maxDays`.
 */
export function nextOpening(from: Date, hours: BusinessHours = DEFAULT_HOURS, maxDays = 30): Date {
  let cursor = from;
  const limit = from.getTime() + maxDays * 86_400_000;

  while (cursor.getTime() <= limit) {
    if (isOpen(cursor, hours)) return cursor;

    const moment = localMoment(cursor);
    /* Jump to this day's opening if it is still ahead, otherwise to the start
       of the next day — a whole-day skip rather than 1,440 single steps. */
    const minutesToSkip =
      isWorkingDay(cursor, hours) && moment.minuteOfDay < hours.openMinute
        ? hours.openMinute - moment.minuteOfDay
        : 24 * 60 - moment.minuteOfDay;

    cursor = new Date(cursor.getTime() + Math.max(1, minutesToSkip) * MINUTE);
  }

  throw new Error(`no opening found within ${String(maxDays)} days of ${from.toISOString()}`);
}

/**
 * Adds working minutes, skipping everything the company is closed for.
 *
 * This is what turns "four business hours" into a wall-clock deadline. A
 * ticket arriving at 17:00 on a Friday before a Monday holiday gets a
 * Tuesday-morning deadline, which is the promise that was actually made.
 */
export function addWorkingMinutes(
  from: Date,
  minutes: number,
  hours: BusinessHours = DEFAULT_HOURS,
): Date {
  if (minutes <= 0) return from;

  let cursor = isOpen(from, hours) ? from : nextOpening(from, hours);
  let remaining = minutes;

  while (remaining > 0) {
    const moment = localMoment(cursor);
    const minutesLeftToday = hours.closeMinute - moment.minuteOfDay;

    if (remaining <= minutesLeftToday) {
      return new Date(cursor.getTime() + remaining * MINUTE);
    }

    remaining -= minutesLeftToday;
    /* To closing, then on to the next opening — which may be tomorrow, Monday,
       or the day after a three-day Eid. */
    cursor = nextOpening(new Date(cursor.getTime() + minutesLeftToday * MINUTE), hours);
  }

  return cursor;
}

/**
 * How many working minutes lie between two instants.
 *
 * Used for reporting rather than for deadlines: "this took six business
 * hours" is the number an agent recognises, where "nineteen hours" includes
 * a night they were asleep.
 */
export function workingMinutesBetween(
  from: Date,
  to: Date,
  hours: BusinessHours = DEFAULT_HOURS,
): number {
  if (to <= from) return 0;

  let cursor = from;
  let total = 0;

  while (cursor < to) {
    if (!isOpen(cursor, hours)) {
      const next = nextOpening(cursor, hours);
      if (next >= to) break;
      cursor = next;
      continue;
    }

    const moment = localMoment(cursor);
    const endOfDay = new Date(cursor.getTime() + (hours.closeMinute - moment.minuteOfDay) * MINUTE);
    const segmentEnd = endOfDay < to ? endOfDay : to;
    total += Math.round((segmentEnd.getTime() - cursor.getTime()) / MINUTE);
    cursor = segmentEnd;
  }

  return total;
}
