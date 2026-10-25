import { Schema, model, type Types } from 'mongoose';
import type {
  AuditAction,
  ConsentPurpose,
  DeliveryStatus,
  InputForm,
  ModelKind,
  ModelStage,
  NotificationChannel,
  NotificationKind,
} from '@csas/shared';
import {
  AUDIT_ACTIONS,
  CONSENT_PURPOSES,
  DELIVERY_STATUSES,
  INPUT_FORMS,
  MODEL_KINDS,
  MODEL_STAGES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
} from '@csas/shared';
import { baseOptions, longText, requiredString, shortString } from './shared.js';

/**
 * Credentials, evidence, scheduling and the machine-learning registry — the
 * collections that are about running the system rather than about the support
 * conversation itself.
 */

/* ── Sessions and credentials ───────────────────────────────────────────── */

/**
 * One row per refresh token.
 *
 * `familyId` is what makes reuse detection work: every rotation stays in the
 * same family, so presenting an already-rotated token proves the token was
 * stolen, and the response is to revoke the **whole family** rather than the
 * one token — otherwise the thief and the victim simply keep taking turns.
 */
export interface SessionRecord {
  subjectType: 'staff' | 'customer';
  staffId?: Types.ObjectId;
  customerId?: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  rotatedAt?: Date;
  revokedAt?: Date;
  revokedReason?:
    'logout' | 'rotation' | 'reuse_detected' | 'password_reset' | 'account_disabled' | 'admin';
  userAgent?: string;
  ip?: string;
}

const sessionSchema = new Schema<SessionRecord>(
  {
    subjectType: { type: String, enum: ['staff', 'customer'], required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },

    familyId: { ...requiredString, maxlength: 64, index: true },
    /** SHA-256 of the token. The token itself is never stored, so a database
        dump does not hand an attacker working sessions. */
    tokenHash: { ...requiredString, maxlength: 64 },

    issuedAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date },
    revokedAt: { type: Date },
    revokedReason: {
      type: String,
      enum: ['logout', 'rotation', 'reuse_detected', 'password_reset', 'account_disabled', 'admin'],
    },

    /** Coarse client facts, for showing a customer their active sessions.
        The IP is kept for abuse investigation and expires with the session. */
    userAgent: { type: String, maxlength: 400 },
    ip: { type: String, maxlength: 64 },
  },
  baseOptions,
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ staffId: 1, revokedAt: 1 });
sessionSchema.index({ customerId: 1, revokedAt: 1 });
/* MongoDB deletes expired sessions itself — a retention rule that cannot be
   forgotten by a job that failed to run. */
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = SessionRecord;
export const Session = model('Session', sessionSchema, 'sessions');

/**
 * One-time codes. Only ever a hash (CHECKLIST 2.1).
 *
 * The document is deleted by TTL shortly after expiry, so a stolen backup does
 * not contain a usable challenge, and the attempt counter lives here rather
 * than in Redis so that "five attempts" survives a Redis restart.
 */
export interface OtpChallengeRecord {
  phoneHash: string;
  codeHash: string;
  channel: 'whatsapp' | 'sms';
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  consumedAt?: Date;
  deliveryStatus: DeliveryStatus;
  providerMessageId?: string;
  requestIp?: string;
}

const otpChallengeSchema = new Schema<OtpChallengeRecord>(
  {
    /** The peppered phone hash — never the number, never the code. */
    phoneHash: { ...requiredString, maxlength: 64, index: true },
    codeHash: { ...requiredString, maxlength: 128, select: false },

    channel: { type: String, enum: ['whatsapp', 'sms'], required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 5, min: 1 },
    consumedAt: { type: Date },

    /** Delivery is three facts, not one (messaging-lebanon.md): accepted by the
        provider, delivered to a handset, and verified by a human. */
    deliveryStatus: {
      type: String,
      enum: [...DELIVERY_STATUSES],
      required: true,
      default: 'queued',
    },
    providerMessageId: { type: String, maxlength: 128 },
    requestIp: { type: String, maxlength: 64 },
  },
  baseOptions,
);

/* Purged 10 minutes after expiry: long enough to investigate a complaint,
   short enough that the table is never a trove. */
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });
otpChallengeSchema.index({ phoneHash: 1, createdAt: -1 });

export type OtpChallengeDoc = OtpChallengeRecord;
export const OtpChallenge = model('OtpChallenge', otpChallengeSchema, 'otp_challenges');

export interface PasswordResetTokenRecord {
  staffId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  requestIp?: string;
}

const passwordResetTokenSchema = new Schema<PasswordResetTokenRecord>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: 'StaffUser', required: true, index: true },
    tokenHash: { ...requiredString, maxlength: 64, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    requestIp: { type: String, maxlength: 64 },
  },
  baseOptions,
);

passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
/* 30-minute lifetime, then gone an hour later. */
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export type PasswordResetTokenDoc = PasswordResetTokenRecord;
export const PasswordResetToken = model(
  'PasswordResetToken',
  passwordResetTokenSchema,
  'password_reset_tokens',
);

/** Ten per staff member, hashed, shown once at enrolment, each usable once. */
export interface RecoveryCodeRecord {
  staffId: Types.ObjectId;
  codeHash: string;
  usedAt?: Date;
  batchId: string;
}

const recoveryCodeSchema = new Schema<RecoveryCodeRecord>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: 'StaffUser', required: true, index: true },
    codeHash: { ...requiredString, maxlength: 128, select: false },
    usedAt: { type: Date },
    /** Which batch it came from: regenerating codes invalidates the old batch,
        and an investigation needs to know which set was in play. */
    batchId: { ...requiredString, maxlength: 64 },
  },
  baseOptions,
);

recoveryCodeSchema.index({ staffId: 1, usedAt: 1 });

export type RecoveryCodeDoc = RecoveryCodeRecord;
export const RecoveryCode = model('RecoveryCode', recoveryCodeSchema, 'recovery_codes');

/* ── Audit log ──────────────────────────────────────────────────────────── */

/**
 * Append-only evidence.
 *
 * No update path exists in the application, and the repository layer exposes
 * only `append` and `find` (step 06). Immutable storage is infrastructure this
 * release does not deploy, and that limitation is recorded in the threat model
 * rather than papered over.
 *
 * Entries hold **references, never content**: a ticket id, not the message; an
 * export id, not the export. The audit log has a longer retention than the data
 * it describes, so putting content here would quietly defeat deletion.
 */
/**
 * Typed explicitly rather than inferred: with 39 enumerated actions and a Mixed
 * metadata field, inference collapses to an empty document type, and the first
 * symptom is `AuditLog.create()` refusing every object. A named interface is
 * also the right thing for the collection that has to be readable during an
 * incident.
 */
export interface AuditEntry {
  action: AuditAction;
  at?: Date;
  actorType: 'staff' | 'customer' | 'system';
  actorStaffId?: Types.ObjectId;
  actorCustomerId?: Types.ObjectId;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  outcome?: 'success' | 'failure';
}

const auditLogSchema = new Schema<AuditEntry>(
  {
    action: { type: String, enum: [...AUDIT_ACTIONS], required: true, index: true },
    at: { type: Date, required: true, default: () => new Date(), index: true },

    actorType: { type: String, enum: ['staff', 'customer', 'system'], required: true },
    actorStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    actorCustomerId: { type: Schema.Types.ObjectId, ref: 'Customer' },

    targetType: { type: String, maxlength: 40 },
    targetId: { type: String, maxlength: 64 },

    /** Correlates an audit entry with the request's log lines (step 03). */
    requestId: { type: String, maxlength: 64 },
    ip: { type: String, maxlength: 64 },
    /** Small, structured, non-sensitive context: `{ from: 'agent', to: 'admin' }`.
        Free-form text and anything personal does not belong here. */
    metadata: { type: Schema.Types.Mixed },
    outcome: { type: String, enum: ['success', 'failure'], required: true, default: 'success' },
  },
  { ...baseOptions, timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ at: -1, action: 1 });
auditLogSchema.index({ actorStaffId: 1, at: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, at: -1 });

export type AuditLogDoc = AuditEntry;
export const AuditLog = model('AuditLog', auditLogSchema, 'audit_logs');

/* ── Notifications and scheduling ───────────────────────────────────────── */

/**
 * Every message the system sent or would have sent.
 *
 * In this release every provider is a mock, so this collection *is* the dev
 * inbox the dashboard renders. `idempotencyKey` makes a retried job harmless:
 * the same reminder for the same contract on the same day is one row and one
 * send, whatever the queue does.
 */
export interface NotificationRecord {
  kind: NotificationKind;
  channel: NotificationChannel;
  customerId?: Types.ObjectId;
  staffId?: Types.ObjectId;
  ticketId?: Types.ObjectId;
  recipientMasked: string;
  templateKey: string;
  preview?: string;
  status: DeliveryStatus;
  providerMessageId?: string;
  error?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  idempotencyKey: string;
}

const notificationSchema = new Schema<NotificationRecord>(
  {
    kind: { type: String, enum: [...NOTIFICATION_KINDS], required: true, index: true },
    channel: { type: String, enum: [...NOTIFICATION_CHANNELS], required: true },

    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    staffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket' },

    /** Masked at write time: `+961***456`. The full number is never duplicated
        into this collection — it already lives, encrypted, on the customer. */
    recipientMasked: { ...requiredString, maxlength: 64 },
    templateKey: { ...requiredString, maxlength: 80 },
    /** The rendered body, minus anything secret. An OTP code is **never** here;
        the dev inbox reads the code from the challenge it belongs to. */
    preview: { type: String, maxlength: 2000 },

    status: { type: String, enum: [...DELIVERY_STATUSES], required: true, default: 'queued' },
    providerMessageId: { type: String, maxlength: 128 },
    error: { type: String, maxlength: 500 },
    sentAt: { type: Date },
    deliveredAt: { type: Date },

    idempotencyKey: { ...requiredString, maxlength: 160 },
  },
  baseOptions,
);

notificationSchema.index({ idempotencyKey: 1 }, { unique: true });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ customerId: 1, createdAt: -1 });

export type NotificationDoc = NotificationRecord;
export const Notification = model('Notification', notificationSchema, 'notifications');

/** The on-duty rota (step 14): who takes escalations, and when. */
export interface DutyShiftRecord {
  staffId: Types.ObjectId;
  startsAt: Date;
  endsAt: Date;
  onCall: boolean;
  note?: string;
}

const dutyShiftSchema = new Schema<DutyShiftRecord>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: 'StaffUser', required: true, index: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    /** Outside business hours, an urgent ticket pages whoever is on call. */
    onCall: { type: Boolean, required: true, default: false },
    note: shortString,
  },
  baseOptions,
);

/* "Who is on duty right now" — the query the escalation path makes. */
dutyShiftSchema.index({ startsAt: 1, endsAt: 1 });

export type DutyShiftDoc = DutyShiftRecord;
export const DutyShift = model('DutyShift', dutyShiftSchema, 'duty_shifts');

/* ── Public contact form ────────────────────────────────────────────────── */

export interface ContactMessageRecord {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  body: string;
  handledByStaffId?: Types.ObjectId;
  handledAt?: Date;
  spamScore?: number;
  ip?: string;
}

const contactMessageSchema = new Schema<ContactMessageRecord>(
  {
    name: { ...requiredString, maxlength: 120 },
    email: { ...requiredString, lowercase: true, maxlength: 254 },
    phone: { type: String, maxlength: 32 },
    subject: { ...requiredString, maxlength: 200 },
    body: { ...longText, required: true },

    handledByStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    handledAt: { type: Date },
    /** What the bot check decided, kept so the threshold can be tuned against
        real traffic rather than guessed at. */
    spamScore: { type: Number, min: 0, max: 1 },
    ip: { type: String, maxlength: 64 },
  },
  baseOptions,
);

contactMessageSchema.index({ createdAt: -1, handledAt: 1 });

export type ContactMessageDoc = ContactMessageRecord;
export const ContactMessage = model('ContactMessage', contactMessageSchema, 'contact_messages');

/* ── Machine learning ───────────────────────────────────────────────────── */

/**
 * Feedback events: the raw material of the continuous-learning loop.
 *
 * Recorded as they happen, consumed only with consent and only after human
 * approval (step 27). `consentAtEvent` freezes what the customer had agreed to
 * **at the time** — a later withdrawal stops future use, and the frozen value
 * is what makes "was this example ever allowed?" answerable.
 */
export interface FeedbackEventRecord {
  kind: 'answer_confirmed' | 'answer_rejected' | 'agent_correction' | 'satisfaction' | 'escalated';
  ticketId: Types.ObjectId;
  messageId?: Types.ObjectId;
  kbEntryId?: Types.ObjectId;
  customerId: Types.ObjectId;
  inputForm: InputForm;
  confidence?: number;
  modelVersion?: string;
  consentAtEvent: boolean;
  consentPurpose?: ConsentPurpose;
  exportedAt?: Date;
}

const feedbackEventSchema = new Schema<FeedbackEventRecord>(
  {
    kind: {
      type: String,
      enum: [
        'answer_confirmed',
        'answer_rejected',
        'agent_correction',
        'satisfaction',
        'escalated',
      ],
      required: true,
      index: true,
    },
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    kbEntryId: { type: Schema.Types.ObjectId, ref: 'KbEntry' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },

    inputForm: { type: String, enum: [...INPUT_FORMS], required: true, default: 'unknown' },
    confidence: { type: Number, min: 0, max: 1 },
    modelVersion: shortString,

    consentAtEvent: { type: Boolean, required: true, default: false },
    consentPurpose: { type: String, enum: CONSENT_PURPOSES },
    /** Set once the event has been turned into a de-identified dataset item.
        Until then it is support data, not training data. */
    exportedAt: { type: Date },
  },
  baseOptions,
);

feedbackEventSchema.index({ createdAt: -1, kind: 1 });
feedbackEventSchema.index({ exportedAt: 1, consentAtEvent: 1 });

export type FeedbackEventDoc = FeedbackEventRecord;
export const FeedbackEvent = model('FeedbackEvent', feedbackEventSchema, 'feedback_events');

/**
 * The model registry.
 *
 * `artifactSha256` is a security control, not bookkeeping: the hash is recorded
 * at registration and verified before the artefact is loaded, so a swapped file
 * fails closed. `format` is constrained to safetensors and ONNX because
 * `pickle.load` is arbitrary code execution (THREAT_MODEL §7.6).
 */
export interface ModelVersionRecord {
  kind: ModelKind;
  name: string;
  version: string;
  stage: ModelStage;
  artifactPath: string;
  artifactSha256: string;
  format: 'safetensors' | 'onnx';
  metrics?: Record<string, unknown>;
  metricsByInputForm?: Record<string, unknown>;
  baselineComparison?: Record<string, unknown>;
  trainingConfig?: Record<string, unknown>;
  datasetSnapshotId?: string;
  modelCardPath?: string;
  registeredByStaffId?: Types.ObjectId;
  promotedByStaffId?: Types.ObjectId;
  promotedAt?: Date;
  rolledBackAt?: Date;
  notes?: string;
}

const modelVersionSchema = new Schema<ModelVersionRecord>(
  {
    kind: { type: String, enum: [...MODEL_KINDS], required: true, index: true },
    name: { ...requiredString, maxlength: 120 },
    version: { ...requiredString, maxlength: 40 },
    stage: {
      type: String,
      enum: [...MODEL_STAGES],
      required: true,
      default: 'registered',
      index: true,
    },

    artifactPath: { ...requiredString, maxlength: 400 },
    artifactSha256: { ...requiredString, maxlength: 64 },
    format: { type: String, enum: ['safetensors', 'onnx'], required: true },

    /** Metrics broken out per input form — the fairness check is a stored
        number, not a paragraph in a report (step 27). */
    metrics: { type: Schema.Types.Mixed },
    metricsByInputForm: { type: Schema.Types.Mixed },
    baselineComparison: { type: Schema.Types.Mixed },

    trainingConfig: { type: Schema.Types.Mixed },
    datasetSnapshotId: { type: String, maxlength: 64 },
    modelCardPath: { type: String, maxlength: 400 },

    registeredByStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    promotedByStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    promotedAt: { type: Date },
    rolledBackAt: { type: Date },
    notes: longText,
  },
  baseOptions,
);

modelVersionSchema.index({ kind: 1, version: 1 }, { unique: true });
/* "Which model is live for this kind?" — asked on every inference path. */
modelVersionSchema.index({ kind: 1, stage: 1 });

export type ModelVersionDoc = ModelVersionRecord;
export const ModelVersion = model('ModelVersion', modelVersionSchema, 'model_versions');

/* ── Counters ───────────────────────────────────────────────────────────── */

export interface CounterRecord {
  _id: string;
  value: number;
}

/**
 * Monotonic sequences, for anything a human has to read out loud.
 *
 * A ticket reference is quoted on the phone, so it cannot be a 24-character
 * hex id. It has to be short, unambiguous, and allocated exactly once under
 * concurrency — which rules out `count() + 1` (two requests read the same
 * count) and `max(reference) + 1` (same race, plus a collection scan).
 *
 * `findOneAndUpdate` with `$inc` and `upsert` is atomic in a single document,
 * which is the one guarantee MongoDB gives without a transaction. The returned
 * value is the allocated number and belongs to exactly one caller.
 *
 * Gaps are expected and fine: a request that allocates a number and then fails
 * leaves a hole. A reference is an identifier, not a count, and a sequence
 * that never gaps would need to be handed back on failure — which is a
 * distributed lock to avoid a cosmetic property nobody relies on.
 */
const counterSchema = new Schema<CounterRecord>(
  {
    /** The sequence name, e.g. `ticket`. */
    _id: { type: String, required: true },
    value: { type: Number, required: true, default: 0, min: 0 },
  },
  { versionKey: false, timestamps: false, strict: 'throw' as const },
);

export const Counter = model('Counter', counterSchema, 'counters');
