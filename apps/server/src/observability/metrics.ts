import type { Request } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics, type Metric } from 'prom-client';

/**
 * Prometheus metrics.
 *
 * Deliberately a Prometheus text endpoint rather than OpenTelemetry: the
 * specification allows either, a scrape endpoint needs no collector process to
 * run alongside a laptop stack, and the same endpoint is what a hosted
 * Prometheus would read later. The OpenTelemetry swap is in the roadmap.
 *
 * The registry is created per application rather than kept in a module-level
 * singleton. A singleton registry throws "metric already registered" the second
 * time a test builds an app, which pushes people towards sharing one app across
 * tests — and then tests leak state into each other.
 */

export interface Metrics {
  readonly registry: Registry;
  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status'>;
  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status'>;
  readonly errorsTotal: Counter<'code'>;
}

export interface MetricsOptions {
  /** Node process metrics (heap, event-loop lag, GC). Off in tests: noise. */
  readonly collectDefaults?: boolean;
}

export function createMetrics({ collectDefaults = true }: MetricsOptions = {}): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: 'csas-server' });

  if (collectDefaults) collectDefaultMetrics({ register: registry });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    /* Tuned to the alert thresholds this project actually has: the SLA for an
       API call is p95 < 500 ms (excluding AI time), so the buckets are dense
       either side of it and sparse out where only AI calls land. */
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  });

  const errorsTotal = new Counter({
    name: 'csas_errors_total',
    help: 'Errors answered to clients, by error code',
    labelNames: ['code'] as const,
    registers: [registry],
  });

  return { registry, httpRequestDuration, httpRequestsTotal, errorsTotal };
}

/**
 * The label for a request's route.
 *
 * Express gives the matched route pattern (`/api/tickets/:id`), which is what
 * must be used: labelling with the raw path would create one time series per
 * ticket id and melt any Prometheus pointed at it — the standard "high
 * cardinality" failure. An unmatched path is reported as `unmatched`, never as
 * itself, so a scanner probing random URLs cannot inflate the metric store
 * either. That makes it a denial-of-service control as much as a tidiness one.
 */
export function routeLabel(baseUrl: string, routePath: string | undefined): string {
  if (routePath === undefined) return 'unmatched';
  const combined = `${baseUrl}${routePath}`;
  return combined === '' ? '/' : combined;
}

/**
 * The matched route's pattern, if routing got that far.
 *
 * `req.route` is typed `any` by @types/express, so reading `.path` off it
 * directly defeats the type-aware lint rules that exist to stop exactly that.
 * One narrow accessor keeps the `any` in a single place.
 */
export function matchedRoutePath(req: Request): string | undefined {
  const route: unknown = req.route;
  if (typeof route !== 'object' || route === null) return undefined;
  const path = (route as { path?: unknown }).path;
  return typeof path === 'string' ? path : undefined;
}

export type { Metric, Registry };
