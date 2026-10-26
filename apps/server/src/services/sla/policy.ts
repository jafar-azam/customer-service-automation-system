import type { ContractTier, Priority } from '@csas/shared';
import { addWorkingMinutes, DEFAULT_HOURS, type BusinessHours } from './calendar.js';

/**
 * What we promise, by how urgent it is and what the customer pays for.
 *
 * Two dimensions, because a single table of either one is wrong. Priority
 * alone ignores that a premium customer bought a faster answer; tier alone
 * means a premium customer's cosmetic question outranks a basic customer's
 * outage.
 *
 * Expressed in **working minutes**, not wall-clock: see `calendar.ts`. Four
 * hours means four hours in which someone could have answered.
 */

export interface SlaTarget {
  /** Time to the first human or assistant reply the customer can see. */
  readonly firstResponseMinutes: number;
  /** Time to a resolution. */
  readonly resolutionMinutes: number;
}

const HOUR = 60;
const DAY = 8 * HOUR; // one business day

/**
 * The matrix.
 *
 * `urgent` is deliberately not eight times faster than `low` — it is as fast
 * as a person can realistically be told and respond, and the rest of the
 * difference shows up in the rota's paging rules rather than in a number
 * nobody can meet.
 */
const TARGETS: Readonly<Record<ContractTier, Readonly<Record<Priority, SlaTarget>>>> = {
  basic: {
    low: { firstResponseMinutes: 2 * DAY, resolutionMinutes: 10 * DAY },
    medium: { firstResponseMinutes: 1 * DAY, resolutionMinutes: 5 * DAY },
    high: { firstResponseMinutes: 4 * HOUR, resolutionMinutes: 3 * DAY },
    urgent: { firstResponseMinutes: 2 * HOUR, resolutionMinutes: 1 * DAY },
  },
  standard: {
    low: { firstResponseMinutes: 1 * DAY, resolutionMinutes: 5 * DAY },
    medium: { firstResponseMinutes: 4 * HOUR, resolutionMinutes: 3 * DAY },
    high: { firstResponseMinutes: 2 * HOUR, resolutionMinutes: 1 * DAY },
    urgent: { firstResponseMinutes: 1 * HOUR, resolutionMinutes: 4 * HOUR },
  },
  premium: {
    low: { firstResponseMinutes: 4 * HOUR, resolutionMinutes: 3 * DAY },
    medium: { firstResponseMinutes: 2 * HOUR, resolutionMinutes: 1 * DAY },
    high: { firstResponseMinutes: 1 * HOUR, resolutionMinutes: 6 * HOUR },
    urgent: { firstResponseMinutes: 30, resolutionMinutes: 4 * HOUR },
  },
};

export function targetFor(tier: ContractTier, priority: Priority): SlaTarget {
  return TARGETS[tier][priority];
}

/**
 * Warn before the deadline, not at it.
 *
 * At 75% there is still a quarter of the budget left to act in. A warning
 * that fires at 100% is a breach notification wearing a different name.
 */
export const WARNING_FRACTION = 0.75;

export interface SlaSchedule {
  readonly firstResponseDueAt: Date;
  readonly resolutionDueAt: Date;
  readonly firstResponseWarnAt: Date;
}

export function scheduleFor(
  openedAt: Date,
  tier: ContractTier,
  priority: Priority,
  hours: BusinessHours = DEFAULT_HOURS,
): SlaSchedule {
  const target = targetFor(tier, priority);
  return {
    firstResponseDueAt: addWorkingMinutes(openedAt, target.firstResponseMinutes, hours),
    resolutionDueAt: addWorkingMinutes(openedAt, target.resolutionMinutes, hours),
    firstResponseWarnAt: addWorkingMinutes(
      openedAt,
      Math.round(target.firstResponseMinutes * WARNING_FRACTION),
      hours,
    ),
  };
}

/**
 * Whether a deadline has passed, allowing for time the clock was paused.
 *
 * `pausedMs` accumulates while the ticket waits on the customer. The SLA is a
 * promise about our response, not about theirs — without this, a customer who
 * takes three days to answer a question causes a breach we are reported for.
 */
export function isBreached(dueAt: Date, pausedMs: number, now: Date = new Date()): boolean {
  return now.getTime() > dueAt.getTime() + pausedMs;
}

/** The effective deadline once paused time is added back. */
export function effectiveDeadline(dueAt: Date, pausedMs: number): Date {
  return new Date(dueAt.getTime() + pausedMs);
}
