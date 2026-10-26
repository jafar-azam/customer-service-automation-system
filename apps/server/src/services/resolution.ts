import type { Logger } from 'pino';
import { Escalation, Resolution, SatisfactionRating, Ticket } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';
import { insertMessage, type MessageDocument } from '../repositories/messages.js';
import { toObjectId, type Scope } from '../repositories/scope.js';
import {
  findTicket,
  updateTicketFromStatus,
  type TicketDocument,
} from '../repositories/tickets.js';
import { record as recordAudit } from './audit.js';
import { auditActorFor } from './audit-scope.js';
import { arabicFromInputForm, arabicFromText } from './reply-language.js';
import { candidates, choose } from './sla/rota.js';
import type { MessagingProvider } from './providers/messaging.js';

/**
 * Closing the loop: did that actually fix it?
 *
 * The question matters more than it looks. Without it the only signal about
 * whether the assistant is any good is the absence of complaints, which is not
 * a measurement — and step 21 has nothing to evaluate against except its own
 * confidence scores, which is circular.
 *
 * So a customer is asked, and **"no" is a first-class answer**: it reopens the
 * conversation and escalates to a human rather than leaving them to start
 * again from the beginning.
 */

/**
 * Whether there is anything to confirm yet.
 *
 * Exported and used in two places — the `GET /:id` response, so the client
 * knows whether to draw the prompt, and `confirmResolution` below, which is
 * the actual gate. Same function in both, following `canReopen`: a client that
 * re-derives the rule is a second copy of it, and the browser's copy is the one
 * nobody re-reads.
 */
export type ConfirmEligibility =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not_answered'; readonly status: string }
  | { readonly ok: false; readonly reason: 'already_confirmed' };

/* The states in which an answer has actually been offered. Asking "did that
   work?" about a ticket nobody has answered is noise, and `closed` is terminal
   — a customer who wants to say more there reopens it. */
const ANSWERED: readonly string[] = ['awaiting_customer', 'resolved', 'assistant_answering'];

export function canConfirm(
  ticket: { readonly status: string },
  alreadyConfirmed = false,
): ConfirmEligibility {
  if (!ANSWERED.includes(ticket.status)) {
    return { ok: false, reason: 'not_answered', status: ticket.status };
  }
  if (alreadyConfirmed) return { ok: false, reason: 'already_confirmed' };
  return { ok: true };
}

export interface ConfirmInput {
  readonly solved: boolean;
  readonly score?: number | undefined;
  readonly comment?: string | undefined;
}

export interface ConfirmResult {
  readonly ticket: TicketDocument;
  readonly message: MessageDocument;
  readonly escalated: boolean;
}

/** What the customer sees when they say it did not work. */
const REJECTED = {
  ar: 'شكرًا لإعلامنا. أحلت الطلب إلى أحد المختصين وسيتواصل معك.',
  en: 'Thank you for telling us. I have passed this to a specialist, who will reply to you.',
} as const;

const THANKS = {
  ar: 'سعيد لأن المشكلة حُلّت. شكرًا على وقتك.',
  en: 'Glad that solved it. Thank you for your time.',
} as const;

/**
 * The reply language for this ticket.
 *
 * The customer's own words first — `reply-language.ts` explains why, and the
 * live run that made it necessary. `subject` is what they typed when they
 * opened the ticket and is the one piece of their text already in hand here,
 * so it costs no query; `inputForm` is the fallback for a ticket opened
 * through a channel that has no subject.
 */
function inArabic(ticket: TicketDocument): boolean {
  return arabicFromText(ticket.subject) || arabicFromInputForm(ticket.inputForm);
}

/**
 * Records the customer's answer, and acts on it.
 *
 * Only the customer may confirm. An agent marking their own work as confirmed
 * is the one thing that would make every satisfaction number meaningless —
 * and it is exactly the shortcut a busy queue invites.
 */
export async function confirmResolution(
  scope: Scope,
  ticketId: string,
  input: ConfirmInput,
  deps: { readonly logger: Logger; readonly messaging: MessagingProvider },
): Promise<ConfirmResult> {
  if (scope.kind !== 'customer') {
    throw new ApiError(403, 'forbidden', 'Only the customer can confirm a resolution');
  }

  const ticket = await findTicket(scope, ticketId);

  const eligible = canConfirm(ticket);
  if (!eligible.ok) {
    throw new ApiError(409, 'not_answerable', 'There is nothing to confirm on this ticket yet', {
      status: ticket.status,
    });
  }

  const now = new Date();

  if (input.solved) {
    await Resolution.findOneAndUpdate(
      { ticketId: ticket._id },
      {
        $set: { confirmedByCustomer: true, confirmedAt: now },
        $setOnInsert: {
          ticketId: ticket._id,
          title: ticket.subject,
          body: 'Confirmed by the customer.',
          /* Attributed to whoever actually answered. `firstRespondedAt` is
             set only by a staff reply, so its absence means the assistant
             got there first — which is the number step 21 reports on. */
          resolvedBy: ticket.sla.firstRespondedAt === undefined ? 'assistant' : 'agent',
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec();

    const message = await insertMessage({
      ticketId: ticket._id,
      author: 'system',
      kind: 'text',
      body: inArabic(ticket) ? THANKS.ar : THANKS.en,
      inputForm: ticket.inputForm,
      internal: false,
      citations: [],
    });

    const updated = await close(ticket, 'resolved', now, 'customer confirmed the resolution');

    await recordAudit(deps.logger, {
      action: 'ticket.resolved',
      ...auditActorFor(scope),
      targetType: 'ticket',
      targetId: ticket.reference,
      metadata: { confirmedByCustomer: true },
    });

    if (input.score !== undefined) {
      await rateTicket(scope, ticketId, input.score, input.comment, deps.logger);
    }

    return { ticket: updated ?? ticket, message, escalated: false };
  }

  /* "No" is a first-class answer: it escalates rather than leaving the
     customer to start again from the beginning. */
  const escalation = await escalate(ticket, 'customer_rejected_answer', now, deps);

  const message = await insertMessage({
    ticketId: ticket._id,
    author: 'system',
    kind: 'text',
    body: inArabic(ticket) ? REJECTED.ar : REJECTED.en,
    inputForm: ticket.inputForm,
    internal: false,
    citations: [],
  });

  const updated = await close(ticket, 'escalated', now, 'customer said it did not help');

  /* The score is recorded even on rejection, and it is the more useful half
     of the data: a 1 attached to a rejected answer is exactly what step 21
     needs to find where the assistant is wrong. */
  if (input.score !== undefined) {
    await rateTicket(scope, ticketId, input.score, input.comment, deps.logger);
  }

  return { ticket: updated ?? ticket, message, escalated: escalation !== undefined };
}

/* ── Rating ─────────────────────────────────────────────────────────────── */

export async function rateTicket(
  scope: Scope,
  ticketId: string,
  score: number,
  comment: string | undefined,
  logger: Logger,
): Promise<void> {
  if (scope.kind !== 'customer') {
    throw new ApiError(403, 'forbidden', 'Only the customer can rate a ticket');
  }

  const ticket = await findTicket(scope, ticketId);

  /* One rating per ticket, and a second submission replaces the first —
     someone changing their mind is a correction, not a second opinion, and
     the unique index would reject an insert anyway. */
  await SatisfactionRating.findOneAndUpdate(
    { ticketId: ticket._id },
    {
      $set: {
        score,
        ...(comment === undefined ? {} : { comment }),
        resolvedBy: ticket.sla.firstRespondedAt === undefined ? 'assistant' : 'agent',
      },
      $setOnInsert: { ticketId: ticket._id, customerId: ticket.customerId },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).exec();

  logger.debug({ ticketReference: ticket.reference, score }, 'ticket rated');
}

/* ── Escalation to a person ─────────────────────────────────────────────── */

export type EscalationReason =
  | 'no_confident_answer'
  | 'customer_rejected_answer'
  | 'customer_requested_human'
  | 'sla_breach'
  | 'ai_unavailable';

/**
 * Hands a ticket to a named person and tells them.
 *
 * Assigning without notifying produces a queue nobody is watching; notifying
 * without assigning produces a message everybody assumes someone else took.
 * Both, or neither.
 *
 * The notification carries the **reference and a link**, never the subject or
 * the conversation. It goes to a phone, often to a lock screen, and a customer's
 * words have no business there (PRIVACY.md §5).
 */
export async function escalate(
  ticket: TicketDocument,
  reason: EscalationReason,
  at: Date,
  deps: { readonly logger: Logger; readonly messaging: MessagingProvider },
  confidence?: number,
): Promise<string | undefined> {
  const pick = choose(await candidates());

  const escalation = await Escalation.create({
    ticketId: ticket._id,
    reason,
    ...(confidence === undefined ? {} : { confidence }),
    ...(pick ? { toStaffId: toObjectId(pick.staffId) } : {}),
  });

  if (!pick) {
    /* Nobody to tell. The escalation is still recorded, because the ticket is
       escalated whether or not anyone was available — and a gap in the rota
       is a thing an operator needs to see rather than a silent no-op. */
    deps.logger.warn(
      { ticketReference: ticket.reference, reason },
      'escalated with no agent available to notify',
    );
    return undefined;
  }

  await Ticket.findByIdAndUpdate(ticket._id, {
    $set: { assignedStaffId: toObjectId(pick.staffId), assignedAt: at },
  }).exec();

  await deps.messaging.send({
    channel: 'whatsapp',
    kind: 'escalation',
    /* A documented placeholder until step 29 stores staff contact details.
       A fake number cannot page a stranger if this ever runs with a live
       provider by mistake. */
    to: '+96100000000',
    templateKey: 'escalation.assigned',
    body: `C.S.A.S: ${ticket.reference} needs you (${reason.replace(/_/g, ' ')}). /staff/tickets/${String(ticket._id)}`,
    /* Derived from the escalation, so a redelivered job notifies once. */
    idempotencyKey: `escalation:${String(escalation._id)}`,
    staffId: pick.staffId,
    ticketId: ticket._id,
  });

  await Escalation.findByIdAndUpdate(escalation._id, { $set: { notifiedAt: at } }).exec();

  await recordAudit(deps.logger, {
    action: 'ticket.escalated',
    actorType: 'system',
    targetType: 'ticket',
    targetId: ticket.reference,
    metadata: { reason, assignedTo: pick.staffId },
  });

  return String(escalation._id);
}

async function close(
  ticket: TicketDocument,
  to: 'resolved' | 'escalated',
  at: Date,
  note: string,
): Promise<TicketDocument | null> {
  /* Guarded by the status it was read in, so a race with an agent working the
     same ticket loses rather than overwrites. */
  return updateTicketFromStatus(
    { kind: 'system', reason: 'resolution' },
    String(ticket._id),
    [ticket.status],
    { $set: { status: to }, $push: { statusHistory: { status: to, at, note } } },
  );
}
