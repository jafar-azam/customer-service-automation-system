import type { StaffRole } from '@csas/shared';
import { Types } from 'mongoose';
import { ApiError } from '../http/errors.js';

/**
 * Who is asking — the parameter every repository function requires.
 *
 * `CLAUDE.md`: object-level authorization lives in the repository layer. The
 * reason is in the shape of this type rather than in any policy: there is no
 * repository function that reads a ticket *without* a scope, so a handler
 * cannot forget the check. It is not that the check is written in forty
 * places and remembered each time; it is that the query cannot be built
 * without it.
 *
 * `requireRole` in the HTTP layer answers a different question — may this role
 * call this endpoint at all. Both are needed. An agent is allowed to call
 * `GET /api/tickets/:id`; whether they may see *that* ticket is decided here.
 */

export type Scope =
  | { readonly kind: 'customer'; readonly customerId: string }
  | { readonly kind: 'staff'; readonly staffId: string; readonly role: StaffRole }
  /**
   * Background work: an SLA timer, a scheduled close, a seeding run. Named
   * rather than implied by a missing scope, so that "this query has no owner
   * constraint" is always a deliberate word in the source and greppable.
   */
  | { readonly kind: 'system'; readonly reason: string };

export function customerScope(customerId: string): Scope {
  return { kind: 'customer', customerId };
}

export function staffScope(staffId: string, role: StaffRole): Scope {
  return { kind: 'staff', staffId, role };
}

export function systemScope(reason: string): Scope {
  return { kind: 'system', reason };
}

/**
 * Parses an id, refusing anything that is not one.
 *
 * `new Types.ObjectId(value)` accepts any 12-character string and silently
 * reinterprets its bytes, so `'customer-123'` becomes a valid-looking id that
 * matches nothing. Worse, an object from a JSON body reaches Mongoose as a
 * query operator. Both are closed here rather than at each call site.
 */
export function toObjectId(value: unknown): Types.ObjectId {
  if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) {
    throw new ApiError(404, 'not_found', 'Not found');
  }
  return new Types.ObjectId(value);
}

/**
 * The ownership clause for a ticket query.
 *
 * A customer sees their own tickets and nothing else. Staff see all of them —
 * an agent who may only see tickets assigned to them cannot pick up unassigned
 * work, and the queue in step 14 hands work *out* rather than expecting people
 * to find it.
 *
 * **Not found, never forbidden.** A 403 on someone else's ticket confirms that
 * the ticket exists, which turns a sequential reference into an enumeration
 * oracle: `CSAS-000001` upwards tells an attacker exactly how many customers
 * there are and when each arrived. The caller gets the same 404 for a ticket
 * that does not exist and one they may not see.
 */
export function ticketOwnershipFilter(scope: Scope): Record<string, unknown> {
  switch (scope.kind) {
    case 'customer':
      return { customerId: toObjectId(scope.customerId) };
    case 'staff':
    case 'system':
      return {};
  }
}

/** Internal notes are invisible to customers. */
export function canSeeInternalNotes(scope: Scope): boolean {
  return scope.kind !== 'customer';
}

export function describeScope(scope: Scope): string {
  switch (scope.kind) {
    case 'customer':
      return `customer:${scope.customerId}`;
    case 'staff':
      return `staff:${scope.staffId}`;
    case 'system':
      return `system:${scope.reason}`;
  }
}
