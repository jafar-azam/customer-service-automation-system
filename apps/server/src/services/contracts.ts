import type { Types } from 'mongoose';
import type { ContractTier } from '@csas/shared';
import { Contract } from '../db/models/index.js';

/**
 * The maintenance-contract gate.
 *
 * This is the branch the reference sequence diagram makes second, right after
 * login: **contract active → describe the problem; otherwise → the Contact
 * page**. It is the one place the product says no to a real customer, so the
 * refusal has to be specific enough to act on. "Not entitled" is useless;
 * "expired on 19 September, here is how to renew" is not.
 *
 * Four distinguishable outcomes, because they need four different answers:
 *
 *   `active`     — carry on
 *   `expired`    — it ran out, and when
 *   `not_started`— it begins later, and when
 *   `none`       — no contract on file at all
 *
 * `expired` and `not_started` are separated deliberately. Telling someone with
 * a contract starting on Monday that they are "not covered" sends them to
 * support to argue about something nobody can fix.
 */

export type EntitlementStatus = 'active' | 'expired' | 'not_started' | 'none';

export interface Entitlement {
  readonly status: EntitlementStatus;
  readonly contractId?: string;
  readonly tier?: ContractTier;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

interface ContractRow {
  _id: Types.ObjectId;
  tier: ContractTier;
  status: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Decides from the **dates**, not from the stored status.
 *
 * `status` is maintained by a scheduled job (step 31) and is therefore a cache
 * of a fact that changes on its own at midnight. A contract that expired an
 * hour ago still reads `active` until the job runs; a gate that trusted the
 * field would let that customer in. The dates are the truth, and the field is
 * only used to exclude one that was explicitly cancelled.
 */
export async function checkEntitlement(
  customerId: Types.ObjectId | string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const contracts = await Contract.find({ customerId, status: { $ne: 'cancelled' } })
    .select('_id tier status startDate endDate')
    .sort({ endDate: -1 })
    .lean<ContractRow[]>();

  if (contracts.length === 0) return { status: 'none' };

  const active = contracts.find((contract) => contract.startDate <= now && contract.endDate >= now);
  if (active) {
    return {
      status: 'active',
      contractId: String(active._id),
      tier: active.tier,
      startDate: active.startDate,
      endDate: active.endDate,
    };
  }

  /* No live contract. A future one is better news than a past one, so it is
     reported in preference — the customer's next question is "when?", and the
     answer differs. */
  const upcoming = contracts
    .filter((contract) => contract.startDate > now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];

  if (upcoming) {
    return {
      status: 'not_started',
      contractId: String(upcoming._id),
      tier: upcoming.tier,
      startDate: upcoming.startDate,
      endDate: upcoming.endDate,
    };
  }

  /* Sorted by `endDate` descending, so the first is the most recent to lapse —
     the one worth naming. */
  const lapsed = contracts[0];
  return lapsed
    ? {
        status: 'expired',
        contractId: String(lapsed._id),
        tier: lapsed.tier,
        startDate: lapsed.startDate,
        endDate: lapsed.endDate,
      }
    : { status: 'none' };
}
