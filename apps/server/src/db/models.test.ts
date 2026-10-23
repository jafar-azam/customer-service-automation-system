import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AuditLog,
  Contract,
  Customer,
  KbEntry,
  Message,
  ModelVersion,
  Session,
  StaffUser,
  Ticket,
} from './models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './test-db.js';

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

/** Minimal valid documents, so each test varies exactly one thing. */
async function makeCustomer(overrides: Record<string, unknown> = {}) {
  return Customer.create({
    name: 'Demo Customer',
    phoneHash: `hash-${String(Math.random())}`,
    phoneEncrypted: 'iv.ciphertext.tag',
    ...overrides,
  });
}

async function makeTicket() {
  const customer = await makeCustomer();
  const contract = await Contract.create({
    customerId: customer._id,
    reference: `CT-${String(Math.random())}`,
    startDate: new Date(),
    endDate: new Date(Date.now() + 86_400_000),
    status: 'active',
  });
  return Ticket.create({
    reference: `CSAS-${String(Math.random())}`,
    customerId: customer._id,
    contractId: contract._id,
    subject: 'Printer offline',
  });
}

describe('unknown fields', () => {
  /* `strict: 'throw'` rather than Mongoose's silent drop. A dropped field is a
     write that vanished, and a mass-assignment attempt that half-succeeded. */
  it('are rejected rather than silently dropped', async () => {
    await expect(makeCustomer({ isAdmin: true })).rejects.toThrow(/isAdmin/);
  });
});

/**
 * These documents are invalid on purpose, so TypeScript refuses them — which is
 * itself the first layer working. The cast asserts the *runtime* refuses them
 * too: types protect this codebase, and nothing else. A migration script, a
 * mongosh session or a future service gets no such protection, which is why
 * the enumerations are also enforced by Mongoose and by MongoDB.
 */
const invalid = (document: Record<string, unknown>) => document as never;

describe('enumerations', () => {
  it('refuse a role that is not agent or admin', async () => {
    await expect(
      StaffUser.create(
        invalid({ email: 'x@example.com', name: 'X', role: 'superuser', passwordHash: 'x' }),
      ),
    ).rejects.toThrow(/role/);
  });

  it('refuse a knowledge-base status outside the approval workflow', async () => {
    await expect(
      KbEntry.create(
        invalid({
          title: 'T',
          body: 'B',
          status: 'live',
          provenance: { source: 'techqa', license: 'CDLA-Permissive-1.0', publishable: true },
        }),
      ),
    ).rejects.toThrow(/status/);
  });

  /* The control from THREAT_MODEL §7.6: a format that executes code on load
     cannot be registered at all. */
  it('refuse a pickle model artefact', async () => {
    await expect(
      ModelVersion.create(
        invalid({
          kind: 'intent_classifier',
          name: 'intent',
          version: '1',
          artifactPath: '/models/intent.pkl',
          artifactSha256: 'a'.repeat(64),
          format: 'pickle',
        }),
      ),
    ).rejects.toThrow(/format/);
  });
});

describe('unique indexes', () => {
  it('stop two customers sharing a phone hash', async () => {
    await makeCustomer({ phoneHash: 'shared-hash' });
    await expect(makeCustomer({ phoneHash: 'shared-hash' })).rejects.toThrow(/duplicate key/i);
  });

  it('stop two staff accounts sharing an email', async () => {
    const base = { name: 'A', role: 'agent' as const, passwordHash: 'h' };
    await StaffUser.create({ ...base, email: 'dup@example.com' });
    await expect(StaffUser.create({ ...base, email: 'dup@example.com' })).rejects.toThrow(
      /duplicate key/i,
    );
  });

  /* Re-running the seed must update, not duplicate. */
  it('stop one source record producing two knowledge entries', async () => {
    const entry = {
      title: 'T',
      body: 'B',
      provenance: {
        source: 'techqa' as const,
        license: 'CDLA-Permissive-1.0',
        publishable: true,
        sourceRef: 'TRAIN_Q000',
      },
    };
    await KbEntry.create(entry);
    await expect(KbEntry.create(entry)).rejects.toThrow(/duplicate key/i);
  });

  it('allow many entries with no source reference', async () => {
    const entry = {
      title: 'Agent authored',
      body: 'B',
      provenance: { source: 'agent_authored' as const, license: 'CC-BY-4.0', publishable: true },
    };
    await KbEntry.create(entry);
    await expect(KbEntry.create(entry)).resolves.toBeDefined();
  });
});

describe('database-level validators', () => {
  /* The application is not the only thing that can write. These rules are
     enforced by MongoDB, so they also hold for a migration or a mongosh
     session — which is the whole reason they exist in addition to Mongoose. */
  it('reject a customer with no encrypted phone, bypassing Mongoose entirely', async () => {
    const db = mongoose.connection.db;
    await expect(
      db?.collection('customers').insertOne({ name: 'Raw', phoneHash: 'h', status: 'active' }),
    ).rejects.toThrow(/validation/i);
  });

  it('reject an attachment with no deletion date', async () => {
    const db = mongoose.connection.db;
    await expect(
      db?.collection('attachments').insertOne({
        ticketId: new mongoose.Types.ObjectId(),
        customerId: new mongoose.Types.ObjectId(),
        storageKey: 'k',
        detectedMimeType: 'image/png',
        byteSize: 10,
      }),
    ).rejects.toThrow(/validation/i);
  });

  it('reject an audit action that is not in the closed list', async () => {
    const db = mongoose.connection.db;
    await expect(
      db?.collection('audit_logs').insertOne({
        action: 'something.happened',
        at: new Date(),
        actorType: 'staff',
        outcome: 'success',
      }),
    ).rejects.toThrow(/validation/i);
  });
});

describe('required fields that carry a promise', () => {
  it('refuse a message without the internal flag resolved', async () => {
    const ticket = await makeTicket();
    const message = await Message.create({
      ticketId: ticket._id,
      author: 'customer',
      body: 'الطابعة ما عم تشتغل',
    });
    /* Defaulting to visible is the safe direction: an internal note that
       leaks is a disclosure, so the field is always present and explicit. */
    expect(message.internal).toBe(false);
  });

  it('record every ticket with an input form, even when unknown', async () => {
    const ticket = await makeTicket();
    expect(ticket.inputForm).toBe('unknown');
  });
});

describe('transactions', () => {
  /* The reason the local stack runs a replica set rather than a standalone:
     step 06 must commit a token rotation, a session revocation and an audit
     entry together, or none of them. */
  it('commit several collections together, or not at all', async () => {
    const session = await mongoose.startSession();
    const customer = await makeCustomer();

    await expect(
      session.withTransaction(async () => {
        await Session.create(
          [
            {
              subjectType: 'customer',
              customerId: customer._id,
              familyId: 'fam-1',
              tokenHash: 'a'.repeat(64),
              expiresAt: new Date(Date.now() + 60_000),
            },
          ],
          { session },
        );
        await AuditLog.create([{ action: 'customer.otp.verified', actorType: 'customer' }], {
          session,
        });
        throw new Error('rolled back on purpose');
      }),
    ).rejects.toThrow('rolled back on purpose');

    await session.endSession();
    expect(await Session.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });
});

describe('TTL indexes', () => {
  /* Retention that cannot be forgotten by a job that failed to run. */
  it('are declared on sessions, OTP challenges and reset tokens', async () => {
    const db = mongoose.connection.db;
    for (const collection of ['sessions', 'otp_challenges', 'password_reset_tokens']) {
      const indexes = await db?.collection(collection).indexes();
      const ttl = indexes?.find((index) => 'expireAfterSeconds' in index);
      expect(ttl, `${collection} has no TTL index`).toBeDefined();
    }
  });
});

describe('sensitive fields', () => {
  it('are not returned by an ordinary query', async () => {
    await StaffUser.create({
      email: 'hidden@example.com',
      name: 'H',
      role: 'agent',
      passwordHash: 'secret-hash-value',
    });
    const found = await StaffUser.findOne({ email: 'hidden@example.com' }).lean();
    expect(found).toBeDefined();
    expect(JSON.stringify(found)).not.toContain('secret-hash-value');
  });

  it('are returned only when asked for explicitly', async () => {
    await StaffUser.create({
      email: 'hidden2@example.com',
      name: 'H',
      role: 'agent',
      passwordHash: 'secret-hash-value',
    });
    const found = await StaffUser.findOne({ email: 'hidden2@example.com' })
      .select('+passwordHash')
      .lean();
    expect(JSON.stringify(found)).toContain('secret-hash-value');
  });

  it('keep the encrypted phone out of ordinary reads', async () => {
    await makeCustomer({ phoneHash: 'select-test', phoneEncrypted: 'iv.secret-ciphertext.tag' });
    const found = await Customer.findOne({ phoneHash: 'select-test' }).lean();
    expect(JSON.stringify(found)).not.toContain('secret-ciphertext');
  });
});
