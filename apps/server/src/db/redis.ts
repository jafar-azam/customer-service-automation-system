import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { HealthCheck } from '../observability/health.js';

/**
 * Redis: the counters that have to be right under concurrency.
 *
 * MongoDB could hold rate-limit counters, but every limit here is
 * read-increment-compare, and in Mongo that is either a transaction per
 * request or a race. `INCR` is atomic by construction and returns the new
 * value in the same round trip, which is exactly the shape of "is this the
 * sixth attempt?".
 *
 * It also already exists in the stack for BullMQ (step 14), so this is not a
 * new dependency — it is the right use of one that is there.
 *
 * **It is a critical readiness dependency.** Without it the OTP limits cannot
 * be enforced, and an endpoint that sends messages with its limits disabled is
 * worse than an endpoint that is down: `messaging-lebanon.md` is explicit that
 * SMS pumping is the fraud this protects against.
 */

let client: Redis | undefined;

export interface RedisOptions {
  readonly url: string;
  readonly logger: Logger;
}

export function connectToRedis({ url, logger }: RedisOptions): Redis {
  client = new Redis(url, {
    /* Fail fast rather than queue: a request that cannot check its rate limit
       must be refused, not held until Redis returns. */
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: false,
    connectTimeout: 3_000,
  });

  client.on('error', (error: unknown) => {
    /* Logged at warn, not error: ioredis retries, and a reconnect storm would
       otherwise fill the log with identical lines. Readiness reports the
       outage; this is the detail for someone investigating it. */
    logger.warn({ err: error }, 'redis connection problem');
  });
  client.on('ready', () => {
    logger.info('redis connected');
  });

  return client;
}

export function getRedis(): Redis {
  if (!client) throw new Error('redis: not connected');
  return client;
}

export async function disconnectFromRedis(): Promise<void> {
  await client?.quit().catch(() => undefined);
  client = undefined;
}

/** Lets tests supply their own instance without a running server. */
export function setRedisForTesting(instance: Redis | undefined): void {
  client = instance;
}

export function createRedisHealthCheck(): HealthCheck {
  return {
    name: 'redis',
    critical: true,
    timeoutMs: 2_000,
    probe: async () => {
      /* `ping()` is typed as returning the literal 'PONG', so comparing it is
         dead code to the type checker. Asserting the call *completes* is the
         real check anyway: a broken connection rejects. */
      await getRedis().ping();
    },
  };
}
