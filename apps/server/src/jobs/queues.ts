import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

/**
 * Background work.
 *
 * BullMQ on the Redis that is already here, rather than a second datastore or
 * a `setInterval`. The three things an interval cannot do, and which this step
 * needs all of:
 *
 * - **Survive a restart.** A breach due in two hours must still fire if the
 *   process is redeployed in between.
 * - **Run once across instances.** A repeatable job with a fixed key is
 *   claimed by one worker; two `setInterval`s in two containers send two
 *   breach alerts.
 * - **Retry with backoff.** A sweep that fails because Mongo blinked should
 *   try again, not vanish until the next tick.
 */

/**
 * Hyphens, not colons.
 *
 * BullMQ builds its Redis keys as `bull:<queue>:<thing>`, so a colon in the
 * name produces an ambiguous key and the constructor refuses it outright:
 * `Queue name cannot contain :`. The whole test suite passed with the colons
 * in place, because every test calls the sweep functions directly and none of
 * them constructs a Queue — it only surfaced on starting the server.
 */
export const QUEUE_NAMES = {
  sla: 'csas-sla',
  retention: 'csas-retention',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Shared defaults.
 *
 * `removeOnComplete` keeps the last few for inspection rather than all of
 * them: an unbounded completed list is a slow memory leak in Redis that only
 * shows up after a month of running.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
};

export interface JobRuntime {
  readonly connection: Redis;
  readonly logger: Logger;
}

export function createQueue(name: QueueName, { connection }: JobRuntime): Queue {
  return new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

/**
 * Registers a job that repeats on a schedule.
 *
 * The `jobId` is fixed, which is what makes the schedule idempotent: calling
 * this again on the next deploy replaces the entry rather than adding a
 * second one. Without it, every restart doubles the frequency — a bug that
 * takes weeks to notice and looks like load.
 */
export async function scheduleRepeating(
  queue: Queue,
  name: string,
  everyMs: number,
  data: unknown = {},
): Promise<void> {
  await queue.upsertJobScheduler(name, { every: everyMs }, { name, data });
}

export function createWorker(
  name: QueueName,
  handler: (job: Job) => Promise<void>,
  { connection, logger }: JobRuntime,
): Worker {
  const worker = new Worker(name, handler, {
    connection,
    /* One at a time. These sweeps touch many documents and the point is
       steadiness, not throughput; concurrency here buys nothing and makes
       two overlapping sweeps possible. */
    concurrency: 1,
  });

  worker.on('failed', (job, error) => {
    logger.error({ queue: name, jobId: job?.id, err: error }, 'job failed');
  });

  /* A worker whose connection drops must be loud: silent job death is the
     failure mode where SLA breaches simply stop being noticed. */
  worker.on('error', (error) => {
    logger.error({ queue: name, err: error }, 'worker error');
  });

  return worker;
}
