import { Schema, model, type InferSchemaType } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  CONSENT_PURPOSES,
  CONTRACT_STATUSES,
  CONTRACT_TIERS,
  STAFF_ROLES,
} from '@csas/shared';
import { baseOptions, requiredString, shortString } from './shared.js';

/**
 * Who exists and what they are entitled to.
 *
 * Mapping from the reference EERD, recorded here rather than in prose so that a
 * reviewer holding the diagram can follow it:
 *
 *   Users + Employee  → `staff_users`   (split into agent/admin by `role`)
 *   Users + Customer  → `customers`
 *   contracts         → `contracts`     (+ tier, + status, + reminder state)
 *   Departments       → **dropped**     — one support desk; a department table
 *                                          with one row is a join nobody needs
 *   products_purchased→ `customers.products` (an array, not a table: there is no
 *                                          product entity to join to in this release)
 *
 * The EERD stores `password` on `Users`, which would put a credential on the
 * customer record. It is not here: customers authenticate with a one-time code
 * and have no password at all, which removes a whole class of breach.
 */

/* ── Staff ──────────────────────────────────────────────────────────────── */

const staffUserSchema = new Schema(
  {
    email: { ...requiredString, lowercase: true, trim: true, maxlength: 254 },
    name: { ...requiredString, maxlength: 120 },
    role: { type: String, enum: [...STAFF_ROLES], required: true, index: true },
    status: { type: String, enum: [...ACCOUNT_STATUSES], required: true, default: 'active' },

    /** Argon2id. The parameters are embedded in the string, so a later tuning
        change can be detected and the hash upgraded on next login (step 06). */
    passwordHash: { ...requiredString, select: false },
    passwordChangedAt: { type: Date, required: true, default: () => new Date() },

    /** Base32 TOTP secret, encrypted at rest with the same key as phones.
        Never returned by a query unless explicitly selected. */
    totpSecretEncrypted: { type: String, select: false },
    totpEnrolledAt: { type: Date },

    failedLoginCount: { type: Number, required: true, default: 0, min: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },

    /** Set by the break-glass procedure (step 07) so the next login is forced
        through a password change. */
    mustChangePassword: { type: Boolean, required: true, default: false },
  },
  baseOptions,
);

/* One account per address; the index is unique rather than a check in code,
   because two concurrent creates would both pass a check. */
staffUserSchema.index({ email: 1 }, { unique: true });
staffUserSchema.index({ role: 1, status: 1 });

export type StaffUserDoc = InferSchemaType<typeof staffUserSchema>;
export const StaffUser = model('StaffUser', staffUserSchema, 'staff_users');

/* ── Customers ──────────────────────────────────────────────────────────── */

const consentSchema = new Schema(
  {
    purpose: { type: String, enum: [...CONSENT_PURPOSES], required: true },
    granted: { type: Boolean, required: true },
    /** Which notice text they actually saw. A consent you cannot evidence is a
        consent you do not have (PRIVACY.md §3). */
    noticeVersion: { ...requiredString, maxlength: 32 },
    decidedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const customerSchema = new Schema(
  {
    name: { ...requiredString, maxlength: 120 },
    companyName: { type: String, maxlength: 160, trim: true },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },

    /**
     * The two-column scheme from PRIVACY.md §6: one reversible, one searchable.
     * `phoneHash` is what every lookup uses; `phoneEncrypted` is only decrypted
     * when a human needs to see the number.
     */
    phoneHash: { ...requiredString, select: true },
    phoneEncrypted: { ...requiredString, select: false },
    /** Last three digits, for support to confirm a number out loud without
        decrypting it. Not enough to dial. */
    phoneLast3: { type: String, maxlength: 3 },

    status: { type: String, enum: [...ACCOUNT_STATUSES], required: true, default: 'active' },
    preferredLanguage: { type: String, enum: ['ar', 'en'], required: true, default: 'ar' },

    /** EERD `products_purchased`, flattened. */
    products: { type: [shortString], default: [] },

    consents: { type: [consentSchema], default: [] },

    notificationPreferences: {
      whatsapp: { type: Boolean, required: true, default: true },
      email: { type: Boolean, required: true, default: false },
      /** Opt-out is honoured by the reminder jobs in step 31. */
      marketingOptOut: { type: Boolean, required: true, default: false },
    },

    createdByStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    lastLoginAt: { type: Date },
  },
  baseOptions,
);

/* The unique index is on the hash, never on the number: uniqueness is enforced
   without the database holding a plaintext column to enforce it against. */
customerSchema.index({ phoneHash: 1 }, { unique: true });
customerSchema.index({ status: 1, createdAt: -1 });
customerSchema.index({ name: 'text', companyName: 'text' });

export type CustomerDoc = InferSchemaType<typeof customerSchema>;
export const Customer = model('Customer', customerSchema, 'customers');

/* ── Contracts ──────────────────────────────────────────────────────────── */

const contractSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    reference: { ...requiredString, maxlength: 64 },
    tier: { type: String, enum: [...CONTRACT_TIERS], required: true, default: 'standard' },
    status: { type: String, enum: [...CONTRACT_STATUSES], required: true, default: 'pending' },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    details: { type: String, maxlength: 2000 },

    /**
     * Which reminders have already gone out, as days-before-expiry. Stored on
     * the contract rather than inferred from the notification log, because the
     * reminder job must be idempotent and a job that re-derives state from
     * another collection races with itself (step 31).
     */
    remindersSent: { type: [Number], default: [] },
    renewalRequestedAt: { type: Date },
  },
  baseOptions,
);

contractSchema.index({ reference: 1 }, { unique: true });
/* The entitlement check on every customer login: "an active contract for this
   customer covering today". This index is the one that has to be fast. */
contractSchema.index({ customerId: 1, status: 1, endDate: -1 });
/* The reminder sweep: contracts expiring soon, regardless of customer. */
contractSchema.index({ status: 1, endDate: 1 });

export type ContractDoc = InferSchemaType<typeof contractSchema>;
export const Contract = model('Contract', contractSchema, 'contracts');
