import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { resolveRequestId } from '../http/observability-middleware.js';
import { capturingLogger, testEnv } from '../test-support.js';
import { HealthRegistry } from './health.js';
import { createMetrics } from './metrics.js';
import { routeLabel } from './metrics.js';
import { DisabledErrorTracker, LoggingErrorTracker, scrub } from './error-tracking.js';

const env = testEnv();

function build(health = new HealthRegistry()) {
  const captured = capturingLogger();
  const app = createApp({
    env,
    version: '0.1.0',
    logger: captured.logger,
    metrics: createMetrics({ collectDefaults: false }),
    health,
  });
  return { app, lines: captured.lines };
}

describe('GET /api/health', () => {
  it('reports ok without touching any dependency', async () => {
    /* A critical dependency is down; liveness must still answer 200, or a
       database blip would make the orchestrator restart healthy servers. */
    const health = new HealthRegistry().register({
      name: 'mongo',
      critical: true,
      probe: () => Promise.reject(new Error('down')),
    });
    const response = await request(build(health).app.express).get('/api/health');
    expect(response.status).toBe(200);
    expect((response.body as { status: string }).status).toBe('ok');
  });
});

describe('GET /api/ready', () => {
  it('answers 200 when every critical dependency passes', async () => {
    const health = new HealthRegistry().register({
      name: 'mongo',
      critical: true,
      probe: () => Promise.resolve(),
    });
    const response = await request(build(health).app.express).get('/api/ready');
    expect(response.status).toBe(200);
    expect((response.body as { status: string }).status).toBe('ready');
  });

  it('answers 503 when a critical dependency fails', async () => {
    const health = new HealthRegistry().register({
      name: 'mongo',
      critical: true,
      probe: () => Promise.reject(new Error('connection refused')),
    });
    const response = await request(build(health).app.express).get('/api/ready');
    expect(response.status).toBe(503);
    expect((response.body as { status: string }).status).toBe('not_ready');
  });

  it('never reveals a connection string in the reason it gives', async () => {
    const health = new HealthRegistry().register({
      name: 'mongo',
      critical: true,
      probe: () => Promise.reject(new Error('connection refused')),
    });
    const response = await request(build(health).app.express).get('/api/ready');
    expect(JSON.stringify(response.body)).not.toContain('mongodb://');
  });
});

describe('GET /metrics', () => {
  it('serves Prometheus text', async () => {
    const { app } = build();
    await request(app.express).get('/api/version');
    const response = await request(app.express).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('http_requests_total');
  });

  it('labels requests with the route pattern, not the raw path', async () => {
    const { app } = build();
    await request(app.express).get('/api/version');
    const response = await request(app.express).get('/metrics');
    expect(response.text).toContain('route="/api/version"');
  });

  /* High-cardinality labels are the standard way to melt a metrics store, and
     an unauthenticated 404 path is attacker-controlled input. */
  it('collapses unmatched paths to a single label', async () => {
    const { app } = build();
    await request(app.express).get('/api/not-a-route-1');
    await request(app.express).get('/api/not-a-route-2');
    const response = await request(app.express).get('/metrics');
    expect(response.text).toContain('route="unmatched"');
    expect(response.text).not.toContain('not-a-route-1');
  });

  it('is not served under /api, so the proxy does not expose it', async () => {
    const response = await request(build().app.express).get('/api/metrics');
    expect(response.status).toBe(404);
  });
});

describe('routeLabel', () => {
  it('joins the mount point and the route pattern', () => {
    expect(routeLabel('/api', '/tickets/:id')).toBe('/api/tickets/:id');
  });

  it('reports the root as /', () => {
    expect(routeLabel('', '')).toBe('/');
  });

  it('reports an unmatched request as unmatched', () => {
    expect(routeLabel('/api', undefined)).toBe('unmatched');
  });
});

describe('request id', () => {
  it('is returned in a header on every response', async () => {
    const response = await request(build().app.express).get('/api/version');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is echoed back when the caller supplies a safe one', async () => {
    const response = await request(build().app.express)
      .get('/api/version')
      .set('x-request-id', 'edge-abc-123');
    expect(response.headers['x-request-id']).toBe('edge-abc-123');
  });

  it('is in the error body, so a customer can quote it', async () => {
    const response = await request(build().app.express).get('/api/nope');
    const body = response.body as { error: { requestId: string } };
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('ties the access-log line to the response header', async () => {
    const { app, lines } = build();
    const response = await request(app.express).get('/api/version');
    const logged = lines.find((line) => line.msg === 'request completed');
    expect(logged?.requestId).toBe(response.headers['x-request-id']);
  });

  describe('resolveRequestId', () => {
    it('generates one when the header is absent', () => {
      expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    });

    /* Log injection: a header carrying a newline and a fabricated JSON object
       would write attacker-controlled *log lines* into the evidence trail. */
    it('rejects a value containing a newline', () => {
      const forged = 'abcdefgh\n{"level":"info","msg":"nothing to see here"}';
      expect(resolveRequestId(forged)).not.toBe(forged);
    });

    it('rejects a value that is too long to be an id', () => {
      expect(resolveRequestId('x'.repeat(65))).toHaveLength(36);
    });

    it('rejects a value that is too short', () => {
      expect(resolveRequestId('abc')).toHaveLength(36);
    });

    it('rejects punctuation that would break a log parser', () => {
      expect(resolveRequestId('abc"def"ghi')).toHaveLength(36);
    });
  });
});

describe('access logging', () => {
  it('records method, route, status and duration', async () => {
    const { app, lines } = build();
    await request(app.express).get('/api/version');
    const logged = lines.find((line) => line.msg === 'request completed');
    expect(logged).toMatchObject({ method: 'GET', route: '/api/version', status: 200 });
    expect(logged?.durationMs).toEqual(expect.any(Number));
  });

  /* `req.originalUrl` would put the query string — tokens, phone numbers — into
     the one place that is written to disk and kept. */
  it('logs the path without the query string', async () => {
    const { app, lines } = build();
    await request(app.express).get('/api/version?phone=%2B96170123456');
    const logged = lines.find((line) => line.msg === 'request completed');
    expect(logged?.path).toBe('/api/version');
    expect(JSON.stringify(lines)).not.toContain('96170123456');
  });

  it('stays quiet about successful health checks', async () => {
    const { app, lines } = build();
    await request(app.express).get('/api/health');
    expect(lines.some((line) => line.msg === 'request completed')).toBe(false);
  });

  it('still logs a failing health check', async () => {
    const health = new HealthRegistry().register({
      name: 'mongo',
      critical: true,
      probe: () => Promise.reject(new Error('down')),
    });
    const { app, lines } = build(health);
    await request(app.express).get('/api/ready');
    expect(lines.some((line) => line.msg === 'request failed')).toBe(true);
  });

  it('logs a rejected request as a warning, not an error', async () => {
    const { app, lines } = build();
    await request(app.express).get('/api/nope');
    expect(lines.some((line) => line.msg === 'request rejected' && line.status === 404)).toBe(true);
  });
});

describe('error tracking', () => {
  it('is disabled by default and captures nothing', () => {
    const tracker = new DisabledErrorTracker();
    expect(tracker.enabled).toBe(false);
    expect(() => {
      tracker.capture({ error: new Error('boom') });
    }).not.toThrow();
  });

  it('scrubs personal data before an event leaves the process', () => {
    const scrubbed = scrub({
      user: { email: 'rania@example.com', phoneNumber: '+96170123456' },
      body: { password: 'hunter2', message: 'الطابعة ما عم تشتغل' },
      ticketId: 'tkt_123',
    });
    const serialised = JSON.stringify(scrubbed);
    expect(serialised).not.toContain('rania@example.com');
    expect(serialised).not.toContain('96170123456');
    expect(serialised).not.toContain('hunter2');
    /* The customer's own words are the richest personal data in the system and
       are never needed to fix a crash. */
    expect(serialised).not.toContain('الطابعة');
    expect(serialised).toContain('tkt_123');
  });

  it('truncates rather than recursing forever', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'too far' } } } } } };
    expect(JSON.stringify(scrub(deep))).toContain('[truncated]');
  });

  it('scrubs inside arrays', () => {
    const scrubbed = scrub({ users: [{ email: 'a@example.com' }] });
    expect(JSON.stringify(scrubbed)).not.toContain('a@example.com');
  });

  it('records what it would have sent when a DSN is set but no collector exists', () => {
    const captured = capturingLogger();
    const tracker = new LoggingErrorTracker(captured.logger);
    tracker.capture({
      error: new Error('boom'),
      requestId: 'req-1',
      extra: { password: 'hunter2' },
    });
    expect(captured.lines).toHaveLength(1);
    expect(JSON.stringify(captured.lines[0])).not.toContain('hunter2');
  });
});
