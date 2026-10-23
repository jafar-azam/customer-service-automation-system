import mongoose from 'mongoose';
import type { Logger } from 'pino';
import {
  AUDIT_ACTIONS,
  CONTRACT_STATUSES,
  KB_STATUSES,
  STAFF_ROLES,
  TICKET_STATUSES,
} from '@csas/shared';

/**
 * Database-level schema validation, as a second line behind Mongoose.
 *
 * Mongoose validates what the *application* writes. These validators are
 * enforced by MongoDB itself, so they also hold for a migration script, a
 * `mongosh` session, a restored backup being patched by hand, or a future
 * service that talks to the same database — every path that bypasses the
 * application entirely. The specification asks for schema validation, and
 * "validated by the ORM" would not be it.
 *
 * They are deliberately **thin**: required fields, types, and the enumerations
 * that carry security meaning (a role, a knowledge-base status). Duplicating
 * every Mongoose rule here would create two sources of truth that drift, and
 * the drift would surface as a write that passes validation in tests and fails
 * in production. The rule of thumb: if getting it wrong is a security or
 * integrity problem, it is here; if getting it wrong is a bug, Mongoose alone
 * is enough.
 *
 * `validationAction: 'error'` rejects the write. The alternative, `'warn'`,
 * logs and stores it anyway — which is how a collection ends up with documents
 * nobody believes are possible.
 */

type JsonSchema = Record<string, unknown>;

const objectId = { bsonType: 'objectId' };
const date = { bsonType: 'date' };
const string = { bsonType: 'string' };
const bool = { bsonType: 'bool' };

function collectionSchema(required: string[], properties: Record<string, JsonSchema>): JsonSchema {
  return {
    bsonType: 'object',
    required,
    properties,
    /* Not `additionalProperties: false`: a validator that rejects unknown
       fields makes every additive schema change a breaking migration, and
       Mongoose's `strict: 'throw'` already stops the application writing them. */
  };
}

export const COLLECTION_VALIDATORS: Record<string, JsonSchema> = {
  staff_users: collectionSchema(['email', 'name', 'role', 'status', 'passwordHash'], {
    email: string,
    name: string,
    role: { enum: [...STAFF_ROLES] },
    status: { enum: ['active', 'disabled'] },
    passwordHash: string,
  }),

  customers: collectionSchema(['name', 'phoneHash', 'phoneEncrypted', 'status'], {
    name: string,
    /* Both forms are required together. A customer with a lookup hash and no
       ciphertext is unreachable; one with ciphertext and no hash cannot log in.
       Either state is a bug that should never reach disk. */
    phoneHash: string,
    phoneEncrypted: string,
    status: { enum: ['active', 'disabled'] },
  }),

  contracts: collectionSchema(
    ['customerId', 'reference', 'tier', 'status', 'startDate', 'endDate'],
    {
      customerId: objectId,
      reference: string,
      status: { enum: [...CONTRACT_STATUSES] },
      startDate: date,
      endDate: date,
    },
  ),

  tickets: collectionSchema(
    ['reference', 'customerId', 'contractId', 'subject', 'status', 'priority'],
    {
      reference: string,
      customerId: objectId,
      contractId: objectId,
      status: { enum: [...TICKET_STATUSES] },
    },
  ),

  messages: collectionSchema(['ticketId', 'author', 'kind', 'body', 'internal'], {
    ticketId: objectId,
    author: { enum: ['customer', 'assistant', 'agent', 'system'] },
    body: string,
    /* An internal note that defaults to visible is a disclosure, so the field
       must exist on every document rather than being absent-and-assumed. */
    internal: bool,
  }),

  attachments: collectionSchema(
    ['ticketId', 'customerId', 'storageKey', 'detectedMimeType', 'byteSize', 'deleteAfter'],
    {
      ticketId: objectId,
      customerId: objectId,
      storageKey: string,
      detectedMimeType: string,
      byteSize: { bsonType: ['int', 'long', 'double'], minimum: 0 },
      /* Required, so an attachment can never be stored without an expiry — the
         retention promise is enforced by the schema, not by remembering. */
      deleteAfter: date,
    },
  ),

  kb_entries: collectionSchema(['title', 'body', 'status', 'version', 'provenance'], {
    title: string,
    body: string,
    /* The enumeration that decides what the assistant may say. */
    status: { enum: [...KB_STATUSES] },
    version: { bsonType: ['int', 'long', 'double'], minimum: 1 },
    provenance: {
      bsonType: 'object',
      required: ['source', 'license', 'publishable'],
      properties: { license: string, publishable: bool },
    },
  }),

  dataset_items: collectionSchema(
    ['text', 'inputForm', 'language', 'split', 'reviewStatus', 'provenance'],
    {
      text: string,
      split: { enum: ['train', 'validation', 'test', 'human_eval', 'unassigned'] },
      reviewStatus: { enum: ['pending', 'approved', 'corrected', 'rejected'] },
      provenance: {
        bsonType: 'object',
        required: ['source', 'license', 'publishable'],
        properties: { publishable: bool },
      },
    },
  ),

  sessions: collectionSchema(['subjectType', 'familyId', 'tokenHash', 'expiresAt'], {
    subjectType: { enum: ['staff', 'customer'] },
    familyId: string,
    tokenHash: string,
    expiresAt: date,
  }),

  otp_challenges: collectionSchema(['phoneHash', 'codeHash', 'channel', 'expiresAt', 'attempts'], {
    phoneHash: string,
    codeHash: string,
    expiresAt: date,
    attempts: { bsonType: ['int', 'long', 'double'], minimum: 0 },
  }),

  audit_logs: collectionSchema(['action', 'at', 'actorType', 'outcome'], {
    /* A closed list: an audit log with free-text actions cannot be queried
       during the incident it exists for. */
    action: { enum: [...AUDIT_ACTIONS] },
    at: date,
    actorType: { enum: ['staff', 'customer', 'system'] },
    outcome: { enum: ['success', 'failure'] },
  }),

  notifications: collectionSchema(
    ['kind', 'channel', 'recipientMasked', 'templateKey', 'status', 'idempotencyKey'],
    {
      recipientMasked: string,
      idempotencyKey: string,
    },
  ),

  model_versions: collectionSchema(
    ['kind', 'name', 'version', 'stage', 'artifactPath', 'artifactSha256', 'format'],
    {
      artifactSha256: string,
      /* No pickle. The enumeration is the control: a format that permits
         arbitrary code execution on load cannot be registered at all. */
      format: { enum: ['safetensors', 'onnx'] },
    },
  ),
};

/**
 * Applies every validator, creating the collection if it does not exist.
 *
 * Idempotent, and safe on a database that already holds data: `collMod` changes
 * the rule for future writes and does not retroactively reject existing
 * documents. Run from `npm run seed`.
 */
export async function applyValidators(logger: Logger): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('applyValidators: not connected');

  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );

  for (const [name, schema] of Object.entries(COLLECTION_VALIDATORS)) {
    const options = {
      validator: { $jsonSchema: schema },
      /* `strict`, not `moderate`: moderate exempts documents that were already
         invalid when the rule was added, which is exactly the population a
         validator is meant to stop growing. This database starts empty, so
         there is nothing to grandfather in. */
      validationLevel: 'strict',
      validationAction: 'error',
    };

    if (existing.has(name)) {
      await db.command({ collMod: name, ...options });
      continue;
    }

    try {
      await db.createCollection(name, options);
    } catch (error) {
      /* NamespaceExists (48). The listing above is a snapshot, and Mongoose
         creates a collection the moment a model is first used — so between
         reading the list and acting on it, the collection can appear. Falling
         back to collMod makes the function safe to run against a database in
         any state, which is what "idempotent" has to mean for a seed. */
      if ((error as { code?: number }).code !== 48) throw error;
      await db.command({ collMod: name, ...options });
    }
  }

  logger.info({ collections: Object.keys(COLLECTION_VALIDATORS).length }, 'validators applied');
}
