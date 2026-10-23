import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMlHealthCheck } from './dependencies.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(implementation: (url: URL) => Promise<Response> | Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => Promise.resolve(implementation(input as URL))),
  );
}

describe('the ML service health check', () => {
  it('is non-critical, because the assistant degrades without it', () => {
    const check = createMlHealthCheck('http://ml:8000');
    expect(check.critical).toBe(false);
    expect(check.name).toBe('ml');
  });

  it('passes when the service answers 200', async () => {
    stubFetch(() => new Response('{"status":"ok"}', { status: 200 }));
    await expect(createMlHealthCheck('http://ml:8000').probe()).resolves.toBeUndefined();
  });

  it('calls the unauthenticated liveness endpoint', async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url.toString());
      return new Response('', { status: 200 });
    });
    await createMlHealthCheck('http://ml:8000').probe();
    expect(seen).toEqual(['http://ml:8000/health']);
  });

  it('fails when the service answers an error status', async () => {
    stubFetch(() => new Response('', { status: 503 }));
    await expect(createMlHealthCheck('http://ml:8000').probe()).rejects.toThrow('503');
  });

  /* The readiness response is public, so the reason must name the status and
     nothing about where the service lives. */
  it('does not put the internal hostname in the failure reason', async () => {
    stubFetch(() => new Response('', { status: 500 }));
    await expect(createMlHealthCheck('http://ml-internal:8000').probe()).rejects.toThrow(
      /^ml service answered 500$/,
    );
  });

  it('fails when the connection is refused', async () => {
    stubFetch(() => Promise.reject(new Error('fetch failed')));
    await expect(createMlHealthCheck('http://ml:8000').probe()).rejects.toThrow('fetch failed');
  });
});
