import { createInterface } from 'node:readline/promises';
import { getEnv } from '../config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../db/connection.js';
import { StaffUser } from '../db/models/index.js';
import { createLogger, maskEmail } from '../observability/logger.js';
import { record } from '../services/audit.js';
import { assessPassword, hashPassword } from '../services/auth/password.js';
import { revokeAllForStaff } from '../services/auth/tokens.js';

/**
 * Break-glass: the way back in when the only admin is locked out.
 *
 * Every other recovery path needs something the locked-out admin no longer
 * has — their password, their authenticator, their recovery codes, or another
 * admin to help. This one needs **access to the server itself**, which is a
 * higher bar than any of them and is the whole security argument for it: if
 * you can run this, you can already read the database.
 *
 * It is deliberately awkward to use. There is no HTTP endpoint, no flag that
 * skips the prompts, and nothing here runs as part of the application. It must
 * be invoked by a person, inside the container or on the host, with the
 * database credentials to hand.
 *
 * What it does:
 *   * clears the lockout and the second factor on **one named admin**;
 *   * optionally sets a new password, which must still pass the policy;
 *   * revokes every session that account had;
 *   * writes `staff.break_glass_used` to the audit log — the one entry that
 *     should never appear without a matching incident note.
 *
 * What it will not do: create an admin, change a role, or touch anyone else.
 * A machine that can run this can do those things directly in the database;
 * the point is that this tool leaves a record, and reaching past it does not.
 */

interface Options {
  readonly email?: string;
  readonly reason?: string;
  readonly assumeYes: boolean;
}

export function parseArgs(argv: readonly string[]): Options {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const email = value('--email');
  const reason = value('--reason');
  return {
    ...(email === undefined ? {} : { email }),
    ...(reason === undefined ? {} : { reason }),
    /* For a scripted drill, not for convenience. Still requires --reason. */
    assumeYes: argv.includes('--yes'),
  };
}

export const USAGE = `
C.S.A.S break-glass — restore access to one locked-out admin.

  npm run break-glass -w @csas/server -- --email <address> --reason "<why>"

Options:
  --email <address>   the admin to restore (required)
  --reason "<text>"   recorded in the audit log (required)
  --yes               skip the confirmation prompt (for a rehearsed drill)

It clears the lockout and the second factor, revokes every session, and
optionally sets a new password. It never creates an account or changes a role.
`.trim();

export async function runBreakGlass(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  const env = getEnv();
  /* `pretty: env.LOG_PRETTY`, not `true`. `pino-pretty` is a dev dependency
     and is absent from the runtime image, where this tool actually runs — a
     hard-coded `true` made it crash on startup with "unable to determine
     transport target", before it had done anything. The human-readable output
     of this command is written directly to stdout anyway; the logger is only
     here for the audit write's failure path. */
  const logger = createLogger({
    level: env.LOG_LEVEL,
    pretty: env.LOG_PRETTY,
    name: 'break-glass',
  });

  if (options.email === undefined || options.reason === undefined) {
    process.stdout.write(`${USAGE}\n`);
    return 1;
  }

  await connectToDatabase({ uri: env.MONGODB_MIGRATION_URI ?? env.MONGODB_URI, logger });

  try {
    const email = options.email.trim().toLowerCase();
    const admin = await StaffUser.findOne({ email, role: 'admin' })
      .select('_id email name status')
      .lean<{ _id: unknown; email: string; name: string; status: string } | null>();

    if (!admin) {
      /* Named plainly: this tool is already behind server access, so hiding
         whether an account exists protects nobody and wastes an outage. */
      process.stderr.write(`No admin account found for ${email}\n`);
      return 1;
    }

    process.stdout.write(
      [
        '',
        'About to restore access to:',
        `  ${admin.name} <${admin.email}>  (${admin.status})`,
        '',
        'This will:',
        '  * clear any lockout',
        '  * remove the second factor, so it must be set up again at next login',
        '  * revoke every active session',
        '  * write an audit entry naming this action and your reason',
        '',
      ].join('\n'),
    );

    if (!options.assumeYes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`Type the address to confirm (${admin.email}): `);
      rl.close();
      if (answer.trim().toLowerCase() !== admin.email) {
        process.stderr.write('Confirmation did not match. Nothing was changed.\n');
        return 1;
      }
    }

    const password = process.env['BREAK_GLASS_PASSWORD'] ?? '';
    const settingPassword = password !== '';
    if (settingPassword) {
      /* Taken from the environment rather than a flag: a password in `--args`
         lands in the shell history and in `ps` output for every user on the
         box. It still has to pass the ordinary policy — an emergency is not a
         reason to install a weak admin password permanently. */
      const assessment = assessPassword(password, { email: admin.email, name: admin.name });
      if (!assessment.acceptable) {
        process.stderr.write(
          `BREAK_GLASS_PASSWORD was refused: ${assessment.problems.join(', ')}\n`,
        );
        return 1;
      }
    }

    await StaffUser.updateOne(
      { _id: admin._id },
      {
        $set: {
          failedLoginCount: 0,
          status: 'active',
          ...(settingPassword
            ? {
                passwordHash: await hashPassword(password),
                passwordChangedAt: new Date(),
                /* Set from a terminal by whoever is holding the incident, so
                   it is a bootstrap credential, not a chosen password. */
                mustChangePassword: true,
              }
            : {}),
        },
        $unset: { lockedUntil: '', totpSecretEncrypted: '', totpEnrolledAt: '' },
      },
    );

    const sessionsRevoked = await revokeAllForStaff(String(admin._id), 'admin');

    await record(logger, {
      action: 'staff.break_glass_used',
      actorType: 'system',
      targetType: 'StaffUser',
      targetId: String(admin._id),
      metadata: {
        reason: options.reason,
        emailMasked: maskEmail(admin.email),
        passwordReset: settingPassword,
        sessionsRevoked,
        /* Who was at the keyboard, as far as the machine can tell. Not proof,
           but a thread to pull during a review. */
        operatingSystemUser: process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown',
      },
    });

    process.stdout.write(
      [
        '',
        'Done.',
        `  sessions revoked:   ${String(sessionsRevoked)}`,
        `  password replaced:  ${settingPassword ? 'yes (must be changed at next login)' : 'no'}`,
        '  second factor:      removed — it must be set up again at next login',
        '',
        'An audit entry has been written. Record the incident alongside it.',
        '',
      ].join('\n'),
    );

    return 0;
  } finally {
    await disconnectFromDatabase();
  }
}
