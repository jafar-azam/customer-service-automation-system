import { getEnv } from '../config/env.js';
import { connectToDatabase, disconnectFromDatabase, syncIndexes } from '../db/connection.js';
import { applyValidators } from '../db/validators.js';
import { StaffUser } from '../db/models/index.js';
import { createLogger } from '../observability/logger.js';
import { resolveFromRepoRoot } from './repo-root.js';
import { seedAdmin, seedDemoData } from './seed.js';
import { importTechQa } from './techqa.js';
import { importSeniordata } from './seniordata.js';

/**
 * `npm run seed` — the one command that prepares a database.
 *
 * Order matters and is not arbitrary:
 *
 *   1. validators, so nothing invalid can be written even by this script;
 *   2. indexes, so the unique constraints the importers rely on exist before
 *      they upsert;
 *   3. the admin, so there is an actor to attribute the import to;
 *   4. demo data, only when DEMO_MODE is on;
 *   5. the knowledge base.
 *
 * Idempotent from end to end: run it as often as you like. It never deletes.
 */

interface Options {
  readonly skipTechQa: boolean;
  readonly skipSeniordata: boolean;
  readonly skipMetadata: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  return {
    skipTechQa: argv.includes('--no-kb'),
    skipSeniordata: argv.includes('--no-seniordata'),
    /* The technote metadata scan reads 292 MB. Worth skipping when re-seeding
       repeatedly; the entries import either way, without a product name. */
    skipMetadata: argv.includes('--fast'),
  };
}

export async function runSeed(argv: readonly string[] = []): Promise<void> {
  const options = parseArgs(argv);
  const env = getEnv();
  const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY, name: 'csas-seed' });

  /* The migration identity when one is configured: applying a validator needs
     dbAdmin, which the application user deliberately does not have. */
  await connectToDatabase({ uri: env.MONGODB_MIGRATION_URI ?? env.MONGODB_URI, logger });

  try {
    await applyValidators(logger);
    await syncIndexes(logger);

    const admin = await seedAdmin({ env, logger });
    const adminDoc = await StaffUser.findOne({ email: admin.email }).select('_id').lean();

    if (env.DEMO_MODE) {
      await seedDemoData({ env, logger });
    } else {
      logger.info('seed: DEMO_MODE is off, skipping demonstration customers');
    }

    if (!options.skipTechQa) {
      await importTechQa({
        root: resolveFromRepoRoot(env.TECHQA_PATH),
        logger,
        ...(adminDoc ? { approvedByStaffId: adminDoc._id } : {}),
        withMetadata: !options.skipMetadata,
      });
    }

    if (!options.skipSeniordata) {
      await importSeniordata({
        path: resolveFromRepoRoot(env.SENIORDATA_PATH),
        logger,
      });
    }

    logger.info('seed: complete');
  } finally {
    await disconnectFromDatabase();
  }
}

/* Only run when invoked directly, so tests can import the pieces. */
if (process.argv[1]?.includes('seed')) {
  runSeed(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`seed failed: ${error instanceof Error ? error.message : 'unknown'}\n`);
    process.exit(1);
  });
}
