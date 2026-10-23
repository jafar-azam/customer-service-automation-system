import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMongoHealthCheck, syncIndexes } from './connection.js';
import { startTestDatabase, stopTestDatabase } from './test-db.js';
import { silentLogger } from '../test-support.js';

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

describe('the MongoDB readiness probe', () => {
  /* Critical, unlike the ML service: without the database nothing works, so a
     failing probe must take the instance out of rotation (step 03 §2.1). */
  it('is registered as critical', () => {
    const check = createMongoHealthCheck();
    expect(check.name).toBe('mongodb');
    expect(check.critical).toBe(true);
  });

  it('passes while connected', async () => {
    await expect(createMongoHealthCheck().probe()).resolves.toBeUndefined();
  });

  it('fails, rather than hanging, when there is no connection', async () => {
    const check = createMongoHealthCheck();
    const { db } = mongoose.connection;
    /* Simulate the disconnected state the driver leaves behind. */
    Object.defineProperty(mongoose.connection, 'db', { value: undefined, configurable: true });
    try {
      await expect(check.probe()).rejects.toThrow('not connected');
    } finally {
      Object.defineProperty(mongoose.connection, 'db', { value: db, configurable: true });
    }
  });
});

describe('index synchronisation', () => {
  /* `syncIndexes` also *drops* indexes that are no longer declared. An index
     left behind after a schema change costs write throughput forever, and
     nobody notices because nothing fails. */
  it('removes an index the models no longer declare', async () => {
    const collection = mongoose.connection.db?.collection('customers');
    await collection?.createIndex({ companyName: 1 }, { name: 'stale_index' });
    expect((await collection?.indexes())?.some((i) => i.name === 'stale_index')).toBe(true);

    await syncIndexes(silentLogger());

    expect((await collection?.indexes())?.some((i) => i.name === 'stale_index')).toBe(false);
    /* …and the declared ones are present, which is the half that silently did
       not happen when the model registry had not been imported. */
    expect((await collection?.indexes())?.some((i) => i.name === 'phoneHash_1')).toBe(true);
  });

  it('is safe to run twice', async () => {
    await syncIndexes(silentLogger());
    await expect(syncIndexes(silentLogger())).resolves.toBeUndefined();
  });
});
