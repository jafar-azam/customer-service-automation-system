import type { Env } from '@csas/shared';
import type { Queue, Worker } from 'bullmq';
import type { Logger } from 'pino';
import { getRedis } from '../db/redis.js';
import { MockMessagingProvider, type MessagingProvider } from '../services/providers/messaging.js';
import type { StorageProvider } from '../services/providers/storage.js';
import { sweepRetention, sweepSla } from './sla-sweep.js';
import { backfillEmbeddings } from '../services/rag/embed-entries.js';
import { createEmbeddings } from '../services/providers/embeddings.js';
import type { KnowledgeIndex } from '../services/rag/retrieve.js';
import { createQueue, createWorker, QUEUE_NAMES, scheduleRepeating } from './queues.js';

/**
 * Starting and stopping the background work.
 *
 * Both sweeps are cheap and idempotent, so they run often enough to be useful
 * rather than often enough to be exact. A minute is well inside any SLA
 * target here, and a retention sweep that runs hourly deletes a file at most
 * an hour late — against a window measured in a year.
 */

const SLA_INTERVAL_MS = 60_000;
const RETENTION_INTERVAL_MS = 60 * 60_000;
/* Often enough that an entry approved now is answerable within minutes,
   rarely enough that an idle knowledge base costs almost nothing — the query
   finds nothing and returns. Step 17 invalidates the index on approval, which
   is what makes the wait the backfill interval rather than a cache lifetime. */
const EMBED_INTERVAL_MS = 5 * 60_000;

export interface Jobs {
  readonly queues: readonly Queue[];
  readonly workers: readonly Worker[];
  close(): Promise<void>;
}

export interface JobsOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly storage: StorageProvider;
  readonly messaging?: MessagingProvider;
  /** Invalidated after a backfill, so new vectors are visible immediately. */
  readonly knowledgeIndex?: KnowledgeIndex;
}

export async function startJobs({
  env,
  logger,
  storage,
  messaging = new MockMessagingProvider(logger, { revealCodes: env.DEMO_MODE }),
  knowledgeIndex,
}: JobsOptions): Promise<Jobs> {
  /* BullMQ needs its own connection, and needs it configured differently.
     It issues blocking commands — `BZPOPMIN` and friends — so sharing the
     application's client would stall every other Redis call behind them, and
     it refuses outright unless `maxRetriesPerRequest` is null: a blocking
     read that gives up after N retries would silently stop consuming the
     queue. The application's client keeps its retry limit, which is the right
     setting for a request that has a user waiting on it. */
  const connection = getRedis().duplicate({ maxRetriesPerRequest: null });
  const runtime = { connection, logger };

  const slaQueue = createQueue(QUEUE_NAMES.sla, runtime);
  const retentionQueue = createQueue(QUEUE_NAMES.retention, runtime);
  const embedQueue = createQueue(QUEUE_NAMES.embed, runtime);

  await scheduleRepeating(slaQueue, 'sweep', SLA_INTERVAL_MS);
  await scheduleRepeating(retentionQueue, 'sweep', RETENTION_INTERVAL_MS);
  await scheduleRepeating(embedQueue, 'backfill', EMBED_INTERVAL_MS);

  const embeddings = createEmbeddings(env.EMBEDDINGS_PROVIDER, {
    baseUrl: env.ML_SERVICE_URL,
    token: env.ML_SERVICE_TOKEN,
    logger,
  });

  const workers = [
    createWorker(
      QUEUE_NAMES.sla,
      async () => {
        await sweepSla(logger, messaging);
      },
      runtime,
    ),
    createWorker(
      QUEUE_NAMES.retention,
      async () => {
        await sweepRetention(logger, storage);
      },
      runtime,
    ),
    createWorker(
      QUEUE_NAMES.embed,
      async () => {
        const result = await backfillEmbeddings(embeddings, logger);
        /* Only when something changed: invalidating on every tick would
           reload the whole index every five minutes for nothing. */
        if (result.embedded > 0) knowledgeIndex?.invalidate();
      },
      runtime,
    ),
  ];

  logger.info(
    { slaIntervalMs: SLA_INTERVAL_MS, retentionIntervalMs: RETENTION_INTERVAL_MS },
    'background jobs started',
  );

  return {
    queues: [slaQueue, retentionQueue, embedQueue],
    workers,
    async close() {
      /* Workers first: closing a queue underneath a running worker leaves it
         reconnecting to something that is gone, and the shutdown then waits
         for a timeout instead of ending. */
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all([slaQueue.close(), retentionQueue.close(), embedQueue.close()]);
      connection.disconnect();
    },
  };
}
