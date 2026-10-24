import type { Types } from 'mongoose';
import { Message, type MessageRecord } from '../db/models/index.js';
import { canSeeInternalNotes, toObjectId, type Scope } from './scope.js';
import { findTicket } from './tickets.js';

/**
 * Messages, reachable only through their ticket.
 *
 * There is no `findMessage(id)`. Every read starts by resolving the ticket
 * under the caller's scope, so the ownership check happens once, in a place
 * that cannot be skipped, rather than being re-derived from a message's
 * `ticketId` at each call site.
 */

export interface MessageDocument extends MessageRecord {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

/**
 * The conversation, oldest first.
 *
 * Internal notes are excluded for customers **in the query**, not filtered out
 * of the result afterwards. A post-filter leaves the note in memory, in the
 * log of a slow query, and in whatever a future `.map()` forgets to exclude —
 * and it is one `return` away from being sent.
 */
export async function listMessages(
  scope: Scope,
  ticketId: string,
  options: { readonly limit?: number; readonly after?: Date } = {},
): Promise<MessageDocument[]> {
  /* Throws 404 if this scope may not see the ticket. */
  const ticket = await findTicket(scope, ticketId);

  const filter: Record<string, unknown> = { ticketId: ticket._id };
  if (!canSeeInternalNotes(scope)) filter['internal'] = false;
  if (options.after) filter['createdAt'] = { $gt: options.after };

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  return Message.find(filter).sort({ createdAt: 1 }).limit(limit).lean<MessageDocument[]>().exec();
}

export async function insertMessage(record: MessageRecord): Promise<MessageDocument> {
  const created = await Message.create(record);
  return created.toObject<MessageDocument>();
}

export async function countMessages(ticketId: Types.ObjectId): Promise<number> {
  return Message.countDocuments({ ticketId }).exec();
}

/**
 * What a customer is allowed to receive over the wire.
 *
 * The socket broadcasts one event to a room containing both staff and the
 * customer, so the *same* message object reaches both. This decides what each
 * side sees, and returning `null` for an internal note is what stops a note
 * being pushed to the customer's browser — the HTTP filter above would not
 * have helped, because nothing was requested.
 */
export function visibleTo(scope: Scope, message: MessageDocument): MessageDocument | null {
  if (message.internal && !canSeeInternalNotes(scope)) return null;
  return message;
}

export { toObjectId };
