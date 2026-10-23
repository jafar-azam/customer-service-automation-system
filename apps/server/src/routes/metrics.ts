import { Router } from 'express';
import type { Metrics } from '../observability/metrics.js';

/**
 * `/metrics` in Prometheus text format.
 *
 * Mounted outside `/api` on purpose. The local reverse proxy forwards only
 * `/api/`, `/socket.io/` and the client, so this endpoint is reachable from
 * inside the Compose network and from a direct connection to the container, but
 * not from the published port. That is the whole access control, and it is the
 * right one here: metrics describe internal behaviour — route names, error
 * codes, queue depths — which is reconnaissance material, and a scrape endpoint
 * is also cheap to hammer.
 *
 * Production adds an allow-list on the scrape path at the proxy
 * (docs/roadmap/PRODUCTION.md, P7); it is not needed while nothing exposes it.
 */
export function metricsRouter(metrics: Metrics): Router {
  const router = Router();

  router.get('/metrics', (_req, res, next) => {
    metrics.registry
      .metrics()
      .then((body) => {
        res.setHeader('content-type', metrics.registry.contentType);
        res.send(body);
      })
      .catch(next);
  });

  return router;
}
