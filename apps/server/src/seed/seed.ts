import { hash } from '@node-rs/argon2';
import type { Logger } from 'pino';
import type { Env } from '@csas/shared';
import { normalizePhone } from '@csas/shared';
import { maskEmail } from '../observability/logger.js';
import { PhoneCipher } from '../crypto/phone.js';
import { AuditLog, Contract, Customer, StaffUser } from '../db/models/index.js';

/**
 * Seeding, with one rule above all others: **it never deletes anything.**
 *
 * A seed script that wipes before writing is the most common way to lose a
 * local database, and the habit transfers to environments where it is not
 * recoverable. Everything here is an upsert or a create-if-absent, so running
 * it twice is the same as running it once, and running it on a database with
 * real data in it changes nothing that was not seeded.
 */

/**
 * Argon2id parameters.
 *
 * OWASP's current guidance for Argon2id is 19 MiB of memory with 2 iterations
 * and parallelism 1, as one of several accepted configurations. Memory is the
 * parameter that matters against GPU attack, so it is raised to 64 MiB here:
 * at a handful of staff logins there is no throughput concern, and the cost of
 * a cracked staff password is the whole system.
 *
 * The parameters are stored inside the hash string, so a future change is
 * detectable and step 06 can re-hash on next successful login.
 */
export const ARGON2_OPTIONS = {
  algorithm: 2 as const /* Argon2id */,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
};

export interface SeedContext {
  readonly env: Env;
  readonly logger: Logger;
}

export interface AdminSeedResult {
  readonly created: boolean;
  readonly email: string;
}

/**
 * Creates the first admin from the environment, once.
 *
 * If **any** admin already exists the function does nothing — not even a
 * password reset. Re-applying `SEED_ADMIN_PASSWORD` on every boot would mean a
 * password changed through the application is silently reverted by the next
 * restart, which is both a surprise and a way to reinstate a compromised
 * credential.
 */
export async function seedAdmin({ env, logger }: SeedContext): Promise<AdminSeedResult> {
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const existing = await StaffUser.findOne({ role: 'admin' })
    .select('_id email')
    .lean<{ _id: unknown; email: string } | null>();

  if (existing) {
    /* `emailMasked`, not `email`: the redaction list swallows the latter, and
       a seed line reading "[redacted]" helps nobody. */
    logger.info(
      { emailMasked: maskEmail(existing.email) },
      'seed: an admin already exists, leaving it alone',
    );
    return { created: false, email: existing.email };
  }

  await StaffUser.create({
    email,
    name: 'C.S.A.S Administrator',
    role: 'admin',
    status: 'active',
    passwordHash: await hash(env.SEED_ADMIN_PASSWORD, ARGON2_OPTIONS),
    /* In DEMO_MODE the TOTP secret is the fixed, documented one so a reviewer
       can log in; otherwise the admin enrols at first login (step 06). */
    mustChangePassword: !env.DEMO_MODE,
  });

  await AuditLog.create({
    action: 'staff.created',
    actorType: 'system',
    targetType: 'StaffUser',
    targetId: email,
    outcome: 'success',
    metadata: { reason: 'initial seed', role: 'admin' },
  });

  logger.info({ emailMasked: maskEmail(email) }, 'seed: first admin created');
  return { created: true, email };
}

/* ── Demo data ──────────────────────────────────────────────────────────── */

/**
 * Entirely fabricated. The numbers are inside Lebanon's range but are not
 * allocated to anyone, the names are invented, and the companies do not exist.
 *
 * `PRIVACY.md` §1 draws the line this sits on: the published repository
 * contains synthetic and licensed data only. These rows are the demonstration
 * data a reviewer logs in with, and they are safe precisely because nothing
 * here refers to a real person.
 */
export const DEMO_CUSTOMERS = [
  {
    name: 'Rania Haddad',
    companyName: 'Cedar Pharmaceuticals',
    phone: '+96170100001',
    email: 'rania.haddad@example.com',
    products: ['Inventory Suite', 'Point of Sale'],
    tier: 'premium' as const,
    /* Active and comfortably in date: the happy path. */
    offsetDays: { start: -200, end: 165 },
  },
  {
    name: 'Karim Sleiman',
    companyName: 'Beirut Logistics',
    phone: '+96171100002',
    email: 'karim.sleiman@example.com',
    products: ['Fleet Tracker'],
    tier: 'standard' as const,
    /* Expiring in 9 days: exercises the 30/14/7/1-day reminder ladder and the
       "renewal due" badge without anyone editing dates by hand. */
    offsetDays: { start: -356, end: 9 },
  },
  {
    name: 'Maya Chahine',
    companyName: 'Tripoli Textiles',
    phone: '+96176100003',
    email: 'maya.chahine@example.com',
    products: ['Inventory Suite'],
    tier: 'basic' as const,
    /* Already expired: the sequence diagram's "contract inactive → redirect to
       the Contact page" branch needs a customer it is true for. */
    offsetDays: { start: -400, end: -35 },
  },
] as const;

function dateOffset(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export interface DemoSeedResult {
  readonly customers: number;
  readonly contracts: number;
}

export async function seedDemoData({ env, logger }: SeedContext): Promise<DemoSeedResult> {
  const cipher = new PhoneCipher({
    encryptionKey: env.PHONE_ENCRYPTION_KEY,
    hashPepper: env.PHONE_HASH_PEPPER,
  });

  let customers = 0;
  let contracts = 0;

  for (const [index, demo] of DEMO_CUSTOMERS.entries()) {
    const e164 = normalizePhone(demo.phone);
    const phoneHash = cipher.hash(e164);

    /* Upsert on the hash, so re-seeding updates the same customer instead of
       failing on the unique index. */
    const customer = await Customer.findOneAndUpdate(
      { phoneHash },
      {
        $set: {
          name: demo.name,
          companyName: demo.companyName,
          email: demo.email,
          products: [...demo.products],
          preferredLanguage: 'ar',
          status: 'active',
        },
        $setOnInsert: {
          phoneHash,
          /* Re-encrypting on every seed would change the ciphertext for no
             reason — a diff in the database that means nothing. */
          phoneEncrypted: cipher.encrypt(e164),
          phoneLast3: e164.slice(-3),
        },
      },
      /* `returnDocument: 'after'`, not the deprecated `new: true`. */
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    customers += 1;

    const reference = `CT-DEMO-${String(index + 1).padStart(3, '0')}`;
    const endDate = dateOffset(demo.offsetDays.end);
    await Contract.updateOne(
      { reference },
      {
        $set: {
          customerId: customer._id,
          tier: demo.tier,
          startDate: dateOffset(demo.offsetDays.start),
          endDate,
          status: endDate.getTime() > Date.now() ? 'active' : 'expired',
          details: `Demonstration contract for ${demo.companyName}.`,
        },
      },
      { upsert: true },
    );
    contracts += 1;
  }

  logger.info({ customers, contracts }, 'seed: demo customers and contracts ready');
  return { customers, contracts };
}
