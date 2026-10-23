import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { applyValidators } from './validators.js';
import { silentLogger } from '../test-support.js';

/**
 * A real MongoDB for tests.
 *
 * Mocking the database was rejected deliberately. Most of what step 05 claims
 * is enforced *by MongoDB*, not by the application: unique indexes, TTL
 * expiry, `$jsonSchema` validators, transactions. A mock would assert that the
 * code calls the driver, which is not the same statement and would pass even if
 * every index were missing.
 *
 * A **replica set** rather than a standalone, because transactions require one
 * — and token rotation plus session-family revocation plus the audit entry have
 * to commit or fail together (step 06).
 *
 * The binary is downloaded once and cached. That is a real cost for a first-time
 * contributor on a slow connection, and it is the reason the alternative — a
 * Docker service container — stays documented in the step README.
 */

let replSet: MongoMemoryReplSet | undefined;

export async function startTestDatabase(): Promise<string> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri();

  mongoose.set('bufferCommands', false);
  /* Matches the application exactly — see connection.ts for why this is off. */
  mongoose.set('autoCreate', false);
  await mongoose.connect(uri);

  /* The same two steps the seed runs, so tests exercise the real constraints
     rather than a convenient subset of them. */
  await applyValidators(silentLogger());
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  return uri;
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  await replSet?.stop();
  replSet = undefined;
}

/**
 * Empties every collection without dropping it.
 *
 * Dropping would take the indexes and validators with it, and the next test
 * would quietly run without the constraints it is meant to be testing.
 */
export async function clearTestDatabase(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  await Promise.all(collections.map((c) => db.collection(c.name).deleteMany({})));
}
