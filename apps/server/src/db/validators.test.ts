import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLLECTION_VALIDATORS, applyValidators } from './validators.js';
import { startTestDatabase, stopTestDatabase } from './test-db.js';
import { silentLogger } from '../test-support.js';

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

/** The driver types `listCollections` as a union without `options`; a collection
    listed by name always carries them. */
interface CollectionInfoWithOptions {
  options?: {
    validator?: Record<string, unknown>;
    validationLevel?: string;
    validationAction?: string;
  };
}

async function collectionInfo(collection: string): Promise<CollectionInfoWithOptions | undefined> {
  const [info] = await (mongoose.connection.db?.listCollections({ name: collection }).toArray() ??
    []);
  return info as CollectionInfoWithOptions | undefined;
}

async function validatorFor(collection: string): Promise<Record<string, unknown> | undefined> {
  return (await collectionInfo(collection))?.options?.validator;
}

describe('applying validators', () => {
  /* The seed runs this on every invocation, so "again" is the normal case,
     not the exceptional one. */
  it('is idempotent', async () => {
    await expect(applyValidators(silentLogger())).resolves.toBeUndefined();
    await expect(applyValidators(silentLogger())).resolves.toBeUndefined();
  });

  /* The listing is a snapshot, and Mongoose creates a collection the moment a
     model is first used — so a collection can appear between reading the list
     and acting on it. That race aborted the first real seed.
     Simulated by hiding the collections from the listing while they exist: the
     function then takes the create path, is told NamespaceExists, and must
     fall back to collMod instead of giving up. */
  it('recovers when a collection appears after the listing', async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('not connected');

    await applyValidators(silentLogger());
    /* An empty validator removes the rule outright, which is the state this
       test needs: a collection that exists and is unconstrained. */
    await db.command({ collMod: 'customers', validator: {} });
    expect(await validatorFor('customers')).toBeUndefined();

    const realListCollections = db.listCollections.bind(db);
    const empty = { toArray: () => Promise.resolve([]) };
    Object.defineProperty(db, 'listCollections', { value: () => empty, configurable: true });

    try {
      await expect(applyValidators(silentLogger())).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(db, 'listCollections', {
        value: realListCollections,
        configurable: true,
      });
    }

    /* The rule is back: the fallback ran rather than the error escaping. */
    expect(await validatorFor('customers')).toHaveProperty('$jsonSchema');
  });

  it('attaches a rule to every collection it names', async () => {
    await applyValidators(silentLogger());
    for (const name of Object.keys(COLLECTION_VALIDATORS)) {
      expect(await validatorFor(name), `${name} has no validator`).toBeDefined();
    }
  });

  /* `strict`, not `moderate`: moderate exempts documents that were already
     invalid, which is exactly the population a validator exists to stop. */
  it('rejects the write rather than warning about it', async () => {
    await applyValidators(silentLogger());
    const options = (await collectionInfo('customers'))?.options;
    expect(options?.validationLevel).toBe('strict');
    expect(options?.validationAction).toBe('error');
  });

  it('refuses to run without a connection', async () => {
    const { db } = mongoose.connection;
    Object.defineProperty(mongoose.connection, 'db', { value: undefined, configurable: true });
    try {
      await expect(applyValidators(silentLogger())).rejects.toThrow('not connected');
    } finally {
      Object.defineProperty(mongoose.connection, 'db', { value: db, configurable: true });
    }
  });
});
