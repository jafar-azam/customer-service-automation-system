import { z } from 'zod';

/**
 * The vocabulary the whole system shares.
 *
 * It lives in `packages/shared` because the client, the server and the test
 * suites must agree on these strings exactly. A status spelled `in_progress` in
 * one place and `inProgress` in another is a bug that type-checking cannot see
 * when each side declares its own copy.
 *
 * Every value is a lower_snake string rather than a number: a database document
 * that says `"awaiting_customer"` is readable in Compass by someone who has
 * never seen this file, and a numeric enum silently changes meaning the day
 * somebody inserts a value in the middle.
 */

/* ── People ─────────────────────────────────────────────────────────────── */

/**
 * The reference EERD has one `Users` entity specialised into `Customer` and
 * `Employee`. The specification splits `Employee` into agent and admin, because
 * they need different authority: an agent works tickets, an admin approves
 * knowledge-base entries, promotes models, exports data and changes roles.
 */
export const STAFF_ROLES = ['agent', 'admin'] as const;
export const staffRole = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof staffRole>;

/** Deactivated staff keep their audit history; they simply cannot sign in. */
export const ACCOUNT_STATUSES = ['active', 'disabled'] as const;
export const accountStatus = z.enum(ACCOUNT_STATUSES);
export type AccountStatus = z.infer<typeof accountStatus>;

/* ── Contracts ──────────────────────────────────────────────────────────── */

/**
 * `pending` exists because a contract can be recorded before it starts, and the
 * sequence diagram's "contract active?" gate must answer "not yet" differently
 * from "expired" — the customer-facing explanation is not the same.
 */
export const CONTRACT_STATUSES = ['pending', 'active', 'expired', 'cancelled'] as const;
export const contractStatus = z.enum(CONTRACT_STATUSES);
export type ContractStatus = z.infer<typeof contractStatus>;

/** Tiers drive SLA targets (step 14), not feature access. */
export const CONTRACT_TIERS = ['basic', 'standard', 'premium'] as const;
export const contractTier = z.enum(CONTRACT_TIERS);
export type ContractTier = z.infer<typeof contractTier>;

/* ── Tickets ────────────────────────────────────────────────────────────── */

/**
 * `awaiting_customer` is the status that makes the SLA honest: the clock pauses
 * while the system is waiting for a person who is not us. Without it, every
 * slow customer becomes an SLA breach attributed to the support team.
 */
export const TICKET_STATUSES = [
  'open',
  'assistant_answering',
  'awaiting_customer',
  'escalated',
  'in_progress',
  'resolved',
  'closed',
  'reopened',
] as const;
export const ticketStatus = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof ticketStatus>;

/** Matches the `Priority` column of the reference CSV (High/Medium/Low). */
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const priority = z.enum(PRIORITIES);
export type Priority = z.infer<typeof priority>;

export const MESSAGE_AUTHORS = ['customer', 'assistant', 'agent', 'system'] as const;
export const messageAuthor = z.enum(MESSAGE_AUTHORS);
export type MessageAuthor = z.infer<typeof messageAuthor>;

export const MESSAGE_KINDS = ['text', 'voice'] as const;
export const messageKind = z.enum(MESSAGE_KINDS);
export type MessageKind = z.infer<typeof messageKind>;

/* ── The five input forms ───────────────────────────────────────────────── */

/**
 * The project's central claim is that all five are handled, and the only way to
 * defend it is to measure accuracy **per form**. So the form is a first-class
 * field on messages, dataset items and evaluation records — not a derived
 * guess made at reporting time.
 *
 * `unknown` is deliberate: detection is a classifier, and a classifier that is
 * forced to choose produces confident nonsense on a two-word message.
 */
export const INPUT_FORMS = [
  'lebanese_arabic',
  'arabizi',
  'code_switch',
  'msa',
  'english',
  'unknown',
] as const;
export const inputForm = z.enum(INPUT_FORMS);
export type InputForm = z.infer<typeof inputForm>;

/** The five that are actually reported on; `unknown` is an operational state. */
export const REPORTED_INPUT_FORMS = INPUT_FORMS.filter((form) => form !== 'unknown');

/* ── Knowledge base ─────────────────────────────────────────────────────── */

/**
 * The approval gate the reference sequence diagram does not have. There, a
 * resolution is written straight into the knowledge base; here an admin must
 * approve it first. That difference is the project's main defence against
 * teaching the assistant its own mistakes (OWASP LLM04).
 */
export const KB_STATUSES = ['draft', 'pending_review', 'approved', 'archived'] as const;
export const kbStatus = z.enum(KB_STATUSES);
export type KbStatus = z.infer<typeof kbStatus>;

/* ── Escalation and SLA ─────────────────────────────────────────────────── */

export const ESCALATION_REASONS = [
  'no_confident_answer',
  'customer_rejected_answer',
  'customer_requested_human',
  'sla_breach',
  'ai_unavailable',
] as const;
export const escalationReason = z.enum(ESCALATION_REASONS);
export type EscalationReason = z.infer<typeof escalationReason>;

export const ASSIGNMENT_STRATEGIES = ['round_robin', 'least_load'] as const;
export const assignmentStrategy = z.enum(ASSIGNMENT_STRATEGIES);
export type AssignmentStrategy = z.infer<typeof assignmentStrategy>;

/* ── Notifications ──────────────────────────────────────────────────────── */

export const NOTIFICATION_CHANNELS = ['whatsapp', 'sms', 'email', 'in_app'] as const;
export const notificationChannel = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof notificationChannel>;

/**
 * Delivery is three states, not two, because `messaging-lebanon.md` is explicit
 * that accepted-by-provider, delivered-to-handset and read are different facts
 * — and an OTP that was accepted but never delivered is the usual support
 * complaint.
 */
export const DELIVERY_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'suppressed',
] as const;
export const deliveryStatus = z.enum(DELIVERY_STATUSES);
export type DeliveryStatus = z.infer<typeof deliveryStatus>;

export const NOTIFICATION_KINDS = [
  'otp',
  'escalation',
  'ticket_resolved',
  'sla_warning',
  'contract_reminder',
  'contract_expired',
  'password_reset',
  'contact_received',
] as const;
export const notificationKind = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof notificationKind>;

/* ── Consent (PRIVACY.md §3) ────────────────────────────────────────────── */

/**
 * Separate purposes, separate permissions, each unchecked by default. The
 * research is explicit that support and AI training are different purposes and
 * that one does not carry the other.
 */
export const CONSENT_PURPOSES = ['voice_recording', 'ai_training'] as const;
export const consentPurpose = z.enum(CONSENT_PURPOSES);
export type ConsentPurpose = z.infer<typeof consentPurpose>;

/* ── Data pipeline and ML ───────────────────────────────────────────────── */

export const DATASET_SPLITS = ['train', 'validation', 'test', 'human_eval', 'unassigned'] as const;
export const datasetSplit = z.enum(DATASET_SPLITS);
export type DatasetSplit = z.infer<typeof datasetSplit>;

export const REVIEW_DECISIONS = ['approved', 'corrected', 'rejected'] as const;
export const reviewDecision = z.enum(REVIEW_DECISIONS);
export type ReviewDecision = z.infer<typeof reviewDecision>;

export const MODEL_STAGES = ['registered', 'shadow', 'production', 'archived'] as const;
export const modelStage = z.enum(MODEL_STAGES);
export type ModelStage = z.infer<typeof modelStage>;

export const MODEL_KINDS = ['intent_classifier', 'escalation_classifier', 'embedding'] as const;
export const modelKind = z.enum(MODEL_KINDS);
export type ModelKind = z.infer<typeof modelKind>;

/* ── Audit ──────────────────────────────────────────────────────────────── */

/**
 * A closed list, because an audit log with free-text action names cannot be
 * queried reliably when it matters — which is during an incident.
 */
export const AUDIT_ACTIONS = [
  'staff.login.succeeded',
  'staff.login.failed',
  'staff.logout',
  'staff.locked',
  'staff.password.reset_requested',
  'staff.password.reset_completed',
  'staff.totp.enrolled',
  'staff.totp.reset_by_admin',
  'staff.recovery_code.used',
  'staff.created',
  'staff.role_changed',
  'staff.disabled',
  'staff.break_glass_used',
  'customer.created',
  'customer.updated',
  'customer.disabled',
  'customer.otp.requested',
  'customer.otp.verified',
  'customer.otp.failed',
  'customer.data_exported',
  'customer.data_deleted',
  'contract.created',
  'contract.updated',
  'contract.expired',
  'ticket.escalated',
  'ticket.resolved',
  'ticket.reopened',
  'kb.created',
  'kb.submitted_for_review',
  'kb.approved',
  'kb.rejected',
  'kb.archived',
  'kb.imported',
  'model.registered',
  'model.promoted',
  'model.rolled_back',
  'dataset.exported',
  'consent.granted',
  'consent.withdrawn',
] as const;
export const auditAction = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditAction>;

/* ── Provenance (datasets.md) ───────────────────────────────────────────── */

/**
 * Every knowledge-base entry and dataset item carries where it came from and
 * whether it may be published. `publishable: false` is the flag step 37's
 * pre-publication audit looks for: if a record carrying it ever reaches a
 * committed file, the release fails.
 */
export const PROVENANCE_SOURCES = [
  'techqa',
  'seniordata_csv',
  'agent_authored',
  'generated',
  'human_collected',
] as const;
export const provenanceSource = z.enum(PROVENANCE_SOURCES);
export type ProvenanceSource = z.infer<typeof provenanceSource>;

export const provenance = z.object({
  source: provenanceSource,
  /** SPDX identifier, or `proprietary-local` for data that may never ship. */
  license: z.string().min(1),
  publishable: z.boolean(),
  /** Identifier in the source corpus, so any record can be traced back. */
  sourceRef: z.string().optional(),
  /** Groups paraphrases and translations of one incident, for leakage-safe splits. */
  lineageId: z.string().optional(),
  piiRedaction: z.enum(['not_required', 'pending', 'done', 'failed']).default('not_required'),
});
export type Provenance = z.infer<typeof provenance>;

export const PROPRIETARY_LOCAL_LICENSE = 'proprietary-local';
