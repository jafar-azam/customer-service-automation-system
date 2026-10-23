import type { Logger } from 'pino';
import type { AuditAction } from '@csas/shared';
import { AuditLog, type AuditEntry } from '../db/models/index.js';
import { getRequestId } from '../observability/request-context.js';

/**
 * The append-only audit log.
 *
 * This module exposes exactly one verb — `record` — and no update or delete.
 * That is the enforcement: there is no code path in the application that can
 * alter an entry, so "append-only" is a property of the implementation rather
 * than a promise in a document. The database user cannot drop the collection
 * either (step 05's privilege separation), and immutable storage is the
 * remaining gap, recorded in `THREAT_MODEL.md` §8.
 *
 * **Entries hold references, never content.** A ticket id, not the message; an
 * export id, not the export. The audit log outlives the data it describes —
 * 6–12 months against 12 for a ticket — so content here would quietly defeat
 * the retention schedule, and a log that must be redacted is a log nobody can
 * trust as evidence.
 */

export interface AuditInput {
  readonly action: AuditAction;
  readonly actorType: 'staff' | 'customer' | 'system';
  readonly actorStaffId?: unknown;
  readonly actorCustomerId?: unknown;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly ip?: string;
  readonly outcome?: 'success' | 'failure';
  /** Small, structured, non-sensitive: `{ from: 'agent', to: 'admin' }`. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Writes one entry.
 *
 * **A failure here never fails the request.** An audit write that throws on the
 * login path would turn a full disk into an outage, and — worse — would let an
 * attacker who can break the audit write deny the action they are performing.
 * The failure is logged at `error` so it is visible to the alert rules in step
 * 36. That is the standard trade, and it is the right way round for this
 * system: losing one entry is bad, refusing all logins is worse.
 */
export async function record(logger: Logger, input: AuditInput): Promise<void> {
  const requestId = getRequestId();

  const entry: AuditEntry = {
    action: input.action,
    at: new Date(),
    actorType: input.actorType,
    outcome: input.outcome ?? 'success',
    ...(input.actorStaffId ? { actorStaffId: input.actorStaffId as never } : {}),
    ...(input.actorCustomerId ? { actorCustomerId: input.actorCustomerId as never } : {}),
    ...(input.targetType === undefined ? {} : { targetType: input.targetType }),
    ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(input.ip === undefined ? {} : { ip: input.ip }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };

  try {
    await AuditLog.create(entry);
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'audit write failed');
  }
}
