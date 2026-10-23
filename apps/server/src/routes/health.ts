import { Router } from 'express';
import type { HealthRegistry } from '../observability/health.js';

export interface HealthRouterOptions {
  readonly registry: HealthRegistry;
  readonly version: string;
  readonly startedAt: number;
}

/**
 * `/api/health` and `/api/ready`.
 *
 * Both are unauthenticated, which is a deliberate and bounded exception: the
 * container runtime and any uptime check have no credentials, and a health
 * endpoint that needs a token is a health endpoint nobody calls. The cost is
 * that these two responses are public, so they say *that* a dependency failed
 * and never *why* in a way that describes the infrastructure — check names and
 * the driver's own message only, never a host, a port or a connection string.
 */
export function healthRouter({ registry, version, startedAt }: HealthRouterOptions): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  router.get('/ready', (_req, res, next) => {
    registry
      .run()
      .then((report) => {
        /* 503 so a load balancer or Compose `depends_on` takes this instance
           out of rotation. A 200 with "not_ready" in the body would be read as
           healthy by every piece of infrastructure that matters. */
        res.status(report.status === 'ready' ? 200 : 503).json(report);
      })
      .catch(next);
  });

  return router;
}
