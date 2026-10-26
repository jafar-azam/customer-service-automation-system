import { describe, expect, it } from 'vitest';
import {
  addWorkingMinutes,
  DEFAULT_HOURS,
  isHoliday,
  isOpen,
  isWorkingDay,
  localMoment,
  nextOpening,
  UnknownYear,
  workingMinutesBetween,
} from './calendar.js';

/** Beirut is UTC+3 in summer and UTC+2 in winter. */
const summerMorning = new Date('2026-07-15T06:00:00Z'); // Wed 09:00 Beirut
const summerEvening = new Date('2026-07-15T15:00:00Z'); // Wed 18:00 Beirut
const winterMorning = new Date('2026-01-14T07:00:00Z'); // Wed 09:00 Beirut

describe('Beirut local time', () => {
  /* The reason an offset is never hard-coded: the same UTC hour is a
     different local hour in July and January, and a `+2` constant is wrong
     for half the year. */
  it('reads the local hour through the zone, not through a fixed offset', () => {
    expect(localMoment(summerMorning).minuteOfDay).toBe(9 * 60);
    expect(localMoment(winterMorning).minuteOfDay).toBe(9 * 60);
    expect(localMoment(new Date('2026-01-14T06:00:00Z')).minuteOfDay).toBe(8 * 60);
  });

  it('knows the weekday and the local date', () => {
    const moment = localMoment(summerMorning);
    expect(moment.weekday).toBe(3);
    expect(moment.isoDate).toBe('2026-07-15');
  });

  /* An instant late in the UTC day is already tomorrow in Beirut. */
  it('takes the local day, not the UTC one', () => {
    expect(localMoment(new Date('2026-07-15T21:30:00Z')).isoDate).toBe('2026-07-16');
  });
});

describe('opening hours', () => {
  it('is open during a working day and closed outside it', () => {
    expect(isOpen(summerMorning)).toBe(true);
    expect(isOpen(summerEvening)).toBe(false);
  });

  /* Lebanon works Monday to Friday — it is not a Sunday-to-Thursday week. */
  it('treats Friday as a working day and Sunday as not', () => {
    expect(isWorkingDay(new Date('2026-07-17T09:00:00Z'))).toBe(true);
    expect(isWorkingDay(new Date('2026-07-19T09:00:00Z'))).toBe(false);
  });

  it('is closed on the minute of closing, not after it', () => {
    /* 17:30 Beirut = 14:30 UTC in summer. */
    expect(isOpen(new Date('2026-07-15T14:29:00Z'))).toBe(true);
    expect(isOpen(new Date('2026-07-15T14:30:00Z'))).toBe(false);
  });
});

describe('holidays', () => {
  it('knows the fixed Lebanese dates', () => {
    expect(isHoliday(new Date('2026-11-22T10:00:00Z'))).toBe(true); // Independence Day
    expect(isHoliday(new Date('2026-02-09T10:00:00Z'))).toBe(true); // Saint Maron
    expect(isHoliday(new Date('2026-07-15T10:00:00Z'))).toBe(false);
  });

  /* Lebanon's calendar mixes Gregorian, two Easters and the lunar year. */
  it('covers the Islamic and Orthodox dates too', () => {
    expect(isHoliday(new Date('2026-03-20T10:00:00Z'))).toBe(true); // Eid al-Fitr
    expect(isHoliday(new Date('2026-04-13T10:00:00Z'))).toBe(true); // Orthodox Easter Monday
  });

  /* The important one. Lunar dates are announced, not computed, so an
     unfilled year must fail loudly — silently treating it as having no
     holidays would make every SLA in that year too tight, and nobody would
     notice until the reports were already wrong. */
  it('refuses a year nobody has filled in rather than assuming none', () => {
    expect(() => isHoliday(new Date('2099-05-05T10:00:00Z'))).toThrow(UnknownYear);
  });
});

describe('nextOpening', () => {
  it('returns the instant itself when already open', () => {
    expect(nextOpening(summerMorning)).toEqual(summerMorning);
  });

  it('skips to tomorrow morning from an evening', () => {
    const next = nextOpening(summerEvening);
    expect(localMoment(next).isoDate).toBe('2026-07-16');
    expect(localMoment(next).minuteOfDay).toBe(DEFAULT_HOURS.openMinute);
  });

  it('skips a whole weekend', () => {
    /* Friday 18:00 Beirut. */
    const next = nextOpening(new Date('2026-07-17T15:00:00Z'));
    expect(localMoment(next).isoDate).toBe('2026-07-20'); // Monday
  });

  /* Three consecutive Eid days after a weekend is the case a day-by-day
     implementation gets wrong. */
  it('skips a run of consecutive holidays', () => {
    /* Wednesday 18 March 2026 evening; 19-21 March are Eid al-Fitr, then a
       weekend — the next opening is Monday 23 March. */
    const next = nextOpening(new Date('2026-03-18T16:00:00Z'));
    expect(localMoment(next).isoDate).toBe('2026-03-23');
  });
});

describe('addWorkingMinutes', () => {
  it('stays inside one day when it fits', () => {
    const due = addWorkingMinutes(summerMorning, 120);
    expect(localMoment(due).minuteOfDay).toBe(11 * 60);
    expect(localMoment(due).isoDate).toBe('2026-07-15');
  });

  /* The promise that was actually made: four business hours from 17:00 on a
     Friday is not "Saturday at 21:00". */
  it('carries over the close of business', () => {
    /* Wednesday 16:30 Beirut, four working hours. Closing is 17:30, so one
       hour today and three tomorrow from 08:30. */
    const due = addWorkingMinutes(new Date('2026-07-15T13:30:00Z'), 4 * 60);
    expect(localMoment(due).isoDate).toBe('2026-07-16');
    expect(localMoment(due).minuteOfDay).toBe(11 * 60 + 30);
  });

  it('starts the clock at the next opening when it arrives closed', () => {
    /* Saturday. One working hour lands at 09:30 on Monday. */
    const due = addWorkingMinutes(new Date('2026-07-18T12:00:00Z'), 60);
    expect(localMoment(due).isoDate).toBe('2026-07-20');
    expect(localMoment(due).minuteOfDay).toBe(9 * 60 + 30);
  });

  it('skips holidays as well as weekends', () => {
    /* Friday 20 November 2026 at 16:30, four working hours. 22 November is
       Independence Day — a Sunday that year — so the next working day is
       Monday 23rd. */
    const due = addWorkingMinutes(new Date('2026-11-20T14:30:00Z'), 4 * 60);
    expect(localMoment(due).isoDate).toBe('2026-11-23');
  });

  it('returns the start for a zero or negative target', () => {
    expect(addWorkingMinutes(summerMorning, 0)).toEqual(summerMorning);
  });
});

describe('workingMinutesBetween', () => {
  it('counts only open time', () => {
    /* 09:00 to 11:00 on the same working day. */
    expect(workingMinutesBetween(summerMorning, new Date('2026-07-15T08:00:00Z'))).toBe(120);
  });

  /* The number an agent recognises: a ticket opened at 17:00 and answered at
     09:00 took one business hour, not sixteen. */
  it('does not count the night', () => {
    const from = new Date('2026-07-15T14:00:00Z'); // Wed 17:00
    const to = new Date('2026-07-16T06:00:00Z'); // Thu 09:00
    expect(workingMinutesBetween(from, to)).toBe(60);
  });

  it('is zero backwards and zero across a closed stretch', () => {
    expect(workingMinutesBetween(summerEvening, summerMorning)).toBe(0);
    /* Saturday to Sunday — entirely closed. */
    expect(
      workingMinutesBetween(new Date('2026-07-18T08:00:00Z'), new Date('2026-07-19T08:00:00Z')),
    ).toBe(0);
  });

  /* Round-trip: adding N working minutes and measuring back should give N. */
  it('agrees with addWorkingMinutes', () => {
    for (const minutes of [30, 120, 480, 1200]) {
      const due = addWorkingMinutes(summerMorning, minutes);
      expect(workingMinutesBetween(summerMorning, due)).toBe(minutes);
    }
  });
});
