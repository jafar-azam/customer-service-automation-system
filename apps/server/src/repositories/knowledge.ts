import type { KbStatus } from '@csas/shared';
import type { Types } from 'mongoose';
import { KbEntry, type KbEntryRecord } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';
import { toObjectId, type Scope } from './scope.js';

/**
 * Reading and writing knowledge, with the visibility rule in the query.
 *
 * The rule a customer never sees is the important one: **only `approved`
 * entries exist as far as retrieval is concerned**. Step 15 filters on status
 * before similarity for that reason, and this layer is where the same
 * constraint is expressed for everything else that touches the collection.
 *
 * A customer scope reaching here at all is a programming error rather than an
 * authorization decision — there is no customer-facing knowledge endpoint, and
 * the assistant reads through `KnowledgeIndex`, not through this. It throws
 * rather than returning an empty list, because a silent empty result is how a
 * missing guard survives review.
 */

export interface KbEntryDocument extends KbEntryRecord {
  readonly _id: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fields no caller should receive. The vector is hundreds of floats of noise
    in a JSON response, and `select: false` on the schema already excludes it —
    this is the second lock, for the queries that ask for everything. */
const HIDDEN = '-embedding';

function assertStaff(scope: Scope): void {
  if (scope.kind === 'customer') {
    throw new ApiError(404, 'not_found', 'Not found');
  }
}

/**
 * Which statuses this scope may see.
 *
 * An agent sees everything except other people's unsubmitted drafts: a draft
 * is a half-written thought, and a queue full of them is how a review queue
 * stops being read. An admin sees everything, because an admin is who gets
 * asked why something was never approved.
 */
export function visibleStatusFilter(scope: Scope): Record<string, unknown> {
  if (scope.kind === 'staff' && scope.role === 'agent') {
    return {
      $or: [
        { status: { $ne: 'draft' } },
        { status: 'draft', createdByStaffId: toObjectId(scope.staffId) },
      ],
    };
  }
  return {};
}

export interface ListOptions {
  readonly status?: readonly KbStatus[];
  readonly language?: 'ar' | 'en';
  readonly search?: string;
  readonly limit?: number;
  readonly skip?: number;
}

export async function listEntries(
  scope: Scope,
  options: ListOptions = {},
): Promise<KbEntryDocument[]> {
  assertStaff(scope);

  const filter: Record<string, unknown> = { ...visibleStatusFilter(scope) };
  if (options.status !== undefined && options.status.length > 0) {
    filter['status'] = { $in: [...options.status] };
  }
  if (options.language !== undefined) filter['language'] = options.language;
  /* `$text`, never a regular expression built from the query. A regex from
     user input is both an injection and a denial-of-service surface, and the
     text index exists already (CLAUDE.md). */
  if (options.search !== undefined && options.search !== '') {
    filter['$text'] = { $search: options.search };
  }

  return KbEntry.find(filter)
    .select(HIDDEN)
    .sort({ updatedAt: -1 })
    .skip(options.skip ?? 0)
    .limit(Math.min(options.limit ?? 50, 200))
    .lean<KbEntryDocument[]>()
    .exec();
}

export async function countEntries(scope: Scope, options: ListOptions = {}): Promise<number> {
  assertStaff(scope);
  const filter: Record<string, unknown> = { ...visibleStatusFilter(scope) };
  if (options.status !== undefined && options.status.length > 0) {
    filter['status'] = { $in: [...options.status] };
  }
  if (options.language !== undefined) filter['language'] = options.language;
  if (options.search !== undefined && options.search !== '') {
    filter['$text'] = { $search: options.search };
  }
  return KbEntry.countDocuments(filter).exec();
}

/**
 * One entry, or a 404.
 *
 * The visibility filter is part of the query rather than a check on the
 * result, so an agent asking for another agent's draft gets the same answer as
 * for an id that does not exist.
 */
export async function findEntry(scope: Scope, id: string): Promise<KbEntryDocument> {
  assertStaff(scope);

  const entry = await KbEntry.findOne({ _id: toObjectId(id), ...visibleStatusFilter(scope) })
    .select(HIDDEN)
    .lean<KbEntryDocument>()
    .exec();

  if (!entry) throw new ApiError(404, 'not_found', 'Not found');
  return entry;
}

/**
 * Moves an entry from one status to another, atomically.
 *
 * The statuses it is allowed to move *from* are part of the filter, so two
 * admins approving the same entry at the same moment produce one approval and
 * one `null` — rather than two audit entries saying it was approved twice.
 * Returning `null` instead of throwing lets the caller say what the conflict
 * means, which differs between approve, reject and archive.
 */
export async function transitionEntry(
  id: string,
  from: readonly KbStatus[],
  update: Record<string, unknown>,
): Promise<KbEntryDocument | null> {
  return KbEntry.findOneAndUpdate({ _id: toObjectId(id), status: { $in: [...from] } }, update, {
    returnDocument: 'after',
  })
    .select(HIDDEN)
    .lean<KbEntryDocument>()
    .exec();
}
