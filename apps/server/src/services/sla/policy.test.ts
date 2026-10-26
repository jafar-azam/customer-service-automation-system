import { PRIORITIES, type ContractTier, type Priority } from '@csas/shared';
import { describe, expect, it } from 'vitest';
import { localMoment } from './calendar.js';
import {
  effectiveDeadline,
  isBreached,
  scheduleFor,
  targetFor,
  WARNING_FRACTION,
} from './policy.js';
import { choose, shouldPageNow, type Candidate } from './rota.js';
import { clockUpdateFor, isPaused, toUpdateDocument } from './clock.js';

const TIERS: readonly ContractTier[] = ['basic', 'standard', 'premium'];

describe('the SLA matrix', () => {
  /* Two dimensions because one of either is wrong: priority alone ignores
     what the customer pays for, tier alone lets a premium cosmetic question
     outrank a basic customer's outage. */
  it('gets faster as the tier rises, for every priority', () => {
    for (const priority of PRIORITIES) {
      const basic = targetFor('basic', priority).firstResponseMinutes;
      const standard = targetFor('standard', priority).firstResponseMinutes;
      const premium = targetFor('premium', priority).firstResponseMinutes;
      expect(standard, priority).toBeLessThanOrEqual(basic);
      expect(premium, priority).toBeLessThanOrEqual(standard);
    }
  });

  it('gets faster as the priority rises, for every tier', () => {
    for (const tier of TIERS) {
      const ordered = PRIORITIES.map((p) => targetFor(tier, p).firstResponseMinutes);
      for (let index = 1; index < ordered.length; index += 1) {
        expect(ordered[index], `${tier} ${String(PRIORITIES[index])}`).toBeLessThanOrEqual(
          ordered[index - 1] ?? 0,
        );
      }
    }
  });

  it('never promises a resolution sooner than a first response', () => {
    for (const tier of TIERS) {
      for (const priority of PRIORITIES) {
        const target = targetFor(tier, priority);
        expect(target.resolutionMinutes, `${tier}/${priority}`).toBeGreaterThanOrEqual(
          target.firstResponseMinutes,
        );
      }
    }
  });
});

describe('the schedule', () => {
  /* Wednesday 09:00 Beirut. */
  const opened = new Date('2026-07-15T06:00:00Z');

  it('counts in working time, not wall-clock', () => {
    /* premium/urgent is 30 working minutes. */
    const schedule = scheduleFor(opened, 'premium', 'urgent');
    expect(localMoment(schedule.firstResponseDueAt).minuteOfDay).toBe(9 * 60 + 30);
  });

  /* A warning at 100% is a breach notification wearing a different name. */
  it('warns before the deadline, with budget left to act in', () => {
    const schedule = scheduleFor(opened, 'standard', 'high');
    expect(schedule.firstResponseWarnAt.getTime()).toBeLessThan(
      schedule.firstResponseDueAt.getTime(),
    );
    expect(WARNING_FRACTION).toBeLessThan(1);
  });

  it('pushes a deadline past a weekend rather than through it', () => {
    /* Friday 16:00 Beirut, basic/high is four working hours. */
    const friday = new Date('2026-07-17T13:00:00Z');
    const schedule = scheduleFor(friday, 'basic', 'high');
    expect(localMoment(schedule.firstResponseDueAt).isoDate).toBe('2026-07-20');
  });
});

describe('pausing', () => {
  const dueAt = new Date('2026-07-15T12:00:00Z');

  /* The SLA is a promise about our response, not theirs. Without this a
     customer who takes three days to answer causes a breach we are reported
     for, and the measurement stops meaning anything. */
  it('adds the paused time back before judging a breach', () => {
    const justAfter = new Date(dueAt.getTime() + 60_000);
    expect(isBreached(dueAt, 0, justAfter)).toBe(true);
    expect(isBreached(dueAt, 10 * 60_000, justAfter)).toBe(false);
  });

  it('reports the effective deadline', () => {
    expect(effectiveDeadline(dueAt, 3_600_000).getTime()).toBe(dueAt.getTime() + 3_600_000);
  });

  it('stops the clock only while the ball is with the customer', () => {
    expect(isPaused('awaiting_customer')).toBe(true);
    expect(isPaused('in_progress')).toBe(false);
    expect(isPaused('escalated')).toBe(false);
  });
});

describe('the clock update', () => {
  const now = new Date('2026-07-15T12:00:00Z');
  const pausedAt = new Date('2026-07-15T11:00:00Z');

  it('marks the moment a pause starts', () => {
    const update = toUpdateDocument(
      clockUpdateFor('in_progress', 'awaiting_customer', undefined, now),
    );
    expect(update).toEqual({ $set: { 'sla.pausedAt': now } });
  });

  /* `$inc` rather than a computed total: two resumes racing would each write
     a total derived from the same stale value. */
  it('accumulates the elapsed pause with $inc, and clears the marker', () => {
    const update = toUpdateDocument(
      clockUpdateFor('awaiting_customer', 'in_progress', pausedAt, now),
    );
    expect(update).toEqual({
      $unset: { 'sla.pausedAt': '' },
      $inc: { 'sla.pausedMs': 3_600_000 },
    });
  });

  it('does nothing when the pause state is unchanged', () => {
    expect(toUpdateDocument(clockUpdateFor('open', 'in_progress', undefined, now))).toEqual({});
  });

  /* A resume with no recorded start must not write a nonsense increment. */
  it('survives a missing pausedAt', () => {
    const update = toUpdateDocument(
      clockUpdateFor('awaiting_customer', 'resolved', undefined, now),
    );
    expect(update['$inc']).toBeUndefined();
    expect(update['$unset']).toEqual({ 'sla.pausedAt': '' });
  });
});

describe('the rota', () => {
  const agent = (staffId: string, openTickets: number, lastAssignedAt?: Date): Candidate => ({
    staffId,
    openTickets,
    lastAssignedAt,
  });

  /* The thing that goes wrong in support is one person drowning while
     another is idle, which is what least-load is for. */
  it('gives the next ticket to the least loaded agent', () => {
    const pick = choose([agent('a', 9), agent('b', 2), agent('c', 5)]);
    expect(pick?.staffId).toBe('b');
  });

  it('breaks a tie by who was assigned least recently', () => {
    const pick = choose([
      agent('a', 3, new Date('2026-07-15T10:00:00Z')),
      agent('b', 3, new Date('2026-07-15T08:00:00Z')),
    ]);
    expect(pick?.staffId).toBe('b');
  });

  /* A new agent should get work before someone who has had some — which is
     also how a rota recovers after someone returns from holiday. */
  it('prefers an agent who has never been assigned', () => {
    const pick = choose([agent('a', 0, new Date('2026-07-15T10:00:00Z')), agent('b', 0)]);
    expect(pick?.staffId).toBe('b');
  });

  it('round-robin ignores load entirely', () => {
    const pick = choose(
      [
        agent('a', 0, new Date('2026-07-15T10:00:00Z')),
        agent('b', 50, new Date('2026-07-15T08:00:00Z')),
      ],
      'round_robin',
    );
    expect(pick?.staffId).toBe('b');
  });

  it('returns nothing when there is nobody', () => {
    expect(choose([])).toBeUndefined();
  });
});

describe('paging', () => {
  const duringHours = new Date('2026-07-15T06:00:00Z'); // Wed 09:00
  const night = new Date('2026-07-15T23:00:00Z'); // Thu 02:00

  /* Paging for a low priority ticket at 02:00 is how an on-call rota stops
     being answered. */
  it('only wakes anyone out of hours, and only for urgent work', () => {
    expect(shouldPageNow('urgent', night)).toBe(true);
    expect(shouldPageNow('high', night)).toBe(false);
    expect(shouldPageNow('low', night)).toBe(false);
  });

  it('never pages during business hours — the queue is being watched', () => {
    for (const priority of PRIORITIES as readonly Priority[]) {
      expect(shouldPageNow(priority, duringHours), priority).toBe(false);
    }
  });
});
