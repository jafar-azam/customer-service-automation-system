import type { TicketStatus } from '@csas/shared';
import type { Types } from 'mongoose';
import type { Logger } from 'pino';
import { Attachment, Ticket } from '../db/models/index.js';
import { record as recordAudit } from '../services/audit.js';
import { candidates, choose, shouldPageNow } from '../services/sla/rota.js';
import { effectiveDeadline } from '../services/sla/policy.js';
import type { MessagingProvider } from '../services/providers/messaging.js';
import type { StorageProvider } from '../services/providers/storage.js';

/**
 * The sweeps that make the timers mean something.
 *
 * A deadline nobody checks is a field in a document. These two jobs are what
 * turn `sla.firstResponseDueAt` into a warning, an escalation and a report.
 *
 * Both are written to be **safe to run twice**. A queue redelivers on a
 * crash, two instances can briefly overlap during a deploy, and an operator
 * will run one by hand. So every write is guarded by the absence of the mark
 * it sets — `warningSentAt`, `breachedAt`, `deletedAt` — in the *query*, not
 * in a prior read.
 */

export interface SweepResult {
  readonly warned: number;
  readonly breached: number;
  readonly paged: number;
}

interface DueTicket {
  _id: Types.ObjectId;
  reference: string;
  priority: string;
  status: string;
  assignedStaffId?: Types.ObjectId;
  sla: {
    firstResponseDueAt?: Date;
    firstResponseWarnAt?: Date;
    firstRespondedAt?: Date;
    pausedMs: number;
    breachedAt?: Date;
    warningSentAt?: Date;
  };
}

const OPEN_STATUSES: readonly TicketStatus[] = [
  'open',
  'assistant_answering',
  'in_progress',
  'escalated',
  'reopened',
];

/**
 * Warns, escalates and assigns.
 *
 * Deliberately one pass rather than three jobs. The three decisions are made
 * from the same row at the same instant, and splitting them would let a
 * ticket be warned by one job after another had already breached it.
 */
export async function sweepSla(
  logger: Logger,
  messaging: MessagingProvider,
  now: Date = new Date(),
): Promise<SweepResult> {
  const open = await Ticket.find({
    status: { $in: [...OPEN_STATUSES] },
    'sla.firstResponseDueAt': { $exists: true },
    'sla.firstRespondedAt': { $exists: false },
  })
    .select('reference priority status assignedStaffId sla')
    .limit(500)
    .lean<DueTicket[]>()
    .exec();

  let warned = 0;
  let breached = 0;
  let paged = 0;

  for (const ticket of open) {
    const dueAt = ticket.sla.firstResponseDueAt;
    if (!dueAt) continue;

    /* Paused time is added back here rather than rewritten into the stored
       deadline, so the stored value keeps answering "what did we promise when
       this opened" — which is what a report about the promise needs. */
    const deadline = effectiveDeadline(dueAt, ticket.sla.pausedMs);

    if (now >= deadline) {
      if (ticket.sla.breachedAt !== undefined) continue;

      /* The guard is in the query, not in the read above: two overlapping
         sweeps produce one escalation, not two. */
      const updated = await Ticket.findOneAndUpdate(
        { _id: ticket._id, 'sla.breachedAt': { $exists: false } },
        {
          $set: { 'sla.breachedAt': now, status: 'escalated' },
          $push: {
            statusHistory: {
              status: 'escalated',
              at: now,
              note: 'automatic: first-response target missed',
            },
          },
        },
        { returnDocument: 'after' },
      )
        .lean<DueTicket>()
        .exec();

      if (!updated) continue;

      breached += 1;
      await recordAudit(logger, {
        action: 'ticket.escalated',
        actorType: 'system',
        targetType: 'ticket',
        targetId: ticket.reference,
        metadata: { reason: 'sla_breach', dueAt: dueAt.toISOString() },
      });

      if (shouldPageNow(ticket.priority, now)) {
        await page(ticket, messaging, logger);
        paged += 1;
      }
      continue;
    }

    const warnAt = ticket.sla.firstResponseWarnAt;
    if (warnAt && now >= effectiveDeadline(warnAt, ticket.sla.pausedMs)) {
      /* Same shape: the absence of the mark is part of the query, so a
         redelivered job cannot warn twice. */
      const updated = await Ticket.findOneAndUpdate(
        { _id: ticket._id, 'sla.warningSentAt': { $exists: false } },
        { $set: { 'sla.warningSentAt': now } },
      ).exec();

      if (updated) warned += 1;
    }
  }

  /* Assignment is a separate concern from the clock: an unowned ticket needs
     an owner whether or not it is near a deadline. */
  const assigned = await assignUnowned(logger);

  if (warned + breached + paged + assigned > 0) {
    logger.info({ warned, breached, paged, assigned }, 'sla sweep acted');
  }
  return { warned, breached, paged };
}

async function page(
  ticket: DueTicket,
  messaging: MessagingProvider,
  logger: Logger,
): Promise<void> {
  /* The reference, never the subject or the body: an escalation alert goes
     to a phone and must not carry customer text (PRIVACY.md §5). */
  await messaging.send({
    channel: 'whatsapp',
    kind: 'escalation',
    /* A documented placeholder. The real on-call number is operational
       configuration, not source, and a fake one here cannot page a stranger
       if this is ever run with a live provider by mistake. */
    to: '+96100000000',
    templateKey: 'escalation.breach',
    body: `C.S.A.S: ${ticket.reference} has missed its first-response target.`,
    /* Derived from the ticket, so a redelivered job cannot page twice. */
    idempotencyKey: `breach:${String(ticket._id)}`,
    ticketId: ticket._id,
  });
  logger.warn({ ticketReference: ticket.reference }, 'urgent breach paged out of hours');
}

/**
 * Gives every unowned open ticket an owner.
 *
 * `assignedStaffId` absent is the query, so a ticket assigned between the
 * read and the write is skipped rather than reassigned — which would take it
 * from whoever had just claimed it.
 */
export async function assignUnowned(logger: Logger): Promise<number> {
  const unowned = await Ticket.find({
    status: { $in: [...OPEN_STATUSES] },
    assignedStaffId: { $exists: false },
  })
    .select('_id reference')
    .limit(100)
    .lean<{ _id: Types.ObjectId; reference: string }[]>()
    .exec();

  if (unowned.length === 0) return 0;

  let count = 0;
  for (const ticket of unowned) {
    /* Recomputed per ticket: assigning ten tickets from one snapshot would
       give all ten to the same least-loaded agent. */
    const pick = choose(await candidates());
    if (!pick) break;

    const updated = await Ticket.findOneAndUpdate(
      { _id: ticket._id, assignedStaffId: { $exists: false } },
      { $set: { assignedStaffId: pick.staffId, assignedAt: new Date() } },
    ).exec();

    if (updated) {
      count += 1;
      await recordAudit(logger, {
        action: 'ticket.assigned',
        actorType: 'system',
        targetType: 'ticket',
        targetId: ticket.reference,
        metadata: { assignedTo: pick.staffId, strategy: 'least_load' },
      });
    }
  }
  return count;
}

/**
 * Deletes attachments whose retention window has closed.
 *
 * Step 12 wrote a `deleteAfter` on every attachment and left the sweep to
 * this step. The bytes go first and the record is marked afterwards: the
 * other order would mark a file deleted that is still on disk, and nothing
 * would ever come back for it.
 */
export async function sweepRetention(
  logger: Logger,
  storage: StorageProvider,
  now: Date = new Date(),
): Promise<number> {
  const due = await Attachment.find({
    deletedAt: { $exists: false },
    deleteAfter: { $lte: now },
  })
    .select('_id storageKey')
    .limit(200)
    .lean<{ _id: Types.ObjectId; storageKey: string }[]>()
    .exec();

  let deleted = 0;
  for (const attachment of due) {
    try {
      await storage.delete(attachment.storageKey);
      await Attachment.findByIdAndUpdate(attachment._id, { $set: { deletedAt: now } }).exec();
      deleted += 1;

      await recordAudit(logger, {
        action: 'attachment.deleted',
        actorType: 'system',
        targetType: 'attachment',
        targetId: String(attachment._id),
        metadata: { reason: 'retention' },
      });
    } catch (error) {
      /* One unreadable file must not stop the sweep: the next run tries
         again, and the record stays undeleted so it is still visible. */
      logger.error(
        { err: error, attachmentId: String(attachment._id) },
        'retention delete failed; leaving the record for the next sweep',
      );
    }
  }

  if (deleted > 0) logger.info({ deleted }, 'retention sweep complete');
  return deleted;
}
