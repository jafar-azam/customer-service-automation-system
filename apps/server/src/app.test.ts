import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { ApiError, createErrorHandler } from './http/errors.js';
import { DisabledErrorTracker } from './observability/error-tracking.js';
import { createMetrics } from './observability/metrics.js';
import { capturingLogger, silentLogger, testEnv } from './test-support.js';

const env = testEnv();

function buildApp() {
  return createApp({
    env,
    version: '0.1.0',
    logger: silentLogger(),
    metrics: createMetrics({ collectDefaults: false }),
  });
}

const app = buildApp().express;

describe('GET /api/version', () => {
  it('reports the name, version and environment', async () => {
    const response = await request(app).get('/api/version');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: 'csas-server',
      version: '0.1.0',
      environment: 'test',
    });
  });

  it('does not advertise the framework', async () => {
    const response = await request(app).get('/api/version');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('unknown routes', () => {
  it('answer 404 in the standard error shape', async () => {
    const response = await request(app).get('/api/does-not-exist');
    expect(response.status).toBe(404);
    const body = response.body as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toBe('Resource not found');
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it('do not leak the requested path back to the caller', async () => {
    const response = await request(app).get('/api/%3Cscript%3E');
    expect(JSON.stringify(response.body)).not.toContain('script');
  });
});

describe('request size limits', () => {
  it('answers 413, not 500, for a body over the JSON limit', async () => {
    const response = await request(app)
      .post('/api/version')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(200_000) }));
    expect(response.status).toBe(413);
    expect((response.body as { error: { code: string } }).error.code).toBe('payload_too_large');
  });

  it('answers 400 for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/version')
      .set('Content-Type', 'application/json')
      .send('{"unclosed":');
    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('invalid_json');
  });
});

describe('errorHandler', () => {
  /* Mounted on a throwaway app so the failure modes can be triggered directly. */
  function failingApp() {
    const metrics = createMetrics({ collectDefaults: false });
    const failing = express();
    failing.get('/api-error', () => {
      throw ApiError.badRequest('Missing field', { field: 'phone' });
    });
    failing.get('/unknown-error', () => {
      throw new Error('connection string mongodb://user:pw@host/db failed');
    });
    failing.use(
      createErrorHandler({
        logger: silentLogger(),
        metrics,
        errorTracker: new DisabledErrorTracker(),
      }),
    );
    return { failing, metrics };
  }

  it('reports an ApiError with its code, message and details', async () => {
    const response = await request(failingApp().failing).get('/api-error');
    expect(response.status).toBe(400);
    const body = response.body as { error: { code: string; details: unknown } };
    expect(body.error.code).toBe('bad_request');
    expect(body.error.details).toEqual({ field: 'phone' });
  });

  it('reduces an unexpected error to a bare 500, leaking nothing', async () => {
    const response = await request(failingApp().failing).get('/unknown-error');
    expect(response.status).toBe(500);
    const serialised = JSON.stringify(response.body);
    expect((response.body as { error: { code: string } }).error.code).toBe('internal_error');
    expect(serialised).not.toContain('mongodb');
    expect(serialised).not.toContain('pw@host');
  });

  it('logs rather than crashing when an error arrives after the response started', async () => {
    const captured = capturingLogger();
    const late = express();
    late.get('/late', (_req, res) => {
      res.status(200).json({ ok: true });
      throw new Error('too late to change the status code');
    });
    late.use(
      createErrorHandler({
        logger: captured.logger,
        metrics: createMetrics({ collectDefaults: false }),
        errorTracker: new DisabledErrorTracker(),
      }),
    );

    const response = await request(late).get('/late');
    expect(response.status).toBe(200);
    expect(captured.lines.some((line) => line.msg === 'error after response started')).toBe(true);
  });

  it('gives ApiError.notFound a default message', () => {
    expect(ApiError.notFound().message).toBe('Resource not found');
  });

  it('counts every answered error by code', async () => {
    const { failing, metrics } = failingApp();
    await request(failing).get('/api-error');
    await request(failing).get('/unknown-error');
    const text = await metrics.registry.metrics();
    expect(text).toContain('csas_errors_total{code="bad_request"');
    expect(text).toContain('csas_errors_total{code="internal_error"');
  });
});
