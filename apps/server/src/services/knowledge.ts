import type { KbStatus } from '@csas/shared';
import type { Logger } from 'pino';
import { KbEntry } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';
import { findEntry, transitionEntry, type KbEntryDocument } from '../repositories/knowledge.js';
import { toObjectId, type Scope } from '../repositories/scope.js';
import { record as recordAudit } from './audit.js';
import { auditActorFor } from './audit-scope.js';

/**
 * The approval workflow: the gate between "someone wrote this" and "the
 * assistant will say this to a customer".
 *
 * This is the step that makes step 15 defensible. Retrieval reads only
 * `approved` entries, so everything about whether the assistant can be trusted
 * reduces to who put an entry into that state and what they looked at first.
 *
 * Three properties:
 *
 * **Agents propose, admins approve.** An agent can write and edit a draft and
 * submit it; only an admin moves it to `approved`. The split is not about
 * seniority — it is that the approval is the security control (OWASP LLM04,
 * and indirect prompt injection through knowledge content), so it belongs to
 * the smallest group.
 *
 * **Machine output cannot be rubber-stamped.** An entry whose provenance is
 * `generated` must be edited by a human before it can be approved. Approving
 * the assistant's own words unchanged is precisely the loop that teaches it
 * its mistakes, and "an admin clicked approve" is not evidence that anybody
 * read it.
 *
 * **History is kept.** Every edit freezes the previous version, because a
 * citation from three months ago has to stay explicable after the entry has
 * been rewritten.
 */

/**
 * How many past versions an entry keeps.
 *
 * Unbounded history is a document that grows until it hits MongoDB's 16 MB
 * limit and then fails every write with an error that has nothing to do with
 * the edit being attempted. Fifty is far more than any entry has needed and
 * still leaves the document small; what falls off the end is reconstructible
 * from the audit log, which is append-only and never trimmed.
 */
export const VERSION_HISTORY = 50;

export interface EntryInput {
  readonly title: string;
  readonly body: string;
  readonly question?: string | undefined;
  readonly language: 'ar' | 'en';
  readonly category?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly changeNote?: string | undefined;
}

function requireAdmin(scope: Scope, action: string): void {
  if (scope.kind === 'system') return;
  if (scope.kind !== 'staff' || scope.role !== 'admin') {
    throw new ApiError(403, 'forbidden', `Only an admin can ${action}`);
  }
}

function requireStaff(scope: Scope): void {
  if (scope.kind !== 'staff') {
    throw new ApiError(403, 'forbidden', 'Only staff can edit knowledge');
  }
}

/* ── Writing ────────────────────────────────────────────────────────────── */

export async function createEntry(
  scope: Scope,
  input: EntryInput,
  logger: Logger,
): Promise<KbEntryDocument> {
  requireStaff(scope);
  const staffId = scope.kind === 'staff' ? toObjectId(scope.staffId) : undefined;

  const created = await KbEntry.create({
    title: input.title,
    body: input.body,
    ...(input.question === undefined ? {} : { question: input.question }),
    language: input.language,
    ...(input.category === undefined ? {} : { category: input.category }),
    tags: [...(input.tags ?? [])],
    /* Never `approved` on creation, whoever is asking. Writing and approving
       in one call would make the gate a formality that a future caller could
       skip without noticing it existed. */
    status: 'draft',
    version: 1,
    versions: [],
    ...(staffId === undefined ? {} : { createdByStaffId: staffId }),
    provenance: {
      source: 'agent_authored',
      license: 'CC-BY-4.0',
      publishable: true,
      piiRedaction: 'not_required',
    },
    usageCount: 0,
    unhelpfulCount: 0,
  });

  await recordAudit(logger, {
    action: 'kb.created',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    targetId: String(created._id),
    metadata: { language: input.language },
  });

  return findEntry(scope, String(created._id));
}

/**
 * Edits an entry, freezing what it said before.
 *
 * **An approved entry drops back to `pending_review` when its text changes.**
 * That is the whole point of the gate: an approved entry that can be silently
 * rewritten is an unapproved entry with an approval stamp on it, and it is the
 * obvious way to get arbitrary text in front of customers without review.
 *
 * Metadata-only edits — tags, category — do not demote, because nothing the
 * customer sees changes and treating them as substantive would train people to
 * re-approve for a typo in a tag.
 */
export async function updateEntry(
  scope: Scope,
  id: string,
  input: EntryInput,
  logger: Logger,
): Promise<KbEntryDocument> {
  requireStaff(scope);
  const current = await findEntry(scope, id);

  if (current.status === 'archived') {
    throw new ApiError(409, 'archived', 'Restore this entry before editing it');
  }

  const textChanged =
    current.title !== input.title ||
    current.body !== input.body ||
    (current.question ?? '') !== (input.question ?? '');

  const demoted = textChanged && current.status === 'approved';
  const nextStatus: KbStatus = demoted ? 'pending_review' : current.status;

  /* Built in one expression rather than assembled by mutation. The first
     version assigned `$inc` and `$push` onto a `Record<string, unknown>` with
     casts to satisfy the compiler, which is the shape of code that silently
     writes a key Mongoose then ignores — exactly the `errorCode`/`error` bug
     from step 16. */
  const frozen = {
    version: current.version,
    title: current.title,
    body: current.body,
    status: current.status,
    ...(scope.kind === 'staff' ? { editedByStaffId: toObjectId(scope.staffId) } : {}),
    editedAt: new Date(),
    ...(input.changeNote === undefined ? {} : { changeNote: input.changeNote }),
  };

  const update = {
    $set: {
      title: input.title,
      body: input.body,
      ...(input.question === undefined ? {} : { question: input.question }),
      language: input.language,
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.tags === undefined ? {} : { tags: [...input.tags] }),
      status: nextStatus,
    },
    /* The version counter and the frozen copy move together, and `$slice`
       caps the history in the same write — a separate trim would be a second
       round trip that can fail on its own. */
    ...(textChanged
      ? { $inc: { version: 1 }, $push: { versions: { $each: [frozen], $slice: -VERSION_HISTORY } } }
      : {}),
    /* The old approval is not evidence about the new text. Clearing it means
       the queue shows who approved what, rather than a stale name beside a
       body that person never read. */
    ...(demoted ? { $unset: { approvedByStaffId: '', approvedAt: '' } } : {}),
  };

  const updated = await transitionEntry(id, [current.status], update);
  if (!updated) throw new ApiError(409, 'conflict', 'This entry changed while you were editing it');

  await recordAudit(logger, {
    action: demoted ? 'kb.submitted_for_review' : 'kb.created',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    targetId: id,
    metadata: {
      version: updated.version,
      textChanged,
      ...(demoted ? { demotedFrom: 'approved' } : {}),
    },
  });

  return updated;
}

/* ── The gate ───────────────────────────────────────────────────────────── */

export async function submitForReview(
  scope: Scope,
  id: string,
  logger: Logger,
): Promise<KbEntryDocument> {
  requireStaff(scope);
  await findEntry(scope, id);

  const updated = await transitionEntry(id, ['draft'], { $set: { status: 'pending_review' } });
  if (!updated) {
    throw new ApiError(409, 'not_a_draft', 'Only a draft can be submitted for review');
  }

  await recordAudit(logger, {
    action: 'kb.submitted_for_review',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    targetId: id,
  });

  return updated;
}

/**
 * Approves an entry — the one transition that puts text in front of customers.
 *
 * Returns the entry and whether retrieval needs rebuilding, so the caller
 * invalidates the index and embeds the new text. Approving without doing both
 * produces an entry that is approved and unfindable, which is the bug step 15
 * shipped with: 618 approved entries and zero vectors.
 */
export async function approveEntry(
  scope: Scope,
  id: string,
  note: string | undefined,
  logger: Logger,
): Promise<KbEntryDocument> {
  requireAdmin(scope, 'approve knowledge');
  const current = await findEntry(scope, id);

  /* Machine output has to be touched by a person first. `version === 1` means
     nobody has edited it since it was generated. */
  if (current.provenance.source === 'generated' && current.version === 1) {
    throw new ApiError(
      409,
      'unedited_generated_content',
      'Generated content must be edited by a person before it can be approved',
      { version: current.version },
    );
  }

  const staffId = scope.kind === 'staff' ? toObjectId(scope.staffId) : undefined;

  const updated = await transitionEntry(id, ['pending_review', 'draft'], {
    $set: {
      status: 'approved',
      approvedAt: new Date(),
      ...(staffId === undefined ? {} : { approvedByStaffId: staffId }),
      ...(note === undefined ? {} : { reviewNote: note }),
    },
  });
  if (!updated) throw new ApiError(409, 'not_reviewable', 'This entry is not awaiting approval');

  await recordAudit(logger, {
    action: 'kb.approved',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    targetId: id,
    metadata: {
      version: updated.version,
      /* Both ids, so a reviewer can see when they are the same person. An
         admin approving their own entry is allowed — an admin can already
         change another account's role, so forbidding it is theatre — but it
         must be visible rather than implied. */
      author: updated.createdByStaffId === undefined ? null : String(updated.createdByStaffId),
      source: updated.provenance.source,
    },
  });

  return updated;
}

/**
 * Rejects an entry, with a reason.
 *
 * The note is required. A rejection with no reason gives the person who wrote
 * the entry nothing to act on, so the entry is either resubmitted unchanged or
 * abandoned — and both make the queue longer.
 */
export async function rejectEntry(
  scope: Scope,
  id: string,
  note: string,
  logger: Logger,
): Promise<KbEntryDocument> {
  requireAdmin(scope, 'reject knowledge');
  await findEntry(scope, id);

  const updated = await transitionEntry(id, ['pending_review'], {
    $set: { status: 'draft', reviewNote: note },
    $unset: { approvedByStaffId: '', approvedAt: '' },
  });
  if (!updated) throw new ApiError(409, 'not_reviewable', 'This entry is not awaiting approval');

  await recordAudit(logger, {
    action: 'kb.rejected',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    targetId: id,
  });

  return updated;
}

/**
 * Archives an entry: out of retrieval, still readable.
 *
 * Not a delete. A message that cited this entry has to stay explicable, and a
 * deleted citation is a dangling reference in a transcript a customer may
 * still be holding.
 */
export async function archiveEntry(
  scope: Scope,
  id: string,
  logger: Logger,
): Promise<KbEntryDocument> {
  requireAdmin(scope, 'archive knowledge');
  await findEntry(scope, id);

  const updated = await transitionEntry(id, ['draft', 'pending_review', 'approved'], {
    $set: { status: 'archived' },
  });
  if (!updated) throw new ApiError(409, 'already_archived', 'This entry is already archived');

  await recordAudit(logger, {
    action: 'kb.archived',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    targetId: id,
  });

  return updated;
}

/** Back to `draft`, never straight to `approved`: it goes through the gate. */
export async function restoreEntry(
  scope: Scope,
  id: string,
  logger: Logger,
): Promise<KbEntryDocument> {
  requireAdmin(scope, 'restore knowledge');
  await findEntry(scope, id);

  const updated = await transitionEntry(id, ['archived'], { $set: { status: 'draft' } });
  if (!updated) throw new ApiError(409, 'not_archived', 'This entry is not archived');

  await recordAudit(logger, {
    action: 'kb.submitted_for_review',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    targetId: id,
    metadata: { restoredTo: 'draft' },
  });

  return updated;
}
