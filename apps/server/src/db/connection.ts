import mongoose from 'mongoose';
import type { Logger } from 'pino';
import type { HealthCheck } from '../observability/health.js';
/* Imported for its side effect: a model is only in `mongoose.models` once its
   module has been evaluated. Without this, `syncIndexes()` iterates an empty
   registry and reports success having created nothing — which a test that
   imported only this module found, and which a production deploy would have
   found much later and much more expensively. */
import './models/index.js';

/**
 * The MongoDB connection.
 *
 * Three settings are deliberate rather than default:
 *
 * `bufferCommands: false` — Mongoose's default is to queue operations while
 * disconnected and run them when the connection returns. That turns a database
 * outage into requests that hang for as long as the client is willing to wait,
 * instead of failing fast with a 503. Readiness already reports the outage; the
 * requests should fail.
 *
 * `autoIndex: false` — building indexes on every boot is fine with ten
 * documents and a stall with a million. Indexes are synchronised explicitly by
 * `syncIndexes()` below, from the seed command, so index changes are a
 * deliberate operation with visible output.
 *
 * `serverSelectionTimeoutMS` short — the readiness probe has a 2-second budget,
 * so the driver must give up inside it rather than after its 30-second default.
 */
export interface ConnectOptions {
  readonly uri: string;
  readonly logger: Logger;
  readonly serverSelectionTimeoutMs?: number;
}

export async function connectToDatabase({
  uri,
  logger,
  serverSelectionTimeoutMs = 5_000,
}: ConnectOptions): Promise<typeof mongoose> {
  mongoose.set('bufferCommands', false);
  /* Collections are created by the seed, with their validators attached, not
     implicitly by the first write. Otherwise Mongoose races the validator
     setup and a collection ends up with no rules on it. */
  mongoose.set('autoCreate', false);
  /* Mongoose strips `$`-prefixed keys from filter objects when this is on,
     which is a second line of defence behind zod against operator injection. */
  mongoose.set('sanitizeFilter', true);

  const connection = mongoose.connection;

  connection.on('connected', () => {
    logger.info({ db: connection.name }, 'mongodb connected');
  });
  connection.on('disconnected', () => {
    /* Not fatal: the driver reconnects, and readiness reports it meanwhile. */
    logger.warn('mongodb disconnected');
  });
  connection.on('error', (error: unknown) => {
    logger.error({ err: error }, 'mongodb connection error');
  });

  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: serverSelectionTimeoutMs,
    /* A write is acknowledged by the primary's journal. Anything weaker means
       "saved" can be a lie after a crash, and this system's writes include
       audit entries. */
    writeConcern: { w: 'majority', journal: true },
  });

  return mongoose;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * MongoDB is a **critical** readiness dependency: nothing in this application
 * works without it, so a failing probe takes the instance out of rotation.
 * Contrast the ML service, which is non-critical because the assistant has a
 * documented degraded mode (step 03 §2.1).
 *
 * The probe pings rather than reading a collection — a read would be a second
 * thing that can fail for a reason unrelated to the connection.
 */
export function createMongoHealthCheck(): HealthCheck {
  return {
    name: 'mongodb',
    critical: true,
    timeoutMs: 2_000,
    probe: async () => {
      const admin = mongoose.connection.db?.admin();
      if (!admin) throw new Error('not connected');
      await admin.ping();
    },
  };
}

/**
 * Creates every index declared on the models, and drops the ones that are no
 * longer declared.
 *
 * Run explicitly (from `npm run seed`), never on boot: index builds are
 * expensive and a boot-time build makes a deploy mysteriously slow. The drop
 * half matters too — an index left behind after a schema change costs write
 * throughput forever and nobody notices.
 */
export async function syncIndexes(logger: Logger): Promise<void> {
  const models = Object.values(mongoose.models);
  if (models.length === 0) {
    /* Belt and braces: if a future refactor breaks the registry import above,
       fail loudly rather than silently synchronising nothing. */
    throw new Error('syncIndexes: no models are registered');
  }
  for (const currentModel of models) {
    const dropped = await currentModel.syncIndexes();
    if (dropped.length > 0) {
      logger.info({ collection: currentModel.collection.name, dropped }, 'dropped stale indexes');
    }
  }
  logger.info({ collections: models.length }, 'indexes synchronised');
}
