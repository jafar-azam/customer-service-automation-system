import type { AuditInput } from './audit.js';
import type { Scope } from '../repositories/scope.js';

/**
 * Turns a repository scope into the actor fields the audit log wants.
 *
 * One function rather than a conditional at each call site, because the
 * mistake it prevents is subtle: putting a customer's id in `actorStaffId`
 * produces an entry that reads as a staff action and resolves, via the
 * collection it points at, to whichever staff member happens to share that
 * object id's shape. An audit log that attributes an action to the wrong
 * person is worse than one that is missing the entry.
 */
export function auditActorFor(
  scope: Scope,
): Pick<AuditInput, 'actorType' | 'actorStaffId' | 'actorCustomerId'> {
  switch (scope.kind) {
    case 'staff':
      return { actorType: 'staff', actorStaffId: scope.staffId };
    case 'customer':
      return { actorType: 'customer', actorCustomerId: scope.customerId };
    case 'system':
      return { actorType: 'system' };
  }
}
