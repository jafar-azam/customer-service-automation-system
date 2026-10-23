import type { Logger } from 'pino';
import type { Env } from '@csas/shared';
import { normalizePhone } from '@csas/shared';
import { maskEmail } from '../observability/logger.js';
import { PhoneCipher } from '../crypto/phone.js';
import { SecretCipher } from '../crypto/secret-cipher.js';
import { AuditLog, Contract, Customer, StaffUser } from '../db/models/index.js';
import { hashPassword } from '../services/auth/password.js';

/**
 * Seeding, with one rule above all others: **it never deletes anything.**
 *
 * A seed script that wipes before writing is the most common way to lose a
 * local database, and the habit transfers to environments where it is not
 * recoverable. Everything here is an upsert or a create-if-absent, so running
 * it twice is the same as running it once, and running it on a database with
 * real data in it changes nothing that was not seeded.
 */

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
    passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
    /* Outside DEMO_MODE the seeded password is a bootstrap credential, so the
       first login must replace it. Two-factor enrolment is demo data, not part
       of creating an admin — see `enrolDemoAdminTotp`. */
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
  readonly totpEnrolled: boolean;
}

/**
 * Gives the demo admin the documented TOTP secret, if it has none.
 *
 * Mandatory admin two-factor and "a reviewer logs in within five minutes"
 * genuinely conflict: a fresh clone has no authenticator seeded. `DEMO_MODE`
 * resolves it by enrolling the secret from the environment, which the dev
 * inbox then turns into a visible 6-digit code.
 *
 * This lives with the demo data rather than with admin creation for a reason.
 * `seedAdmin` creates an admin **once and never touches it again**, which is
 * what stops a re-seed from reverting a changed password. Enrolment is a
 * separate, narrower act: it runs only under `DEMO_MODE`, only when no secret
 * exists, and it never alters a password or a role. An admin who has enrolled
 * a real authenticator is left alone.
 *
 * The 2FA code path itself is the production one. Only the secret's provenance
 * is demo-only, and the environment validator refuses `DEMO_MODE` when
 * `NODE_ENV=production`.
 */
export async function enrolDemoAdminTotp({ env, logger }: SeedContext): Promise<boolean> {
  if (!env.DEMO_MODE || env.DEMO_ADMIN_TOTP_SECRET === undefined) return false;

  const admin = await StaffUser.findOne({ role: 'admin' })
    .select('+totpSecretEncrypted')
    .lean<{ _id: unknown; totpSecretEncrypted?: string } | null>();

  if (!admin || admin.totpSecretEncrypted !== undefined) return false;

  await StaffUser.updateOne(
    { _id: admin._id },
    {
      $set: {
        totpSecretEncrypted: new SecretCipher(env.PHONE_ENCRYPTION_KEY).encrypt(
          env.DEMO_ADMIN_TOTP_SECRET,
        ),
        totpEnrolledAt: new Date(),
      },
    },
  );

  logger.info('seed: demo admin enrolled with the documented two-factor secret');
  return true;
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

  const totpEnrolled = await enrolDemoAdminTotp({ env, logger });

  logger.info({ customers, contracts }, 'seed: demo customers and contracts ready');
  return { customers, contracts, totpEnrolled };
}
