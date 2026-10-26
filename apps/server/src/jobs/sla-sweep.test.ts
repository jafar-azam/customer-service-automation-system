import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Attachment, AuditLog, Contract, Customer, StaffUser, Ticket } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { hashPassword } from '../services/auth/password.js';
import { InMemoryStorage } from '../services/providers/storage.js';
import { MockMessagingProvider } from '../services/providers/messaging.js';
import { silentLogger } from '../test-support.js';
import { assignUnowned, sweepRetention, sweepSla } from './sla-sweep.js';

const logger = silentLogger();
const messaging = new MockMessagingProvider(logger, { revealCodes: false });

beforeAll(async () => {
  await startTestDatabase();
}, 180_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

async function makeTicket(overrides: Record<string, unknown> = {}) {
  const customer = await Customer.create({
    name: 'Demo Person',
    phoneHash: `h${String(Math.random())}`,
    phoneEncrypted: 'x',
    status: 'active',
  });
  const contract = await Contract.create({
    customerId: customer._id,
    reference: `CT-${String(Math.random()).slice(2, 10)}`,
    tier: 'standard',
    status: 'active',
    startDate: new Date(Date.now() - 86_400_000),
    endDate: new Date(Date.now() + 86_400_000),
  });

  return Ticket.create({
    reference: `CSAS-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
    customerId: customer._id,
    contractId: contract._id,
    subject: 'Printer stopped',
    status: 'open',
    priority: 'high',
    inputForm: 'english',
    sla: { pausedMs: 0 },
    reopenedCount: 0,
    statusHistory: [{ status: 'open', at: new Date(), byCustomer: true }],
    ...overrides,
  });
}

const ago = (ms: number) => new Date(Date.now() - ms);

/* ── Breach ─────────────────────────────────────────────────────────────── */

describe('the SLA sweep', () => {
  it('escalates a ticket past its first-response deadline', async () => {
    const ticket = await makeTicket({ sla: { pausedMs: 0, firstResponseDueAt: ago(60_000) } });

    const result = await sweepSla(logger, messaging);

    expect(result.breached).toBe(1);
    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated?.status).toBe('escalated');
    expect(updated?.sla.breachedAt).toBeInstanceOf(Date);
    expect(updated?.statusHistory.at(-1)?.note).toContain('first-response target missed');
  });

  /* A queue redelivers on a crash, two instances overlap during a deploy, and
     an operator will run one by hand. Every write is guarded by the absence
     of the mark it sets — in the query, not in a prior read. */
  it('is safe to run twice', async () => {
    await makeTicket({ sla: { pausedMs: 0, firstResponseDueAt: ago(60_000) } });

    const first = await sweepSla(logger, messaging);
    const second = await sweepSla(logger, messaging);

    expect(first.breached).toBe(1);
    expect(second.breached).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'ticket.escalated' })).toBe(1);
  });

  /* The promise is about our response, not theirs. */
  it('does not breach a ticket whose paused time covers the overrun', async () => {
    await makeTicket({
      sla: { pausedMs: 10 * 60_000, firstResponseDueAt: ago(60_000) },
    });

    expect((await sweepSla(logger, messaging)).breached).toBe(0);
  });

  it('warns before the deadline without escalating', async () => {
    const ticket = await makeTicket({
      sla: {
        pausedMs: 0,
        firstResponseWarnAt: ago(60_000),
        firstResponseDueAt: new Date(Date.now() + 3_600_000),
      },
    });

    const result = await sweepSla(logger, messaging);

    expect(result.warned).toBe(1);
    expect(result.breached).toBe(0);
    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated?.status).toBe('open');
    expect(updated?.sla.warningSentAt).toBeInstanceOf(Date);
  });

  it('warns only once', async () => {
    await makeTicket({
      sla: {
        pausedMs: 0,
        firstResponseWarnAt: ago(60_000),
        firstResponseDueAt: new Date(Date.now() + 3_600_000),
      },
    });

    await sweepSla(logger, messaging);
    expect((await sweepSla(logger, messaging)).warned).toBe(0);
  });

  /* The clock stops at the first reply; a ticket already answered is not
     waiting for a first response however long it stays open. */
  it('ignores a ticket that has already been answered', async () => {
    await makeTicket({
      sla: { pausedMs: 0, firstResponseDueAt: ago(60_000), firstRespondedAt: ago(120_000) },
    });

    expect((await sweepSla(logger, messaging)).breached).toBe(0);
  });

  it('ignores resolved and closed tickets', async () => {
    for (const status of ['resolved', 'closed'] as const) {
      await makeTicket({ status, sla: { pausedMs: 0, firstResponseDueAt: ago(60_000) } });
    }
    expect((await sweepSla(logger, messaging)).breached).toBe(0);
  });
});

/* ── Assignment ─────────────────────────────────────────────────────────── */

describe('automatic assignment', () => {
  async function agents(count: number) {
    const made = [];
    for (let index = 0; index < count; index += 1) {
      made.push(
        await StaffUser.create({
          email: `agent${String(index)}@csas.test`,
          name: `Agent ${String(index)}`,
          role: 'agent',
          status: 'active',
          passwordHash: await hashPassword('fourteen purple lanterns upstairs'), // secret-scan:allow
        }),
      );
    }
    return made;
  }

  it('gives an unowned ticket an owner', async () => {
    await agents(2);
    const ticket = await makeTicket();

    expect(await assignUnowned(logger)).toBe(1);
    expect((await Ticket.findById(ticket._id).lean())?.assignedStaffId).toBeTruthy();
  });

  /* Recomputed per ticket: assigning from one snapshot would give all of them
     to the same least-loaded agent. */
  it('spreads several tickets across the agents', async () => {
    await agents(3);
    for (let index = 0; index < 3; index += 1) await makeTicket();

    await assignUnowned(logger);

    const assigned = await Ticket.find({}).select('assignedStaffId').lean();
    const owners = new Set(assigned.map((row) => String(row.assignedStaffId)));
    expect(owners.size).toBe(3);
  });

  it('leaves an already-assigned ticket alone', async () => {
    const [agent] = await agents(2);
    const ticket = await makeTicket({ assignedStaffId: agent?._id, assignedAt: new Date() });

    await assignUnowned(logger);
    expect(String((await Ticket.findById(ticket._id).lean())?.assignedStaffId)).toBe(
      String(agent?._id),
    );
  });

  /* A disabled account must never appear in a rota. */
  it('never assigns to a disabled agent', async () => {
    await StaffUser.create({
      email: 'gone@csas.test',
      name: 'Departed',
      role: 'agent',
      status: 'disabled',
      passwordHash: await hashPassword('fourteen purple lanterns upstairs'), // secret-scan:allow
    });
    await makeTicket();

    expect(await assignUnowned(logger)).toBe(0);
  });

  it('does nothing, quietly, when there are no agents at all', async () => {
    await makeTicket();
    expect(await assignUnowned(logger)).toBe(0);
  });
});

/* ── Retention ──────────────────────────────────────────────────────────── */

describe('the retention sweep', () => {
  const storage = new InMemoryStorage();

  async function attachment(deleteAfter: Date) {
    const ticket = await makeTicket();
    const key = `aa/${String(Math.random()).slice(2)}`;
    await storage.put(key, Buffer.from('bytes'));
    return Attachment.create({
      ticketId: ticket._id,
      customerId: ticket.customerId,
      storageKey: key,
      detectedMimeType: 'image/png',
      byteSize: 5,
      checksumSha256: 'a'.repeat(64),
      scan: { status: 'clean' },
      sanitized: true,
      deleteAfter,
    });
  }

  /* The bytes go first and the record is marked afterwards. The other order
     marks a file deleted that is still on disk, and nothing comes back. */
  it('deletes the bytes, then marks the record', async () => {
    const row = await attachment(ago(1000));
    const key = row.storageKey;

    expect(await sweepRetention(logger, storage)).toBe(1);
    expect(await storage.exists(key)).toBe(false);
    expect((await Attachment.findById(row._id).lean())?.deletedAt).toBeInstanceOf(Date);
  });

  it('leaves an attachment whose window is still open', async () => {
    await attachment(new Date(Date.now() + 86_400_000));
    expect(await sweepRetention(logger, storage)).toBe(0);
  });

  it('is safe to run twice', async () => {
    await attachment(ago(1000));
    expect(await sweepRetention(logger, storage)).toBe(1);
    expect(await sweepRetention(logger, storage)).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'attachment.deleted' })).toBe(1);
  });

  /* One unreadable file must not stop the sweep, and the record stays
     undeleted so it is still visible. */
  it('carries on past a storage failure', async () => {
    const broken = {
      delete: () => Promise.reject(new Error('disk gone')),
    } as unknown as InMemoryStorage;

    const row = await attachment(ago(1000));
    expect(await sweepRetention(logger, broken)).toBe(0);
    expect((await Attachment.findById(row._id).lean())?.deletedAt).toBeUndefined();
  });
});
