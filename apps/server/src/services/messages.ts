import type { InputForm, TicketStatus } from '@csas/shared';
import type { Logger } from 'pino';
import { ApiError } from '../http/errors.js';
import { insertMessage, type MessageDocument } from '../repositories/messages.js';
import { findTicket, updateTicket, type TicketDocument } from '../repositories/tickets.js';
import { toObjectId, type Scope } from '../repositories/scope.js';

/**
 * Posting to a conversation.
 *
 * A message is never *only* a message: it moves the ticket. A customer reply
 * to a ticket that was waiting on them puts it back in the queue; an agent
 * reply stops the first-response clock. Doing that here, in one place, is what
 * stops the SLA from depending on which endpoint someone happened to use.
 */

/** A closed ticket is a finished record. Step 13 adds the reopen window. */
const CLOSED_TO_NEW_MESSAGES: readonly TicketStatus[] = ['closed'];

export interface PostMessageInput {
  readonly body: string;
  /* See the note on `CreateTicketInput`. */
  readonly inputForm?: InputForm | undefined;
  /** Staff only. A note the customer never sees. */
  readonly internal?: boolean | undefined;
}

export interface PostedMessage {
  readonly message: MessageDocument;
  readonly ticket: TicketDocument;
}

/**
 * Where a ticket goes when someone writes to it.
 *
 * Returned rather than applied so it can be tested without a database, and so
 * the one case that must *not* move — an internal note — is visible as a rule
 * rather than as an early return buried in the write path. A note is staff
 * talking to each other; it is not a reply, and treating it as one would stop
 * the response clock on work nobody has actually answered.
 */
export function statusAfterMessage(
  current: TicketStatus,
  scope: Scope,
  internal: boolean,
): TicketStatus | null {
  if (internal) return null;

  if (scope.kind === 'customer') {
    /* The customer has answered; it is ours again. */
    if (current === 'awaiting_customer') return 'in_progress';
    if (current === 'resolved') return 'reopened';
    return null;
  }

  if (scope.kind === 'staff') {
    /* An agent has replied, so the ball is with the customer. `escalated`
       deliberately does not move: an escalation is resolved by a decision,
       not by the first person to type into it. */
    if (current === 'open' || current === 'in_progress' || current === 'reopened') {
      return 'awaiting_customer';
    }
    return null;
  }

  return null;
}

export async function postMessage(
  scope: Scope,
  ticketId: string,
  input: PostMessageInput,
  logger: Logger,
): Promise<PostedMessage> {
  const ticket = await findTicket(scope, ticketId);

  if (CLOSED_TO_NEW_MESSAGES.includes(ticket.status)) {
    throw new ApiError(409, 'ticket_closed', 'This ticket is closed');
  }

  const internal = input.internal === true;
  if (internal && scope.kind === 'customer') {
    /* Not a silent downgrade to a public message. A customer who sends
       `internal: true` is either probing or using a broken client, and
       quietly publishing what they thought was private is the worse failure
       of the two. */
    throw new ApiError(403, 'forbidden', 'Only staff can write an internal note');
  }

  const author =
    scope.kind === 'customer' ? 'customer' : scope.kind === 'staff' ? 'agent' : 'system';

  const message = await insertMessage({
    ticketId: ticket._id,
    author,
    ...(scope.kind === 'staff' ? { authorStaffId: toObjectId(scope.staffId) } : {}),
    kind: 'text',
    body: input.body,
    inputForm: input.inputForm ?? 'unknown',
    internal,
    citations: [],
  });

  const now = new Date();
  const set: Record<string, unknown> = {};
  const nextStatus = statusAfterMessage(ticket.status, scope, internal);

  if (scope.kind === 'customer' && !internal) set['lastCustomerMessageAt'] = now;

  /* The first-response clock stops at the first *public* staff reply. Marked
     only once — a later edit of this field would quietly extend every SLA
     report backwards. */
  if (scope.kind === 'staff' && !internal && ticket.sla.firstRespondedAt === undefined) {
    set['sla.firstRespondedAt'] = now;
  }

  const update: Record<string, unknown> = {};
  if (nextStatus) {
    set['status'] = nextStatus;
    if (nextStatus === 'reopened') {
      update['$inc'] = { reopenedCount: 1 };
      update['$unset'] = { resolvedAt: '' };
    }
    update['$push'] = {
      statusHistory: {
        status: nextStatus,
        at: now,
        ...(scope.kind === 'staff' ? { byStaffId: toObjectId(scope.staffId) } : {}),
        ...(scope.kind === 'customer' ? { byCustomer: true } : {}),
        note: 'automatic: a message was posted',
      },
    };
  }

  if (Object.keys(set).length > 0) update['$set'] = set;

  const updated =
    Object.keys(update).length > 0 ? await updateTicket(scope, ticketId, update) : ticket;

  /* Deliberately no audit entry for an ordinary message. The audit log records
     decisions and access to personal data; one row per chat line would bury
     those in noise, and the conversation is itself the record. Step 12 audits
     attachment access, which is the part that is genuinely sensitive. */
  logger.debug({ ticketReference: ticket.reference, author, internal }, 'message posted');

  return { message, ticket: updated };
}
