import { createApp } from './app.js';
import { EnvValidationError, getEnv } from './config/env.js';

const VERSION = '0.1.0';

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

  const app = createApp({ env, version: VERSION });
  const server = app.listen(env.PORT, () => {
    process.stdout.write(
      `csas-server ${VERSION} listening on :${String(env.PORT)} (${env.NODE_ENV})\n`,
    );
  });

  /* Containers are stopped with SIGTERM. Without this the orchestrator waits
     for a timeout and then kills the process mid-request. */
  const shutdown = (signal: string): void => {
    process.stdout.write(`${signal} received, closing server\n`);
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
}

main();
