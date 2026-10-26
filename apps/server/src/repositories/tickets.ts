import type { Priority, TicketStatus } from '@csas/shared';
import type { QueryFilter, Types } from 'mongoose';
import { Counter, Ticket, type TicketRecord } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';
import { ticketOwnershipFilter, toObjectId, type Scope } from './scope.js';

/**
 * Tickets, always through a scope.
 *
 * Every read here merges `ticketOwnershipFilter(scope)` into the query, so a
 * customer's filter carries their own id whatever else the caller asked for.
 * The ordering matters and is deliberate: the ownership clause is spread
 * **last**, so a caller-supplied `customerId` cannot override it. That is not
 * a theoretical concern — `{ ...ownership, ...filter }` is the same code with
 * the spread the other way round, and it is an account-takeover.
 */

export interface TicketDocument extends TicketRecord {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListOptions {
  readonly status?: readonly TicketStatus[];
  readonly priority?: readonly Priority[];
  readonly assignedToMe?: boolean;
  readonly limit?: number;
  /** Keyset pagination: the `createdAt` of the last row of the previous page. */
  readonly before?: Date;
  /** Inclusive date range on when the ticket was opened. */
  readonly openedAfter?: Date;
  readonly openedBefore?: Date;
  /** Matches the subject or the reference. Never the message bodies. */
  readonly search?: string;
}

/**
 * Escapes a user string for use inside a regular expression.
 *
 * `CLAUDE.md`: never build a query or a regular expression from raw input.
 * Without this, a search for `a{10000,}` is a denial of service and `.*` is a
 * table scan that ignores the index.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A page size a caller cannot turn into a full export by asking for 10,000. */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function listFilter(scope: Scope, options: ListOptions): QueryFilter<TicketRecord> {
  const filter: QueryFilter<TicketRecord> = {};

  if (options.status && options.status.length > 0) {
    filter.status = { $in: [...options.status] };
  }
  if (options.priority && options.priority.length > 0) {
    filter.priority = { $in: [...options.priority] };
  }
  /* One `createdAt` clause, built from up to three inputs. Assigning the key
     twice would silently drop the earlier constraint — a filtered list that
     quietly ignores the date range the customer chose. */
  const createdAt: Record<string, Date> = {};
  if (options.before) createdAt['$lt'] = options.before;
  if (options.openedBefore) {
    /* Inclusive: a person choosing 31 October means the whole of that day. */
    const endOfDay = new Date(options.openedBefore);
    endOfDay.setUTCHours(23, 59, 59, 999);
    createdAt['$lte'] = endOfDay;
  }
  if (options.openedAfter) createdAt['$gte'] = options.openedAfter;
  if (Object.keys(createdAt).length > 0) filter['createdAt'] = createdAt;

  if (options.search !== undefined && options.search.trim() !== '') {
    const pattern = new RegExp(escapeRegex(options.search.trim()), 'i');
    /* Subject and reference only. The message bodies are the richest personal
       data in the system, and a search that reaches them turns any staff
       account into a way to trawl customer conversations by keyword. */
    filter.$or = [{ subject: pattern }, { reference: pattern }];
  }

  /* "Assigned to me" is only meaningful for staff, and silently ignoring it
     for a customer would be a filter that does nothing — so it is scoped
     here rather than trusted from the query string. */
  if (options.assignedToMe === true && scope.kind === 'staff') {
    filter.assignedStaffId = toObjectId(scope.staffId);
  }

  /* Last, so it wins. See the note above. */
  return { ...filter, ...ticketOwnershipFilter(scope) };
}

export async function listTickets(
  scope: Scope,
  options: ListOptions = {},
): Promise<TicketDocument[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  return Ticket.find(listFilter(scope, options))
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<TicketDocument[]>()
    .exec();
}

export async function countTickets(scope: Scope, options: ListOptions = {}): Promise<number> {
  return Ticket.countDocuments(listFilter(scope, options)).exec();
}

/**
 * One ticket, or a 404.
 *
 * A caller who may not see it gets exactly what a caller asking for a
 * nonexistent id gets. Distinguishing them would confirm the ticket exists,
 * and references are sequential — which would turn `CSAS-000001` upwards into
 * a census of the customer base.
 */
export async function findTicket(scope: Scope, id: string): Promise<TicketDocument> {
  const ticket = await Ticket.findOne({
    _id: toObjectId(id),
    ...ticketOwnershipFilter(scope),
  })
    .lean<TicketDocument>()
    .exec();

  if (!ticket) throw new ApiError(404, 'not_found', 'Ticket not found');
  return ticket;
}

/** The same lookup by the reference a customer reads out on the phone. */
export async function findTicketByReference(
  scope: Scope,
  reference: string,
): Promise<TicketDocument> {
  const ticket = await Ticket.findOne({
    reference: reference.toUpperCase(),
    ...ticketOwnershipFilter(scope),
  })
    .lean<TicketDocument>()
    .exec();

  if (!ticket) throw new ApiError(404, 'not_found', 'Ticket not found');
  return ticket;
}

/**
 * Whether this scope may act on this ticket at all.
 *
 * Returns a boolean rather than throwing, because the Socket.IO join handler
 * needs to decide without an exception crossing a transport that has no
 * notion of a 404.
 */
export async function canAccessTicket(scope: Scope, id: string): Promise<boolean> {
  try {
    await findTicket(scope, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Allocates the next human-readable reference.
 *
 * Atomic in one document, which is the guarantee MongoDB gives without a
 * transaction. Six digits because a company running this will not reach a
 * million tickets, and a number a customer reads aloud should be short.
 */
export async function nextReference(): Promise<string> {
  const counter = await Counter.findByIdAndUpdate(
    'ticket',
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  )
    .lean<{ value: number }>()
    .exec();

  /* `upsert` with `returnDocument: 'after'` always returns a document, so
     there is no missing case to default. */
  return `CSAS-${String(counter.value).padStart(6, '0')}`;
}

export async function insertTicket(record: TicketRecord): Promise<TicketDocument> {
  const created = await Ticket.create(record);
  return created.toObject<TicketDocument>();
}

/**
 * Applies a change, under the same ownership clause as a read.
 *
 * Writing through `findOneAndUpdate` with the scope merged in means an
 * unauthorised write is a no-op that reports not-found, rather than a
 * successful write to someone else's record. A read-then-write would also be
 * a race: two agents resolving the same ticket at once.
 */
export async function updateTicket(
  scope: Scope,
  id: string,
  update: Record<string, unknown>,
): Promise<TicketDocument> {
  const ticket = await Ticket.findOneAndUpdate(
    { _id: toObjectId(id), ...ticketOwnershipFilter(scope) },
    update,
    { returnDocument: 'after', runValidators: true },
  )
    .lean<TicketDocument>()
    .exec();

  if (!ticket) throw new ApiError(404, 'not_found', 'Ticket not found');
  return ticket;
}

/**
 * The same, but only if the ticket is still in an expected state.
 *
 * The guard is part of the query, so two agents clicking "resolve" at the same
 * moment produce one success and one conflict rather than two successes and a
 * doubled status history.
 */
export async function updateTicketFromStatus(
  scope: Scope,
  id: string,
  expected: readonly TicketStatus[],
  update: Record<string, unknown>,
): Promise<TicketDocument | null> {
  return Ticket.findOneAndUpdate(
    { _id: toObjectId(id), status: { $in: [...expected] }, ...ticketOwnershipFilter(scope) },
    update,
    { returnDocument: 'after', runValidators: true },
  )
    .lean<TicketDocument>()
    .exec();
}
