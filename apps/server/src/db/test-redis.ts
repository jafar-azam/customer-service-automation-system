import { Redis } from 'ioredis';
import { RedisMemoryServer } from 'redis-memory-server';
import { setRedisForTesting } from './redis.js';

/**
 * A real Redis for tests, for the same reason step 05 uses a real MongoDB.
 *
 * What this code claims is enforced *by Redis*: `INCR` is atomic, `EXPIRE`
 * sets a window that actually expires, and `TTL` reports what is left. A fake
 * would assert that the limiter calls the right methods — a different and much
 * weaker statement, and one that would still pass if the window never expired.
 *
 * `ioredis-mock` was the obvious alternative and is rejected twice over: it
 * pins a peer on ioredis 5 while this project is on 6, and it would reintroduce
 * exactly the fake-vs-real gap above.
 */

let server: RedisMemoryServer | undefined;
let client: Redis | undefined;

export async function startTestRedis(): Promise<Redis> {
  server = new RedisMemoryServer();
  const host = await server.getHost();
  const port = await server.getPort();

  client = new Redis({ host, port, maxRetriesPerRequest: 2 });
  setRedisForTesting(client);
  return client;
}

export async function stopTestRedis(): Promise<void> {
  await client?.quit().catch(() => undefined);
  await server?.stop();
  setRedisForTesting(undefined);
  client = undefined;
  server = undefined;
}

/** Between tests: the limits must start from zero, not from the last test. */
export async function clearTestRedis(): Promise<void> {
  await client?.flushall();
}
