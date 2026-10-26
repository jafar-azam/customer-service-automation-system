import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import type { InputForm, MessageAuthor, MessageKind, Priority, TicketStatus } from '@csas/shared';
import {
  ESCALATION_REASONS,
  INPUT_FORMS,
  MESSAGE_AUTHORS,
  MESSAGE_KINDS,
  PRIORITIES,
  TICKET_STATUSES,
} from '@csas/shared';
import { baseOptions, longText, requiredString, shortString } from './shared.js';

/**
 * The support record: tickets, what was said, what was attached, how it ended.
 *
 * EERD mapping:
 *   ticket    → `tickets`      (+ SLA fields, + status history, + input form)
 *   problems  → folded into `tickets`. The diagram separates them because a
 *               ticket could hold several problems; in practice one
 *               conversation is one problem, and a second problem is a second
 *               ticket the SLA can be measured against. A 1:1 table is a join
 *               that buys nothing.
 *   reports   → `resolutions`  (renamed: "report" reads as analytics)
 *   logs      → `audit_logs` (governance.ts), not here — the EERD's `logs`
 *               conflates an interaction trace with an audit trail, and those
 *               have different retention periods and different readers.
 */

/* ── Tickets ────────────────────────────────────────────────────────────── */

/**
 * Subdocument schemas carry an explicit type parameter.
 *
 * Without it, Mongoose infers the parent document type *through* every nested
 * schema, and at this schema's size TypeScript gives up with "type
 * instantiation is excessively deep". Naming the shape stops the recursion at
 * the subdocument boundary — and the interface is better documentation than the
 * inferred type was.
 */
interface StatusChange {
  status: TicketStatus;
  at: Date;
  byStaffId?: Types.ObjectId;
  byCustomer?: boolean;
  note?: string;
}

const statusChangeSchema = new Schema<StatusChange>(
  {
    status: { type: String, enum: [...TICKET_STATUSES], required: true },
    at: { type: Date, required: true, default: () => new Date() },
    byStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    /** `system` when a job moved it — an SLA breach, an auto-close. */
    byCustomer: { type: Boolean },
    note: shortString,
  },
  { _id: false },
);

/** Named for the same reason as the subdocuments: this schema is large enough
    that inferring the document type through it exhausts TypeScript's recursion
    budget, and the ticket is the record most code touches. */
export interface TicketRecord {
  reference: string;
  customerId: Types.ObjectId;
  contractId: Types.ObjectId;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  topic?: string;
  category?: string;
  inputForm: InputForm;
  assignedStaffId?: Types.ObjectId;
  assignedAt?: Date;
  sla: {
    firstResponseDueAt?: Date;
    resolutionDueAt?: Date;
    firstRespondedAt?: Date;
    /** When to warn, not when to breach — see `services/sla/policy.ts`. */
    firstResponseWarnAt?: Date;
    pausedMs: number;
    pausedAt?: Date;
    breachedAt?: Date;
    warningSentAt?: Date;
  };
  resolvedAt?: Date;
  closedAt?: Date;
  reopenedCount: number;
  /** Set when this ticket was opened by reopening a closed one. */
  reopenedFromId?: Types.ObjectId;
  lastCustomerMessageAt?: Date;
  statusHistory: StatusChange[];
}

const ticketSchema = new Schema<TicketRecord>(
  {
    /** Human-quotable, e.g. `CSAS-000123`. Customers read this out loud. */
    reference: { ...requiredString, maxlength: 32 },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'Contract', required: true },

    subject: { ...requiredString, maxlength: 200 },
    status: {
      type: String,
      enum: [...TICKET_STATUSES],
      required: true,
      default: 'open',
      index: true,
    },
    priority: { type: String, enum: [...PRIORITIES], required: true, default: 'medium' },
    topic: shortString,
    category: shortString,

    /** The form the customer actually wrote in, recorded per ticket so
        analytics can report accuracy per input form without re-detecting. */
    inputForm: { type: String, enum: [...INPUT_FORMS], required: true, default: 'unknown' },

    assignedStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser', index: true },
    assignedAt: { type: Date },

    /* ── SLA (step 14 computes these; the fields exist now so the schema does
       not have to change under a running system) ──────────────────────────── */
    sla: {
      firstResponseDueAt: { type: Date },
      resolutionDueAt: { type: Date },
      firstRespondedAt: { type: Date },
      /** Stored rather than recomputed: the budget is known when the ticket
          opens, and a sweep that derives it from `createdAt` every pass has
          to re-run the whole working-hours calculation for every open
          ticket, every minute. */
      firstResponseWarnAt: { type: Date },
      /** Accumulated time the clock was paused waiting for the customer. The
          SLA is a promise about our response, not about theirs. */
      pausedMs: { type: Number, required: true, default: 0, min: 0 },
      pausedAt: { type: Date },
      breachedAt: { type: Date },
      warningSentAt: { type: Date },
    },

    resolvedAt: { type: Date },
    closedAt: { type: Date },
    reopenedCount: { type: Number, required: true, default: 0, min: 0 },
    /** The closed ticket this one continues. A link rather than a resurrection:
        the history of the original stays exactly as it was when it closed. */
    reopenedFromId: { type: Schema.Types.ObjectId, ref: 'Ticket' },
    lastCustomerMessageAt: { type: Date },

    statusHistory: { type: [statusChangeSchema], default: [] },
  },
  baseOptions,
);

ticketSchema.index({ reference: 1 }, { unique: true });
/* The customer's own history, newest first — the most frequent query. */
ticketSchema.index({ customerId: 1, createdAt: -1 });
/* The agent queue: open work, oldest deadline first. */
ticketSchema.index({ status: 1, 'sla.resolutionDueAt': 1 });
ticketSchema.index({ assignedStaffId: 1, status: 1 });
/* Analytics by topic and form (step 30). */
ticketSchema.index({ createdAt: -1, topic: 1, inputForm: 1 });

export type TicketDoc = TicketRecord;
export const Ticket = model('Ticket', ticketSchema, 'tickets');

/* ── Messages ───────────────────────────────────────────────────────────── */

interface Citation {
  kbEntryId: Types.ObjectId;
  version: number;
  title?: string;
  score?: number;
}

const citationSchema = new Schema<Citation>(
  {
    kbEntryId: { type: Schema.Types.ObjectId, ref: 'KbEntry', required: true },
    /** The version that was actually used. An entry edited later must not
        change what the assistant is recorded as having cited. */
    version: { type: Number, required: true, min: 1 },
    /** The title as it read at the time, frozen for the same reason as the
        version: showing the *current* title beside an old version number would
        describe the citation as something it was not. A customer sees this and
        never the id, having nothing to look an id up in. */
    title: { type: String, maxlength: 200 },
    score: { type: Number, min: 0, max: 1 },
  },
  { _id: false },
);

export interface MessageRecord {
  ticketId: Types.ObjectId;
  author: MessageAuthor;
  authorStaffId?: Types.ObjectId;
  kind: MessageKind;
  body: string;
  inputForm: InputForm;
  internal: boolean;
  citations: Citation[];
  confidence?: number;
  modelVersion?: string;
  voice?: {
    attachmentId?: Types.ObjectId;
    durationMs?: number;
    transcriptConfidence?: number;
  };
}

const messageSchema = new Schema<MessageRecord>(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    author: { type: String, enum: [...MESSAGE_AUTHORS], required: true },
    authorStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    kind: { type: String, enum: [...MESSAGE_KINDS], required: true, default: 'text' },

    /** What was written or transcribed. Never logged, never sent to an error
        tracker, never exported without consent (PRIVACY.md §5). */
    body: { ...longText, required: true },
    inputForm: { type: String, enum: [...INPUT_FORMS], required: true, default: 'unknown' },

    /** Internal notes are invisible to the customer. The flag is on the message
        rather than in a separate collection so that one ownership check covers
        the whole conversation — a second collection is a second place to forget
        the check. */
    internal: { type: Boolean, required: true, default: false },

    citations: { type: [citationSchema], default: [] },
    /** Calibrated confidence, when the assistant wrote this (step 24). */
    confidence: { type: Number, min: 0, max: 1 },
    /** Which model produced it, so an answer can be explained months later. */
    modelVersion: shortString,

    voice: {
      attachmentId: { type: Schema.Types.ObjectId, ref: 'Attachment' },
      durationMs: { type: Number, min: 0 },
      transcriptConfidence: { type: Number, min: 0, max: 1 },
    },
  },
  baseOptions,
);

/* The conversation, in order. Every message read goes through the ticket, so
   the compound index also serves the ownership check. */
messageSchema.index({ ticketId: 1, createdAt: 1 });

export type MessageDoc = MessageRecord;
export const Message = model('Message', messageSchema, 'messages');

/* ── Attachments ────────────────────────────────────────────────────────── */

export interface AttachmentRecord {
  ticketId: Types.ObjectId;
  customerId: Types.ObjectId;
  messageId?: Types.ObjectId;
  storageKey: string;
  originalFilename?: string;
  detectedMimeType: string;
  byteSize: number;
  checksumSha256: string;
  scan: {
    status: 'pending' | 'clean' | 'infected' | 'error';
    scannedAt?: Date;
    signature?: string;
  };
  sanitized: boolean;
  deleteAfter: Date;
  deletedAt?: Date;
}

const attachmentSchema = new Schema<AttachmentRecord>(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },

    /** Server-generated. The customer's filename is metadata, never a path. */
    storageKey: { ...requiredString, maxlength: 128 },
    originalFilename: { type: String, maxlength: 255 },

    /** Decided by magic bytes, never by the client's Content-Type (7.1). */
    detectedMimeType: { ...requiredString, maxlength: 100 },
    byteSize: { type: Number, required: true, min: 0 },
    checksumSha256: { ...requiredString, maxlength: 64 },

    scan: {
      status: {
        type: String,
        enum: ['pending', 'clean', 'infected', 'error'],
        required: true,
        default: 'pending',
      },
      scannedAt: { type: Date },
      signature: shortString,
    },

    /** True once the image has been re-encoded and its metadata — including
        GPS — destroyed. A file is not downloadable before this is true. */
    sanitized: { type: Boolean, required: true, default: false },

    /** Set at upload from the retention schedule; the sweep reads this rather
        than recomputing a policy that may have changed since. */
    deleteAfter: { type: Date, required: true },
    deletedAt: { type: Date },
  },
  baseOptions,
);

attachmentSchema.index({ storageKey: 1 }, { unique: true });
attachmentSchema.index({ ticketId: 1, createdAt: 1 });
/* The retention sweep (step 14). Partial, so it only indexes what it scans. */
/* A compound index rather than a partial one: MongoDB rejects
   `$exists: false` in a partial filter, and the sweep's real query is
   "not yet deleted, and due" — which this serves directly. */
attachmentSchema.index({ deletedAt: 1, deleteAfter: 1 });

export type AttachmentDoc = AttachmentRecord;
export const Attachment = model('Attachment', attachmentSchema, 'attachments');

/* ── Resolutions and escalations ────────────────────────────────────────── */

const resolutionSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    title: { ...requiredString, maxlength: 200 },
    body: { ...longText, required: true },

    resolvedBy: { type: String, enum: ['assistant', 'agent'], required: true },
    resolvedByStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },

    /** An agent can propose this resolution as a knowledge-base entry; an admin
        must approve it before the assistant may use it (step 17). */
    kbCandidateId: { type: Schema.Types.ObjectId, ref: 'KbEntry' },
    confirmedByCustomer: { type: Boolean },
    confirmedAt: { type: Date },
  },
  baseOptions,
);

export type ResolutionDoc = InferSchemaType<typeof resolutionSchema>;
export const Resolution = model('Resolution', resolutionSchema, 'resolutions');

const escalationSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    reason: { type: String, enum: [...ESCALATION_REASONS], required: true },
    /** The retrieval confidence at the moment of escalation, so step 21 can
        measure whether the threshold is in the right place. */
    confidence: { type: Number, min: 0, max: 1 },
    toStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    notifiedAt: { type: Date },
    acknowledgedAt: { type: Date },
  },
  baseOptions,
);

escalationSchema.index({ ticketId: 1, createdAt: -1 });

export type EscalationDoc = InferSchemaType<typeof escalationSchema>;
export const Escalation = model('Escalation', escalationSchema, 'escalations');

/* ── Satisfaction ───────────────────────────────────────────────────────── */

const satisfactionRatingSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    /** 1–5, as the reference CSV's `SatisfactionRating`. */
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 2000 },
    resolvedBy: { type: String, enum: ['assistant', 'agent'], required: true },
  },
  baseOptions,
);

/* One rating per ticket; a second submission updates the first. */
satisfactionRatingSchema.index({ ticketId: 1 }, { unique: true });
satisfactionRatingSchema.index({ createdAt: -1, resolvedBy: 1 });

export type SatisfactionRatingDoc = InferSchemaType<typeof satisfactionRatingSchema>;
export const SatisfactionRating = model(
  'SatisfactionRating',
  satisfactionRatingSchema,
  'satisfaction_ratings',
);
