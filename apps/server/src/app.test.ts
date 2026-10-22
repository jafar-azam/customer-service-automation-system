import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createEnv } from '@csas/shared';
import { createApp } from './app.js';
import { ApiError, errorHandler } from './http/errors.js';

const env = createEnv({
  NODE_ENV: 'test',
  APP_BASE_URL: 'http://localhost:8080',
  CORS_ORIGINS: 'http://localhost:8080',
  MONGODB_URI: 'mongodb://localhost:27017/csas-test',
  REDIS_URL: 'redis://localhost:6379',
  ACCESS_TOKEN_SECRET: 'a'.repeat(32),
  REFRESH_TOKEN_SECRET: 'b'.repeat(32),
  PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  PHONE_HASH_PEPPER: 'c'.repeat(32),
  SEED_ADMIN_EMAIL: 'admin@csas.test',
  SEED_ADMIN_PASSWORD: 'correct-horse-battery', // secret-scan:allow
  ML_SERVICE_TOKEN: 'd'.repeat(32),
});

const app = createApp({ env, version: '0.1.0' });

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
    expect(response.body).toEqual({
      error: { code: 'not_found', message: 'Resource not found' },
    });
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
    expect(response.body).toEqual({
      error: {
        code: 'payload_too_large',
        message: 'Request body is larger than the allowed limit',
      },
    });
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
  const failing = express();
  failing.get('/api-error', () => {
    throw ApiError.badRequest('Missing field', { field: 'phone' });
  });
  failing.get('/unknown-error', () => {
    throw new Error('connection string mongodb://user:pw@host/db failed');
  });
  failing.use(errorHandler);

  it('reports an ApiError with its code, message and details', async () => {
    const response = await request(failing).get('/api-error');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'bad_request', message: 'Missing field', details: { field: 'phone' } },
    });
  });

  it('reduces an unexpected error to a bare 500, leaking nothing', async () => {
    const response = await request(failing).get('/unknown-error');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error' },
    });
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('mongodb');
    expect(serialised).not.toContain('pw@host');
  });
});
