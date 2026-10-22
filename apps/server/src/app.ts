import express, { type Express } from 'express';
import type { Env } from '@csas/shared';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { versionRouter } from './routes/version.js';

export interface AppOptions {
  readonly env: Env;
  readonly version: string;
}

/**
 * Builds the Express application.
 *
 * Takes its configuration as an argument instead of reading the environment,
 * so a test can construct an app with any configuration and without a live
 * process environment.
 */
export function createApp({ env, version }: AppOptions): Express {
  const app = express();

  /* Advertising the framework and version only helps someone matching known
     CVEs against this host. */
  app.disable('x-powered-by');

  /* A request-size limit is a denial-of-service control, not a nicety: without
     it a single request can allocate as much memory as it likes. Uploads do not
     come through this parser; they get their own limits in step 12. */
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use('/api', versionRouter({ name: 'csas-server', version, environment: env.NODE_ENV }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
