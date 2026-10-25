import type { Env } from '@csas/shared';
import type { Logger } from 'pino';
import { type Types } from 'mongoose';
import { Attachment } from '../../db/models/index.js';
import { ApiError } from '../../http/errors.js';
import { findTicket } from '../../repositories/tickets.js';
import { toObjectId, type Scope } from '../../repositories/scope.js';
import { record as recordAudit } from '../audit.js';
import { auditActorFor } from '../audit-scope.js';
import type { FileScanner } from '../providers/virus-scan.js';
import { newStorageKey, sha256, type StorageProvider } from '../providers/storage.js';
import { detectType, safeFilename } from './type-check.js';
import { ImageRejected, sanitizeImage } from './sanitize.js';

/**
 * Accepting a file.
 *
 * The order of operations is the security property, so it is worth stating
 * plainly. Nothing is written to storage until the bytes have been identified
 * and, if they are an image, replaced by a re-encoded copy. Nothing is
 * downloadable until it has been scanned clean.
 *
 *   1. size and count limits      — before anything is read into a decoder
 *   2. identify by magic bytes    — never by Content-Type or extension
 *   3. re-encode images           — metadata and appended payloads destroyed
 *   4. scan                       — on the bytes that will actually be stored
 *   5. store                      — under a server-generated key
 *   6. record                     — with its retention date
 *
 * Scanning before sanitising would scan bytes nobody will ever serve. Storing
 * before scanning would put an unscanned file in the store, and a crash
 * between the two would leave it there forever.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TICKET = 20;

/** `PRIVACY.md`: attachments go when the ticket's retention window closes. */
export const RETENTION_DAYS = 365;

export interface UploadInput {
  readonly bytes: Buffer;
  readonly originalFilename?: string | undefined;
  readonly messageId?: string | undefined;
}

export interface UploadDependencies {
  readonly storage: StorageProvider;
  readonly scanner: FileScanner;
  readonly logger: Logger;
  readonly env: Env;
}

export interface AttachmentDocument {
  _id: Types.ObjectId;
  ticketId: Types.ObjectId;
  customerId: Types.ObjectId;
  storageKey: string;
  originalFilename?: string;
  detectedMimeType: string;
  byteSize: number;
  checksumSha256: string;
  scan: { status: string };
  sanitized: boolean;
  deleteAfter: Date;
  deletedAt?: Date;
  /* Added by `baseOptions.timestamps`, so absent from `AttachmentRecord`. */
  createdAt: Date;
  updatedAt: Date;
}

export interface AttachmentView {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly scanStatus: string;
  readonly downloadable: boolean;
  readonly createdAt: Date;
}

export function present(attachment: AttachmentDocument): AttachmentView {
  return {
    id: String(attachment._id),
    /* The stored original is shown, never used as a path. */
    filename: attachment.originalFilename ?? 'attachment',
    mimeType: attachment.detectedMimeType,
    byteSize: attachment.byteSize,
    scanStatus: attachment.scan.status,
    downloadable: attachment.scan.status === 'clean',
    createdAt: attachment.createdAt,
  };
}

export async function uploadAttachment(
  scope: Scope,
  ticketId: string,
  input: UploadInput,
  deps: UploadDependencies,
): Promise<AttachmentView> {
  /* Ownership first: an upload to someone else's ticket must not even be
     decoded, let alone stored. */
  const ticket = await findTicket(scope, ticketId);

  if (input.bytes.byteLength === 0) {
    throw new ApiError(400, 'empty_file', 'That file is empty');
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, 'file_too_large', 'That file is larger than 10 MB');
  }

  const existing = await Attachment.countDocuments({
    ticketId: ticket._id,
    deletedAt: { $exists: false },
  });
  if (existing >= MAX_ATTACHMENTS_PER_TICKET) {
    throw new ApiError(409, 'too_many_attachments', 'This ticket already has 20 attachments');
  }

  const verdict = await detectType(input.bytes);
  if (!verdict.ok) {
    /* The detected type is reported back deliberately: "we do not accept
       application/zip" is actionable, and it reveals nothing the uploader did
       not already have. */
    throw new ApiError(415, 'unsupported_file_type', 'That kind of file cannot be attached', {
      reason: verdict.reason,
      ...(verdict.detected === undefined ? {} : { detected: verdict.detected }),
    });
  }

  let bytes = input.bytes;
  let mimeType = verdict.mimeType;
  let extension = verdict.extension;
  let sanitized = false;

  if (verdict.image) {
    try {
      const clean = await sanitizeImage(input.bytes);
      bytes = clean.bytes;
      mimeType = clean.mimeType;
      extension = 'png';
      sanitized = true;
    } catch (error) {
      if (error instanceof ImageRejected) {
        throw new ApiError(415, 'unsupported_file_type', 'That image could not be processed', {
          reason: error.reason,
        });
      }
      throw error;
    }
  }

  const scan = await deps.scanner.scan(bytes);

  if (scan.status === 'infected') {
    /* Never stored. The bytes are dropped here and the audit entry is the only
       record that the upload happened — which is the point of auditing it. */
    await recordAudit(deps.logger, {
      action: 'attachment.rejected',
      ...auditActorFor(scope),
      targetType: 'ticket',
      targetId: ticket.reference,
      outcome: 'failure',
      metadata: { reason: 'infected', signature: scan.signature },
    });
    throw new ApiError(422, 'file_rejected', 'That file did not pass the malware scan');
  }

  const key = newStorageKey();
  const stored = await deps.storage.put(key, bytes);

  const attachment = await Attachment.create({
    ticketId: ticket._id,
    customerId: ticket.customerId,
    ...(input.messageId === undefined ? {} : { messageId: toObjectId(input.messageId) }),
    storageKey: key,
    ...(input.originalFilename === undefined
      ? {}
      : { originalFilename: safeFilename(input.originalFilename, extension) }),
    detectedMimeType: mimeType,
    byteSize: stored.byteSize,
    checksumSha256: stored.checksumSha256,
    /* `infected` threw above, so this is `clean` or `error`. An `error` is
       recorded as-is and leaves the file undownloadable: a scan that failed
       to run is not a scan that passed. */
    scan: { status: scan.status, scannedAt: new Date() },
    sanitized,
    deleteAfter: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
  });

  await recordAudit(deps.logger, {
    action: 'attachment.uploaded',
    ...auditActorFor(scope),
    targetType: 'attachment',
    targetId: String(attachment._id),
    /* The type and size, never the filename: a filename is often personal
       (`passport-scan.pdf`, `ahmad-invoice.pdf`). */
    metadata: { mimeType, byteSize: stored.byteSize, sanitized },
  });

  return present(attachment.toObject<AttachmentDocument>());
}

/* ── Reading ────────────────────────────────────────────────────────────── */

/**
 * One attachment, if this scope may have it.
 *
 * Reached through its ticket, exactly like a message: the ownership check is
 * `findTicket`, which is the same function the REST and socket paths use. A
 * second access rule for attachments would be a second rule to get wrong.
 */
export async function findAttachment(
  scope: Scope,
  attachmentId: string,
): Promise<AttachmentDocument> {
  const attachment = await Attachment.findOne({
    _id: toObjectId(attachmentId),
    deletedAt: { $exists: false },
  })
    .lean<AttachmentDocument>()
    .exec();

  if (!attachment) throw new ApiError(404, 'not_found', 'Attachment not found');

  /* Throws 404 if the scope may not see the ticket, which is the same answer
     as a missing attachment — see `scope.ts` on why this is never a 403. */
  await findTicket(scope, String(attachment.ticketId));
  return attachment;
}

export async function listAttachments(scope: Scope, ticketId: string): Promise<AttachmentView[]> {
  const ticket = await findTicket(scope, ticketId);
  const rows = await Attachment.find({ ticketId: ticket._id, deletedAt: { $exists: false } })
    .sort({ createdAt: 1 })
    .lean<AttachmentDocument[]>()
    .exec();
  return rows.map((row) => present(row));
}

export interface DownloadedFile {
  readonly bytes: Buffer;
  readonly mimeType: string;
  readonly filename: string;
}

/**
 * The bytes, with the checks that must pass first.
 *
 * `pending` and `error` are refused along with `infected`. A scan that failed
 * to run is not a scan that passed, and treating "we could not tell" as clean
 * is how a scanner outage becomes a malware delivery service.
 */
export async function readAttachment(
  scope: Scope,
  attachmentId: string,
  storage: StorageProvider,
  logger: Logger,
): Promise<DownloadedFile> {
  const attachment = await findAttachment(scope, attachmentId);

  if (attachment.scan.status !== 'clean') {
    throw new ApiError(409, 'not_available', 'That file is not available for download', {
      scanStatus: attachment.scan.status,
    });
  }

  const bytes = await storage.get(attachment.storageKey);

  /* The stored checksum is verified on the way out. If the bytes on disk no
     longer match what was scanned, something replaced them after the scan —
     and serving them would hand out a file nothing ever checked. */
  if (sha256(bytes) !== attachment.checksumSha256) {
    logger.error(
      { attachmentId: String(attachment._id) },
      'attachment checksum mismatch; refusing to serve',
    );
    throw new ApiError(500, 'integrity_error', 'That file could not be served');
  }

  await recordAudit(logger, {
    action: 'attachment.downloaded',
    ...auditActorFor(scope),
    targetType: 'attachment',
    targetId: String(attachment._id),
  });

  const extension = attachment.detectedMimeType === 'image/png' ? 'png' : 'bin';
  return {
    bytes,
    mimeType: attachment.detectedMimeType,
    filename: safeFilename(attachment.originalFilename, extension),
  };
}
