import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog, Contract, Customer, KbEntry, StaffUser } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { PhoneCipher } from '../crypto/phone.js';
import { silentLogger, testEnv } from '../test-support.js';
import { seedAdmin, seedDemoData, DEMO_CUSTOMERS } from './seed.js';
import { importTechQa, loadTechQaInstances } from './techqa.js';
import { buildTags, buildTitle, importSeniordata, parseSeniordata } from './seniordata.js';

const logger = silentLogger();
const env = testEnv({ DEMO_MODE: 'true', DEMO_ADMIN_TOTP_SECRET: 'A'.repeat(32) });
const context = { env, logger };

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

describe('seeding the first admin', () => {
  it('creates one from the environment', async () => {
    const result = await seedAdmin(context);
    expect(result.created).toBe(true);

    const admin = await StaffUser.findOne({ role: 'admin' })
      .select('+passwordHash')
      .lean<{ email: string; passwordHash: string } | null>();
    expect(admin?.email).toBe(env.SEED_ADMIN_EMAIL.toLowerCase());
    /* Argon2id, not a plaintext password and not a fast hash. */
    expect(admin?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('records the creation in the audit log', async () => {
    await seedAdmin(context);
    const entry = await AuditLog.findOne({ action: 'staff.created' }).lean();
    expect(entry?.actorType).toBe('system');
  });

  /* The rule the whole script is built around. */
  it('is idempotent and never re-applies the seed password', async () => {
    await seedAdmin(context);
    const before = await StaffUser.findOne({ role: 'admin' }).select('+passwordHash').lean();

    await StaffUser.updateOne({ role: 'admin' }, { $set: { passwordHash: 'changed-by-the-user' } });
    const second = await seedAdmin(context);

    expect(second.created).toBe(false);
    const after = await StaffUser.findOne({ role: 'admin' }).select('+passwordHash').lean();
    /* A seed that reset the password on every boot would silently revert a
       password change — and reinstate a credential the user had rotated away. */
    expect(after?.passwordHash).toBe('changed-by-the-user');
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
    expect(await StaffUser.countDocuments({ role: 'admin' })).toBe(1);
  });

  it('leaves an existing admin alone even under a different email', async () => {
    await StaffUser.create({
      email: 'someone.else@example.com',
      name: 'Existing',
      role: 'admin',
      passwordHash: 'x',
    });
    const result = await seedAdmin(context);
    expect(result.created).toBe(false);
    expect(await StaffUser.countDocuments({ role: 'admin' })).toBe(1);
  });
});

describe('demo data', () => {
  it('creates the three contract states a reviewer needs to see', async () => {
    await seedDemoData(context);
    expect(await Customer.countDocuments()).toBe(DEMO_CUSTOMERS.length);

    const statuses = (await Contract.find().lean()).map((c) => c.status).sort();
    /* Active, expiring and expired: the sequence diagram's "contract inactive"
       branch needs a customer it is actually true for. */
    expect(statuses).toEqual(['active', 'active', 'expired']);
  });

  it('stores demo phone numbers encrypted and hashed, never in the clear', async () => {
    await seedDemoData(context);
    const customer = await Customer.findOne({ name: 'Rania Haddad' })
      .select('+phoneEncrypted')
      .lean<{ phoneEncrypted: string; phoneHash: string } | null>();

    expect(JSON.stringify(customer)).not.toContain('70100001');
    const cipher = new PhoneCipher({
      encryptionKey: env.PHONE_ENCRYPTION_KEY,
      hashPepper: env.PHONE_HASH_PEPPER,
    });
    expect(cipher.decrypt(customer?.phoneEncrypted ?? '')).toBe('+96170100001');
    expect(customer?.phoneHash).toBe(cipher.hash('+96170100001'));
  });

  it('runs twice without duplicating anyone', async () => {
    await seedDemoData(context);
    await seedDemoData(context);
    expect(await Customer.countDocuments()).toBe(DEMO_CUSTOMERS.length);
    expect(await Contract.countDocuments()).toBe(DEMO_CUSTOMERS.length);
  });

  it('keeps the same ciphertext across re-seeds', async () => {
    await seedDemoData(context);
    const first = await Customer.findOne({ name: 'Rania Haddad' }).select('+phoneEncrypted').lean();
    await seedDemoData(context);
    const second = await Customer.findOne({ name: 'Rania Haddad' })
      .select('+phoneEncrypted')
      .lean();
    expect(second?.phoneEncrypted).toBe(first?.phoneEncrypted);
  });
});

/* ── TechQA ─────────────────────────────────────────────────────────────── */

async function writeTechQaFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'csas-techqa-'));
  await mkdir(join(root, 'training_and_dev'), { recursive: true });
  await writeFile(
    join(root, 'training_and_dev/training_Q_A.json'),
    JSON.stringify([
      {
        QUESTION_ID: 'TRAIN_Q000',
        QUESTION_TITLE: 'Environment variables not picked up after upgrade',
        QUESTION_TEXT: 'After upgrading, variables set in .bashrc are no longer applied.',
        ANSWER: 'Set the variables on the instance with streamtool setproperty.',
        ANSWERABLE: 'Y',
        DOCUMENT: 'swg21996508',
      },
      {
        QUESTION_ID: 'TRAIN_Q001',
        QUESTION_TITLE: 'No answer exists for this one',
        QUESTION_TEXT: 'A question the corpus cannot answer.',
        ANSWER: '',
        ANSWERABLE: 'N',
        DOCUMENT: '-',
      },
    ]),
  );
  return root;
}

describe('the TechQA importer', () => {
  it('keeps only the answerable instances', async () => {
    const instances = await loadTechQaInstances(await writeTechQaFixture());
    expect(instances).toHaveLength(1);
    expect(instances[0]?.questionId).toBe('TRAIN_Q000');
  });

  it('imports them as approved, publishable, licensed entries', async () => {
    const root = await writeTechQaFixture();
    const result = await importTechQa({ root, logger, withMetadata: false });
    expect(result.inserted).toBe(1);

    const entry = await KbEntry.findOne({ 'provenance.sourceRef': 'TRAIN_Q000' }).lean();
    expect(entry?.status).toBe('approved');
    expect(entry?.provenance.license).toBe('CDLA-Permissive-1.0');
    expect(entry?.provenance.publishable).toBe(true);
    /* The answer document groups every question it answers, so a split cannot
       separate two questions about the same technote. */
    expect(entry?.provenance.lineageId).toBe('swg21996508');
    /* Upstream anonymization was never verified (datasets.md), and the record
       says so rather than implying the text is clean. */
    expect(entry?.provenance.piiRedaction).toBe('pending');
  });

  it('updates rather than duplicating when run twice', async () => {
    const root = await writeTechQaFixture();
    await importTechQa({ root, logger, withMetadata: false });
    const second = await importTechQa({ root, logger, withMetadata: false });
    expect(second.inserted).toBe(0);
    expect(await KbEntry.countDocuments()).toBe(1);
  });

  /* The approval gate is the project's main defence against teaching the
     assistant its own mistakes. A re-import that resurrects an entry an admin
     archived would defeat it silently — the entry would simply be back, and
     approved, with nobody notified. */
  it('never overwrites a decision an admin has made', async () => {
    const root = await writeTechQaFixture();
    await importTechQa({ root, logger, withMetadata: false });

    await KbEntry.updateOne(
      { 'provenance.sourceRef': 'TRAIN_Q000' },
      { $set: { status: 'archived', reviewNote: 'wrong for our product' } },
    );

    await importTechQa({ root, logger, withMetadata: false });

    const entry = await KbEntry.findOne({ 'provenance.sourceRef': 'TRAIN_Q000' }).lean();
    expect(entry?.status).toBe('archived');
    expect(entry?.reviewNote).toBe('wrong for our product');
  });

  it('still refreshes the text from the source corpus', async () => {
    const root = await writeTechQaFixture();
    await importTechQa({ root, logger, withMetadata: false });
    await KbEntry.updateOne(
      { 'provenance.sourceRef': 'TRAIN_Q000' },
      { $set: { body: 'stale text' } },
    );

    await importTechQa({ root, logger, withMetadata: false });

    const entry = await KbEntry.findOne({ 'provenance.sourceRef': 'TRAIN_Q000' }).lean();
    /* The corpus stays authoritative for content; the admin stays
       authoritative for whether the assistant may use it. */
    expect(entry?.body).toContain('streamtool setproperty');
  });

  it('says so rather than failing when the corpus is absent', async () => {
    const result = await importTechQa({ root: '/nonexistent', logger, withMetadata: false });
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0, withMetadata: 0 });
  });
});

/* ── seniordata.csv ─────────────────────────────────────────────────────── */

/**
 * Entirely invented, in this product's own domain.
 *
 * An earlier version of this fixture was copied from the real export with the
 * name changed, which left a genuine resolution sentence in a tracked file —
 * `npm run scan:personal-data` caught it. A fixture only needs the *shape* of
 * the real file: the same columns, a row that imports and a row that must be
 * skipped.
 */
const CSV = `RecordID,CustomerInteractionRawText,AgentAssignedTopic,TopicCategory,ResolutionText,Priority,FollowUpRequired
1890041,"Stock counts in the warehouse module stopped syncing overnight.",Port Out,Account Management,"Re-ran the nightly sync job and corrected the timezone on the scheduler.",High,Yes
1890042,"Asked how to add a second till to the licence.",Billing,Finance,"",Low,No
`;

describe('the seniordata importer', () => {
  it('maps the columns the specification lists', () => {
    const { rows } = parseSeniordata(CSV);
    expect(rows).toHaveLength(2);
    expect(buildTitle(rows[0] ?? {})).toBe('Port Out — Account Management');
    expect(buildTags(rows[0] ?? {})).toEqual(['source-priority:high', 'source-followup']);
  });

  /* The real file ends mid-field. Before this was handled, one truncated line
     at the end of an optional input aborted the entire seed. */
  it('survives a file that ends inside an open quote', () => {
    const truncated = `${CSV}1890043,"Customer asked about a plan and the export stopped mid`;
    const { rows, truncatedAfter } = parseSeniordata(truncated);
    expect(rows).toHaveLength(2);
    expect(truncatedAfter).toBe(4);
  });

  it('flags every row unpublishable and leaves it unapproved', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'csas-csv-')), 'seniordata.csv');
    await writeFile(path, CSV);

    const result = await importSeniordata({ path, logger });
    /* The second row has no resolution: it is not knowledge, so it is dropped
       rather than imported as an empty entry somebody must later explain. */
    expect(result).toMatchObject({ rows: 2, inserted: 1, skipped: 1 });

    const entry = await KbEntry.findOne({ 'provenance.source': 'seniordata_csv' }).lean();
    /* The two properties that keep real business data out of a public
       repository and out of the assistant's mouth. */
    expect(entry?.provenance.publishable).toBe(false);
    expect(entry?.provenance.license).toBe('proprietary-local');
    expect(entry?.status).toBe('pending_review');
    expect(entry?.provenance.piiRedaction).toBe('pending');
  });

  it('never leaves an unpublishable row retrievable by the assistant', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'csas-csv-')), 'seniordata.csv');
    await writeFile(path, CSV);
    await importSeniordata({ path, logger });

    /* Retrieval only ever reads approved entries (step 15). */
    const approved = await KbEntry.countDocuments({
      status: 'approved',
      'provenance.publishable': false,
    });
    expect(approved).toBe(0);
  });

  it('does not return a rejected row to the review queue', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'csas-csv-')), 'seniordata.csv');
    await writeFile(path, CSV);
    await importSeniordata({ path, logger });

    await KbEntry.updateOne(
      { 'provenance.source': 'seniordata_csv' },
      { $set: { status: 'archived' } },
    );
    await importSeniordata({ path, logger });

    const entry = await KbEntry.findOne({ 'provenance.source': 'seniordata_csv' }).lean();
    expect(entry?.status).toBe('archived');
  });

  it('skips silently when the file is not present', async () => {
    const result = await importSeniordata({ path: '/nonexistent/seniordata.csv', logger });
    expect(result.rows).toBe(0);
  });
});
