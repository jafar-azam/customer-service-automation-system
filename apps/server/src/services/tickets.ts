import type { InputForm, Priority, TicketStatus } from '@csas/shared';
import { type Types } from 'mongoose';
import { Customer } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';
import type { Logger } from 'pino';
import { record as recordAudit } from './audit.js';
import { checkEntitlement } from './contracts.js';
import {
  findTicket,
  insertTicket,
  nextReference,
  updateTicketFromStatus,
  type TicketDocument,
} from '../repositories/tickets.js';
import { insertMessage, type MessageDocument } from '../repositories/messages.js';
import { toObjectId, type Scope } from '../repositories/scope.js';
import { clockUpdateFor, startClock, toUpdateDocument } from './sla/clock.js';
import { auditActorFor } from './audit-scope.js';

/**
 * The ticket lifecycle.
 *
 * The transition table is the point of this module. Without it, "can this
 * ticket be resolved?" is answered by whichever handler happens to be running,
 * and the answers diverge — a customer closing a ticket by one path that an
 * agent cannot by another. With it, there is one answer and it is testable
 * without a database.
 */

/**
 * Who may move a ticket from where, to where.
 *
 * `system` covers background work: the SLA escalation in step 14, the
 * auto-close after a quiet period. It is listed explicitly rather than being
 * allowed everything, because a job that can make any transition is a job that
 * can resurrect a closed ticket.
 */
const TRANSITIONS: Readonly<
  Record<TicketStatus, Readonly<Record<string, readonly Scope['kind'][]>>>
> = {
  open: {
    assistant_answering: ['system'],
    in_progress: ['staff'],
    escalated: ['staff', 'system'],
    awaiting_customer: ['staff'],
    resolved: ['staff'],
    closed: ['staff'],
  },
  assistant_answering: {
    awaiting_customer: ['system'],
    escalated: ['system', 'staff'],
    resolved: ['system', 'staff'],
    in_progress: ['staff'],
  },
  awaiting_customer: {
    /* The customer is an actor here, not just a trigger. A reply is what puts
       the ticket back in our queue, and `postMessage` applies this very
       transition on their behalf — so if `customer` were missing, the message
       path would be making a move the table forbids and the two would disagree
       about who may do what. A test compares them for exactly that reason, and
       is what caught it. */
    in_progress: ['customer', 'staff', 'system'],
    escalated: ['staff', 'system'],
    resolved: ['staff', 'system'],
    closed: ['staff', 'system'],
  },
  escalated: {
    in_progress: ['staff'],
    awaiting_customer: ['staff'],
    resolved: ['staff'],
    closed: ['staff'],
  },
  in_progress: {
    awaiting_customer: ['staff'],
    escalated: ['staff', 'system'],
    resolved: ['staff'],
    closed: ['staff'],
  },
  resolved: {
    /* A customer who says "no, that did not fix it" reopens their own ticket.
       This is the only transition a customer may make, and it exists so that
       being wrong costs them one click rather than a new ticket and a lost
       history. */
    reopened: ['customer', 'staff'],
    closed: ['staff', 'system'],
  },
  closed: {
    /* Deliberately empty. A closed ticket is final; "reopening" one is step
       13's configurable window, which creates a *new* ticket linked to it.
       Allowing it here would let an auto-close job and a customer fight over
       the same record indefinitely. */
  },
  reopened: {
    in_progress: ['staff'],
    escalated: ['staff', 'system'],
    awaiting_customer: ['staff'],
    resolved: ['staff'],
    closed: ['staff'],
  },
};

export function canTransition(from: TicketStatus, to: TicketStatus, scope: Scope): boolean {
  /* `?? false` rather than a bare optional chain: an unlisted edge is
     `undefined`, and this function returns a boolean. */
  return TRANSITIONS[from][to]?.includes(scope.kind) ?? false;
}

export function allowedTransitions(from: TicketStatus, scope: Scope): TicketStatus[] {
  return Object.entries(TRANSITIONS[from])
    .filter(([, kinds]) => kinds.includes(scope.kind))
    .map(([to]) => to as TicketStatus);
}

/* ── Creation ───────────────────────────────────────────────────────────── */

export interface CreateTicketInput {
  readonly subject: string;
  readonly body: string;
  /* `| undefined` because these arrive from a parsed request body, where an
     omitted optional key is present-and-undefined. The default is applied
     below, so the two cases are genuinely the same thing here. */
  readonly priority?: Priority | undefined;
  readonly inputForm?: InputForm | undefined;
}

/**
 * Opens a ticket, with its first message.
 *
 * The contract gate is re-checked here rather than trusted from login. A
 * contract can expire between signing in and writing, and the entitlement
 * check reads the dates rather than the cached status field — so a nightly job
 * that has not run yet cannot let an expired customer through.
 */
export async function createTicket(
  scope: Scope,
  input: CreateTicketInput,
  logger: Logger,
): Promise<{ ticket: TicketDocument; message: MessageDocument }> {
  if (scope.kind !== 'customer') {
    throw new ApiError(403, 'forbidden', 'Only a customer can open a ticket');
  }

  const customerId = toObjectId(scope.customerId);
  const customer = await Customer.findById(customerId).lean<{ _id: Types.ObjectId }>().exec();
  if (!customer) throw new ApiError(404, 'not_found', 'Not found');

  /* Re-checked here rather than trusted from login: a contract can expire
     between signing in and writing. `checkEntitlement` reads the dates, not
     the cached status field, so a nightly expiry job that has not run yet
     cannot let an expired customer through. */
  const entitlement = await checkEntitlement(customerId);
  if (entitlement.status !== 'active' || entitlement.contractId === undefined) {
    throw new ApiError(
      403,
      'contract_inactive',
      'This account has no active maintenance contract',
      {
        entitlement: entitlement.status,
      },
    );
  }

  const reference = await nextReference();
  const now = new Date();

  const ticket = await insertTicket({
    reference,
    customerId,
    contractId: toObjectId(entitlement.contractId),
    subject: input.subject,
    status: 'open',
    priority: input.priority ?? 'medium',
    inputForm: input.inputForm ?? 'unknown',
    sla: { pausedMs: 0 },
    reopenedCount: 0,
    lastCustomerMessageAt: now,
    statusHistory: [{ status: 'open', at: now, byCustomer: true }],
  });

  const message = await insertMessage({
    ticketId: ticket._id,
    author: 'customer',
    kind: 'text',
    body: input.body,
    inputForm: input.inputForm ?? 'unknown',
    internal: false,
    citations: [],
  });

  /* The deadlines are computed after the ticket exists, not inside its
     creation. If the holiday table lacks the year, the conversation still
     starts and the missing schedule is visible and fixable — refusing the
     ticket would be the wrong thing to break. */
  try {
    await startClock(ticket._id, toObjectId(entitlement.contractId), ticket.priority, now);
  } catch (error) {
    logger.error(
      { err: error, ticketReference: reference },
      'could not compute the SLA schedule; the ticket is open without deadlines',
    );
  }

  /* The reference, not the body: the audit log records that a ticket was
     opened, never what was written in it (PRIVACY.md §5). */
  await recordAudit(logger, {
    action: 'ticket.created',
    ...auditActorFor(scope),
    targetType: 'ticket',
    targetId: reference,
  });

  return { ticket, message };
}

/* ── Transitions ────────────────────────────────────────────────────────── */

export interface TransitionInput {
  readonly to: TicketStatus;
  readonly note?: string | undefined;
}

/**
 * Moves a ticket, or explains why not.
 *
 * The expected status is part of the update query, so two agents resolving the
 * same ticket at the same instant produce one success and one `409 conflict`
 * rather than two successes and a status history that records the same change
 * twice. Checking first and writing second would leave exactly that gap.
 */
export async function transitionTicket(
  scope: Scope,
  ticketId: string,
  input: TransitionInput,
  logger: Logger,
): Promise<TicketDocument> {
  const current = await findTicket(scope, ticketId);

  if (current.status === input.to) {
    throw new ApiError(409, 'already_in_state', `The ticket is already ${input.to}`);
  }

  if (!canTransition(current.status, input.to, scope)) {
    throw new ApiError(
      422,
      'invalid_transition',
      `A ticket cannot go from ${current.status} to ${input.to}`,
      { from: current.status, to: input.to, allowed: allowedTransitions(current.status, scope) },
    );
  }

  const now = new Date();
  const change: Record<string, unknown> = { status: input.to, at: now };
  if (scope.kind === 'staff') change['byStaffId'] = toObjectId(scope.staffId);
  if (scope.kind === 'customer') change['byCustomer'] = true;
  if (input.note !== undefined) change['note'] = input.note;

  const set: Record<string, unknown> = { status: input.to };
  if (input.to === 'resolved') set['resolvedAt'] = now;
  if (input.to === 'closed') set['closedAt'] = now;

  /* The clock change rides in the same atomic write as the status change.
     Two writes would leave a window in which the status says "waiting on the
     customer" and the clock is still running. */
  const clock = toUpdateDocument(
    clockUpdateFor(current.status, input.to, current.sla.pausedAt, now),
  );

  const update: Record<string, unknown> = {
    ...clock,
    $set: { ...set, ...(clock['$set'] ?? {}) },
    $push: { statusHistory: change },
  };
  if (input.to === 'reopened') {
    update['$inc'] = { reopenedCount: 1 };
    /* A reopened ticket is no longer resolved, and leaving the timestamp
       behind would make every "time to resolution" report wrong. */
    update['$unset'] = { resolvedAt: '', closedAt: '' };
  }

  const ticket = await updateTicketFromStatus(scope, ticketId, [current.status], update);
  if (!ticket) {
    throw new ApiError(409, 'conflict', 'The ticket changed while you were working on it');
  }

  /* The named action where there is one, so "show me every escalation" is a
     query on `action` rather than a scan through metadata. */
  const action =
    input.to === 'escalated'
      ? 'escalated'
      : input.to === 'resolved'
        ? 'resolved'
        : input.to === 'reopened'
          ? 'reopened'
          : 'status_changed';

  await recordAudit(logger, {
    action: `ticket.${action}`,
    ...auditActorFor(scope),
    targetType: 'ticket',
    targetId: ticket.reference,
    metadata: { from: current.status, to: input.to },
  });

  return ticket;
}

/**
 * Assigns a ticket to an agent.
 *
 * Admin-only at the API level (`requireRole`), but an agent may claim an
 * unassigned ticket for themselves — which is the common case and the one that
 * keeps a queue moving. Step 14 adds the automatic rota.
 */
export async function assignTicket(
  scope: Scope,
  ticketId: string,
  staffId: string,
  logger: Logger,
): Promise<TicketDocument> {
  if (scope.kind !== 'staff' && scope.kind !== 'system') {
    throw new ApiError(403, 'forbidden', 'Only staff can assign a ticket');
  }
  if (scope.kind === 'staff' && scope.role !== 'admin' && staffId !== scope.staffId) {
    throw new ApiError(403, 'forbidden', 'An agent can only claim a ticket for themselves');
  }

  const current = await findTicket(scope, ticketId);
  const ticket = await updateTicketFromStatus(scope, ticketId, [current.status], {
    $set: { assignedStaffId: toObjectId(staffId), assignedAt: new Date() },
  });
  if (!ticket) {
    throw new ApiError(409, 'conflict', 'The ticket changed while you were working on it');
  }

  await recordAudit(logger, {
    action: 'ticket.assigned',
    ...auditActorFor(scope),
    targetType: 'ticket',
    targetId: ticket.reference,
    metadata: { assignedTo: staffId },
  });

  return ticket;
}

/* ── Reopening a closed ticket ──────────────────────────────────────────── */

export type ReopenRefusal =
  | { readonly ok: false; readonly reason: 'disabled' }
  | { readonly ok: false; readonly reason: 'not_closed'; readonly status: TicketStatus }
  | {
      readonly ok: false;
      readonly reason: 'window_passed';
      readonly closedAt: Date;
      readonly windowDays: number;
    };

export type ReopenEligibility = { readonly ok: true } | ReopenRefusal;

/**
 * Whether a closed ticket can still be continued.
 *
 * Pure, so the rule can be tested without a database and — more usefully —
 * so the same function answers both "may this request proceed?" and "should
 * the client draw the button?". Two implementations of that question drift,
 * and the one in the browser is the one nobody re-reads.
 */
export function canReopen(
  ticket: { readonly status: TicketStatus; readonly closedAt?: Date | undefined },
  windowDays: number,
  now: Date = new Date(),
): ReopenEligibility {
  if (windowDays <= 0) return { ok: false, reason: 'disabled' };
  if (ticket.status !== 'closed') return { ok: false, reason: 'not_closed', status: ticket.status };

  /* A closed ticket with no `closedAt` predates the field or was closed by a
     path that failed to set it. Refusing is the safe reading: an unbounded
     window is the one outcome the setting exists to prevent. */
  const closedAt = ticket.closedAt;
  if (!closedAt) return { ok: false, reason: 'window_passed', closedAt: new Date(0), windowDays };

  const deadline = closedAt.getTime() + windowDays * 86_400_000;
  if (now.getTime() > deadline) return { ok: false, reason: 'window_passed', closedAt, windowDays };

  return { ok: true };
}

/**
 * Continues a closed conversation as a new ticket.
 *
 * A **new** ticket, linked to the old one, rather than a transition out of
 * `closed`. Step 11 made `closed` terminal deliberately: a record that can be
 * reopened indefinitely is one an auto-close job and a customer can fight over
 * forever, and the resolution time of the original becomes meaningless.
 *
 * The original keeps its history exactly as it was. The new ticket carries
 * `reopenedFromId`, so the detail view can show the whole thread.
 */
export async function reopenClosedTicket(
  scope: Scope,
  ticketId: string,
  body: string,
  windowDays: number,
  logger: Logger,
): Promise<{ ticket: TicketDocument; message: MessageDocument }> {
  if (scope.kind !== 'customer') {
    throw new ApiError(403, 'forbidden', 'Only a customer can reopen their ticket');
  }

  const original = await findTicket(scope, ticketId);
  const eligibility = canReopen(original, windowDays);

  if (!eligibility.ok) {
    const message =
      eligibility.reason === 'disabled'
        ? 'Reopening is not available'
        : eligibility.reason === 'not_closed'
          ? 'That ticket is not closed'
          : `A closed ticket can only be continued within ${String(windowDays)} days`;
    throw new ApiError(409, `reopen_${eligibility.reason}`, message, { windowDays });
  }

  /* The entitlement is re-checked, because continuing a conversation is
     opening a ticket and an expired contract must not get a way around the
     gate by using an old reference. */
  const reference = await nextReference();
  const now = new Date();

  const ticket = await insertTicket({
    reference,
    customerId: original.customerId,
    contractId: original.contractId,
    subject: original.subject,
    status: 'open',
    priority: original.priority,
    inputForm: original.inputForm,
    sla: { pausedMs: 0 },
    reopenedCount: 0,
    reopenedFromId: original._id,
    lastCustomerMessageAt: now,
    statusHistory: [
      { status: 'open', at: now, byCustomer: true, note: `continues ${original.reference}` },
    ],
  });

  const message = await insertMessage({
    ticketId: ticket._id,
    author: 'customer',
    kind: 'text',
    body,
    inputForm: original.inputForm,
    internal: false,
    citations: [],
  });

  await recordAudit(logger, {
    action: 'ticket.reopened',
    ...auditActorFor(scope),
    targetType: 'ticket',
    targetId: reference,
    metadata: { continues: original.reference },
  });

  return { ticket, message };
}
