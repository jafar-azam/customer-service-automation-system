import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from 'pino';
import type { Metrics } from '../observability/metrics.js';
import { matchedRoutePath, routeLabel } from '../observability/metrics.js';
import { runWithRequestContext } from '../observability/request-context.js';

/** An inbound id must look like one before it is echoed into logs and headers. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Accepts a caller-supplied `x-request-id` only if it is short and
 * alphanumeric, and generates one otherwise.
 *
 * Trusting the header as sent is a log-injection hole: a value containing a
 * newline and a fabricated JSON object writes attacker-controlled *log lines*,
 * which is how an intruder covers their tracks in a system where the log is the
 * evidence. Honouring a well-formed one is still worth it — nginx and any
 * future client can then correlate their own trace with ours.
 */
export function resolveRequestId(header: unknown): string {
  if (typeof header === 'string' && SAFE_REQUEST_ID.test(header)) return header;
  return randomUUID();
}

export interface ObservabilityOptions {
  readonly logger: Logger;
  readonly metrics: Metrics;
  /** Paths whose successful requests are not logged (health checks, metrics). */
  readonly quietPaths?: readonly string[];
}

/**
 * One middleware for request id, access log and HTTP metrics.
 *
 * They are together because they share the same `res.on('finish')` moment and
 * the same route label; splitting them would mean three listeners and three
 * chances for the route label to disagree.
 */
export function observabilityMiddleware({
  logger,
  metrics,
  quietPaths = ['/api/health', '/api/ready', '/metrics'],
}: ObservabilityOptions): RequestHandler {
  const quiet = new Set(quietPaths);

  return function observability(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    const startedAt = process.hrtime.bigint();
    /* Read now, not in the `finish` handler: Express rewrites `req.url` as a
       request descends into a mounted router, so by the time the response ends
       `req.path` is relative to the mount point (`/health`, not
       `/api/health`). Capturing it here keeps the log and the quiet-path list
       talking about the same thing. */
    const path = req.path;

    /* Echoed so a customer reporting a problem can quote it, and so a support
       engineer can find every line for that request with one search. */
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const route = routeLabel(req.baseUrl, matchedRoutePath(req));
      const labels = { method: req.method, route, status: String(res.statusCode) };

      metrics.httpRequestDuration.observe(labels, durationSeconds);
      metrics.httpRequestsTotal.inc(labels);

      /* Health checks run every ten seconds forever. Logging them buries the
         requests that matter — but a *failing* health check is exactly what
         someone will be looking for, so only the successful ones are quiet. */
      if (quiet.has(path) && res.statusCode < 400) return;

      const line = {
        requestId,
        method: req.method,
        /* The path, never `req.originalUrl`: the query string can carry a
           token or a phone number, and this is the one place a URL is written
           to disk. Route parameters are visible in `route`. */
        path,
        route,
        status: res.statusCode,
        durationMs: Math.round(durationSeconds * 1000),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };

      if (res.statusCode >= 500) logger.error(line, 'request failed');
      else if (res.statusCode >= 400) logger.warn(line, 'request rejected');
      else logger.info(line, 'request completed');
    });

    runWithRequestContext({ requestId }, next);
  };
}
