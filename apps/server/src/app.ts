import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { Env } from '@csas/shared';
import { createErrorHandler, notFoundHandler } from './http/errors.js';
import { observabilityMiddleware } from './http/observability-middleware.js';
import { DisabledErrorTracker, type ErrorTracker } from './observability/error-tracking.js';
import { HealthRegistry } from './observability/health.js';
import { createMetrics, type Metrics } from './observability/metrics.js';
import { healthRouter } from './routes/health.js';
import { metricsRouter } from './routes/metrics.js';
import { versionRouter } from './routes/version.js';

export interface AppOptions {
  readonly env: Env;
  readonly version: string;
  readonly logger: Logger;
  /** Supplied by tests that need to assert on what was recorded. */
  readonly metrics?: Metrics;
  readonly health?: HealthRegistry;
  readonly errorTracker?: ErrorTracker;
  readonly startedAt?: number;
}

export interface App {
  readonly express: Express;
  readonly metrics: Metrics;
  readonly health: HealthRegistry;
}

/**
 * Builds the Express application.
 *
 * Takes its configuration and its collaborators as arguments instead of
 * reaching for the environment or a module-level singleton, so a test can
 * construct an app with any configuration, a silent logger and its own metrics
 * registry — and two tests in the same file cannot interfere with each other.
 */
export function createApp({
  env,
  version,
  logger,
  metrics = createMetrics(),
  health = new HealthRegistry(),
  errorTracker = new DisabledErrorTracker(),
  startedAt = Date.now(),
}: AppOptions): App {
  const app = express();

  /* Advertising the framework and version only helps someone matching known
     CVEs against this host. */
  app.disable('x-powered-by');

  /* Trust exactly one proxy hop — the local nginx. Without this `req.ip` is the
     proxy's address for every request, which would make per-IP rate limiting
     (step 08) throttle all customers as one. Trusting the whole chain instead
     would let a caller forge `X-Forwarded-For` and *evade* that same limit. */
  app.set('trust proxy', 1);

  /* First, so that everything after it — including a body-parser rejection —
     runs inside a request context and is counted. */
  app.use(observabilityMiddleware({ logger, metrics }));

  /* A request-size limit is a denial-of-service control, not a nicety: without
     it a single request can allocate as much memory as it likes. Uploads do not
     come through this parser; they get their own limits in step 12. */
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(metricsRouter(metrics));
  app.use('/api', healthRouter({ registry: health, version, startedAt }));
  app.use('/api', versionRouter({ name: 'csas-server', version, environment: env.NODE_ENV }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, metrics, errorTracker }));

  return { express: app, metrics, health };
}
