import type { ContractTier, Priority, TicketStatus } from '@csas/shared';
import type { Types } from 'mongoose';
import { Contract, Ticket } from '../../db/models/index.js';
import { scheduleFor } from './policy.js';
import { DEFAULT_HOURS, type BusinessHours } from './calendar.js';

/**
 * Starting, pausing and resuming the SLA clock.
 *
 * The pause is the part worth reading. An SLA is a promise about *our*
 * response, so the clock must stop while the ticket is waiting on the
 * customer — otherwise someone who takes three days to answer a question
 * causes a breach we are measured on, and the measurement stops meaning
 * anything.
 *
 * Paused time is accumulated in `sla.pausedMs` and added back to the deadline
 * when it is checked, rather than the deadline being rewritten. The stored
 * due date therefore always answers "what did we promise when this opened",
 * which is what a report about the promise needs.
 */

/** The statuses in which the clock is stopped because the ball is theirs. */
const PAUSED_STATUSES: readonly TicketStatus[] = ['awaiting_customer'];

export function isPaused(status: TicketStatus): boolean {
  return PAUSED_STATUSES.includes(status);
}

/**
 * The fields to set when a ticket changes status, given where it was.
 *
 * Returned as an update fragment rather than applied, so the caller can fold
 * it into the single atomic write that also changes the status — two writes
 * would leave a window where the status and the clock disagree.
 */
export function clockUpdateFor(
  from: TicketStatus,
  to: TicketStatus,
  pausedAt: Date | undefined,
  now: Date = new Date(),
): { readonly set: Record<string, unknown>; readonly unset: Record<string, unknown> } {
  const wasPaused = isPaused(from);
  const willPause = isPaused(to);

  if (!wasPaused && willPause) {
    return { set: { 'sla.pausedAt': now }, unset: {} };
  }

  if (wasPaused && !willPause) {
    /* Accumulate what this pause cost and clear the marker. `$inc` rather
       than a computed total: two resumes racing would otherwise each write a
       total computed from the same stale value. */
    const elapsed = pausedAt ? Math.max(0, now.getTime() - pausedAt.getTime()) : 0;
    return { set: { __incPausedMs: elapsed }, unset: { 'sla.pausedAt': '' } };
  }

  return { set: {}, unset: {} };
}

/** Turns the fragment above into a Mongo update document. */
export function toUpdateDocument(fragment: {
  readonly set: Record<string, unknown>;
  readonly unset: Record<string, unknown>;
}): Record<string, unknown> {
  const set = { ...fragment.set };
  const increment = set['__incPausedMs'];
  delete set['__incPausedMs'];

  return {
    ...(Object.keys(set).length > 0 ? { $set: set } : {}),
    ...(Object.keys(fragment.unset).length > 0 ? { $unset: fragment.unset } : {}),
    ...(typeof increment === 'number' && increment > 0
      ? { $inc: { 'sla.pausedMs': increment } }
      : {}),
  };
}

/**
 * Computes and stores the deadlines for a newly opened ticket.
 *
 * Done after creation rather than inside it, so a ticket is never rejected
 * because the holiday table lacks next year — the conversation matters more
 * than the timer, and a missing schedule is visible and fixable.
 */
export async function startClock(
  ticketId: Types.ObjectId,
  contractId: Types.ObjectId,
  priority: Priority,
  openedAt: Date,
  hours: BusinessHours = DEFAULT_HOURS,
): Promise<void> {
  const contract = await Contract.findById(contractId)
    .select('tier')
    .lean<{ tier: ContractTier }>();
  const tier = contract?.tier ?? 'basic';

  const schedule = scheduleFor(openedAt, tier, priority, hours);

  await Ticket.findByIdAndUpdate(ticketId, {
    $set: {
      'sla.firstResponseDueAt': schedule.firstResponseDueAt,
      'sla.firstResponseWarnAt': schedule.firstResponseWarnAt,
      'sla.resolutionDueAt': schedule.resolutionDueAt,
    },
  }).exec();
}
