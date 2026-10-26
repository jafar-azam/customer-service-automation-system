import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createRealtime } from './realtime/socket.js';
import { startJobs } from './jobs/index.js';
import { createStorage } from './services/providers/storage.js';
import { DeferredTicketEvents } from './realtime/events.js';
import { EnvValidationError, getEnv } from './config/env.js';
import {
  connectToDatabase,
  createMongoHealthCheck,
  disconnectFromDatabase,
} from './db/connection.js';
import { connectToRedis, createRedisHealthCheck, disconnectFromRedis } from './db/redis.js';
import { DisabledErrorTracker, LoggingErrorTracker } from './observability/error-tracking.js';
import { createLogger } from './observability/logger.js';
import { createMlHealthCheck } from './observability/dependencies.js';

const VERSION = '0.1.0';
const SHUTDOWN_TIMEOUT_MS = 10_000;

function main(): void {
  let env;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      /* The only place in the server allowed to write to stderr directly: the
         logger is configured from the environment that just failed to load. */
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const startedAt = Date.now();
  const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY });
  const errorTracker = env.errorTrackingEnabled
    ? new LoggingErrorTracker(logger)
    : new DisabledErrorTracker();

  /* The HTTP server is created explicitly rather than by `app.listen`, because
     Socket.IO attaches to it — and that makes the dependency a cycle: sockets
     need the server, the server needs the app, the app's routers need
     somewhere to announce. The deferred recorder is where the cycle is cut. */
  const deferredEvents = new DeferredTicketEvents();
  const app = createApp({
    env,
    version: VERSION,
    logger,
    errorTracker,
    startedAt,
    events: deferredEvents,
  });
  const httpServer = createServer(app.express);
  const { io, events } = createRealtime({ env, logger, httpServer });
  deferredEvents.bind(events);

  /* MongoDB is **critical**: without it nothing works, so a failing probe takes
     this instance out of rotation. The ML service is **not** — the assistant
     degrades to keyword search and escalation without it (step 18), so its
     absence must not stop traffic this server can still serve. Redis joins as a
     critical check in step 14. */
  app.health.register(createMongoHealthCheck());
  /* Also critical: without Redis the OTP rate limits cannot be enforced, and
     an endpoint that sends messages with its limits disabled is worse than one
     that is down (step 08). */
  app.health.register(createRedisHealthCheck());
  app.health.register(createMlHealthCheck(env.ML_SERVICE_URL));

  connectToRedis({ url: env.REDIS_URL, logger });

  /* Started after Redis is connecting, and not awaited: the SLA sweep must
     not hold the server's listen() behind it. A failure here is logged and
     leaves the API serving — timers stopping is bad, the whole service being
     down is worse. */
  let jobs: Awaited<ReturnType<typeof startJobs>> | undefined;
  void startJobs({ env, logger, storage: createStorage(env.STORAGE_ROOT) })
    .then((started) => {
      jobs = started;
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'background jobs failed to start');
    });

  /* The connection is started but not awaited: the server must come up and
     answer /api/health even when the database is down, so that readiness can
     report *why* rather than the process simply failing to boot. */
  void connectToDatabase({ uri: env.MONGODB_URI, logger }).catch((error: unknown) => {
    logger.error({ err: error }, 'initial mongodb connection failed; readiness will report it');
  });

  const server = httpServer.listen(env.PORT, () => {
    logger.info(
      {
        version: VERSION,
        port: env.PORT,
        environment: env.NODE_ENV,
        timezone: env.TZ,
        demoMode: env.DEMO_MODE,
        errorTracking: errorTracker.enabled,
        healthChecks: app.health.names(),
        realtime: '/api/socket.io',
      },
      'csas-server listening',
    );
  });

  /* Containers are stopped with SIGTERM. Without this the orchestrator waits
     for a timeout and then kills the process mid-request. */
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    /* A connection that never closes — a long poll, a websocket, a client that
       went away — must not hold the process open forever. Exiting non-zero
       records that the shutdown was not clean. */
    const timer = setTimeout(() => {
      logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'forced exit: connections still open');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    /* Sockets first. `server.close` waits for connections to end, and a
       websocket never ends on its own — without this the shutdown always hits
       the forced-exit timer and reports an unclean stop. */
    void io.close();
    /* Jobs before the HTTP server: an in-flight sweep holding a Mongo cursor
       would otherwise be killed by the forced-exit timer. */
    void jobs?.close();

    server.close(() => {
      void Promise.all([disconnectFromDatabase(), disconnectFromRedis()])
        .catch(() => undefined)
        .finally(() => {
          logger.info('shutdown complete');
          process.exit(0);
        });
    });
  };
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  /* A crash that leaves no record is the expensive kind. Both handlers log and
     then exit: Node's own guidance is that the process state is undefined after
     an uncaught exception, so continuing would be guessing. */
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    errorTracker.capture({ error });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    errorTracker.capture({ error: reason });
    process.exit(1);
  });
}

main();
