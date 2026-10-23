import { createApp } from './app.js';
import { EnvValidationError, getEnv } from './config/env.js';
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

  const app = createApp({ env, version: VERSION, logger, errorTracker, startedAt });

  /* The ML service is registered as a *non-critical* dependency: the assistant
     degrades to keyword search and escalation without it (step 18), so its
     absence must not take this instance out of rotation. MongoDB and Redis join
     the registry as critical checks in steps 05 and 14. */
  app.health.register(createMlHealthCheck(env.ML_SERVICE_URL));

  const server = app.express.listen(env.PORT, () => {
    logger.info(
      {
        version: VERSION,
        port: env.PORT,
        environment: env.NODE_ENV,
        timezone: env.TZ,
        demoMode: env.DEMO_MODE,
        errorTracking: errorTracker.enabled,
        healthChecks: app.health.names(),
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

    server.close(() => {
      logger.info('shutdown complete');
      process.exit(0);
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
