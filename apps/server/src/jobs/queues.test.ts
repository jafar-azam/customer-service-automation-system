import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getRedis } from '../db/redis.js';
import { startTestRedis, stopTestRedis } from '../db/test-redis.js';
import { silentLogger } from '../test-support.js';
import {
  createQueue,
  createWorker,
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  scheduleRepeating,
} from './queues.js';

/**
 * Constructs the real thing against a real Redis.
 *
 * The first version of this file used `csas:sla`, and every test passed —
 * because they all call the sweep functions directly and none of them built a
 * Queue. BullMQ refuses a colon (its keys are `bull:<queue>:<thing>`), so the
 * failure only appeared when the server started. This is the test that would
 * have caught it.
 */

beforeAll(async () => {
  await startTestRedis();
}, 180_000);

afterAll(async () => {
  await stopTestRedis();
});

describe('queue names', () => {
  it('are accepted by BullMQ', () => {
    for (const name of Object.values(QUEUE_NAMES)) {
      expect(() => new Queue(name, { connection: getRedis() })).not.toThrow();
    }
  });

  it('contain no colon, which BullMQ uses as its key separator', () => {
    for (const name of Object.values(QUEUE_NAMES)) {
      expect(name, name).not.toContain(':');
    }
  });
});

describe('the worker connection', () => {
  /* BullMQ refuses a blocking connection with a retry limit, because a
     blocking read that gives up after N retries silently stops consuming the
     queue. The application's own client keeps its limit — that is the right
     setting for a request with a user waiting on it — so the duplicate has
     to override it, and only constructing a Worker proves it. */
  it('accepts a connection duplicated with maxRetriesPerRequest null', async () => {
    const connection = getRedis().duplicate({ maxRetriesPerRequest: null });
    const worker = createWorker(QUEUE_NAMES.sla, () => Promise.resolve(), {
      connection,
      logger: silentLogger(),
    });
    expect(worker.name).toBe(QUEUE_NAMES.sla);
    await worker.close();
    connection.disconnect();
  });

  it('would be refused without it', () => {
    const connection = getRedis().duplicate({ maxRetriesPerRequest: 3 });
    expect(() =>
      createWorker(QUEUE_NAMES.sla, () => Promise.resolve(), {
        connection,
        logger: silentLogger(),
      }),
    ).toThrow(/maxRetriesPerRequest/);
    connection.disconnect();
  });
});

describe('job options', () => {
  /* An unbounded completed list is a slow Redis memory leak that only shows
     up after a month of running. */
  it('bounds what is kept', () => {
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toEqual({ count: 50 });
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toEqual({ count: 200 });
  });

  /* A sweep that fails because Mongo blinked should try again, not vanish
     until the next tick. */
  it('retries with backoff', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBeGreaterThan(1);
    expect(DEFAULT_JOB_OPTIONS.backoff).toMatchObject({ type: 'exponential' });
  });
});

describe('the repeating schedule', () => {
  /* The fixed id is what makes it idempotent: without it every restart adds
     another scheduler and the sweep doubles in frequency — a bug that takes
     weeks to notice and looks like load. */
  it('replaces its entry rather than adding a second one', async () => {
    const queue = createQueue(QUEUE_NAMES.sla, { connection: getRedis(), logger: silentLogger() });

    await scheduleRepeating(queue, 'sweep', 60_000);
    await scheduleRepeating(queue, 'sweep', 60_000);
    await scheduleRepeating(queue, 'sweep', 60_000);

    expect(await queue.getJobSchedulers()).toHaveLength(1);
    await queue.obliterate({ force: true });
    await queue.close();
  });
});
