import type { Types } from 'mongoose';
import { StaffUser, Ticket } from '../../db/models/index.js';
import { isOpen, type BusinessHours } from './calendar.js';

/**
 * Who picks up the next ticket.
 *
 * Two strategies, and the choice between them is not cosmetic.
 *
 * **Round-robin** is fair over time and blind to the present: it will hand a
 * tenth ticket to someone already holding nine.
 *
 * **Least-load** is responsive and can starve one agent of variety, but it is
 * the right default for support, where the thing that goes wrong is one
 * person drowning while another is idle.
 *
 * Ties are broken by who was assigned least recently, which recovers the
 * fairness round-robin is for without its blindness.
 */

export type RotaStrategy = 'least_load' | 'round_robin';

export interface Candidate {
  readonly staffId: string;
  readonly openTickets: number;
  readonly lastAssignedAt: Date | undefined;
}

/**
 * Picks from a list, purely.
 *
 * Separated from the database so the rule can be tested exhaustively without
 * one — and so "why did it pick her?" is answerable by reading twenty lines.
 */
export function choose(
  candidates: readonly Candidate[],
  strategy: RotaStrategy = 'least_load',
): Candidate | undefined {
  if (candidates.length === 0) return undefined;

  const byLastAssigned = (a: Candidate, b: Candidate) => {
    /* Never assigned sorts first: a new agent should get work before someone
       who has had some, which is also how a rota recovers after a holiday. */
    const left = a.lastAssignedAt?.getTime() ?? 0;
    const right = b.lastAssignedAt?.getTime() ?? 0;
    return left - right;
  };

  if (strategy === 'round_robin') {
    return [...candidates].sort(byLastAssigned)[0];
  }

  return [...candidates].sort((a, b) => {
    const load = a.openTickets - b.openTickets;
    return load !== 0 ? load : byLastAssigned(a, b);
  })[0];
}

/**
 * The agents available to take work.
 *
 * Only `active` agents: a disabled account must never appear in a rota, and
 * filtering in the query rather than afterwards means a future caller cannot
 * forget.
 */
export async function candidates(): Promise<Candidate[]> {
  const agents = await StaffUser.find({ status: 'active', role: { $in: ['agent', 'admin'] } })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>()
    .exec();

  if (agents.length === 0) return [];

  /* One aggregate rather than a query per agent: a rota that costs N round
     trips is a rota that gets called less often than it should be. */
  const loads = await Ticket.aggregate<{ _id: Types.ObjectId; open: number; last: Date }>([
    {
      $match: {
        assignedStaffId: { $in: agents.map((agent) => agent._id) },
        status: { $nin: ['resolved', 'closed'] },
      },
    },
    { $group: { _id: '$assignedStaffId', open: { $sum: 1 }, last: { $max: '$assignedAt' } } },
  ]);

  const byId = new Map(loads.map((row) => [String(row._id), row]));

  return agents.map((agent) => {
    const row = byId.get(String(agent._id));
    return {
      staffId: String(agent._id),
      openTickets: row?.open ?? 0,
      lastAssignedAt: row?.last ?? undefined,
    };
  });
}

/**
 * Whether an urgent ticket should page someone now.
 *
 * Outside business hours only urgent work wakes anybody. Paging for a low
 * priority ticket at 02:00 is how an on-call rota stops being answered.
 */
export function shouldPageNow(priority: string, instant: Date, hours?: BusinessHours): boolean {
  if (isOpen(instant, hours)) return false;
  return priority === 'urgent';
}
