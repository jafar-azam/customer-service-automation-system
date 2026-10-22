import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

afterEach(() => {
  /* `restoreAllMocks` does not undo `stubGlobal`; the component cleanup itself
     lives in src/test-setup.ts. */
  vi.unstubAllGlobals();
});

function mockFetch(implementation: () => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(implementation));
}

const versionResponse = (): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify({ name: 'csas-server', version: '0.1.0', environment: 'test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

describe('App', () => {
  it('renders the product name while loading', () => {
    mockFetch(() => new Promise(() => undefined));
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('C.S.A.S');
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('shows what the API reported', async () => {
    mockFetch(versionResponse);
    render(<App />);
    expect(await screen.findByText('csas-server')).toBeDefined();
    expect(screen.getByText('0.1.0')).toBeDefined();
  });

  it('tells the user when the API cannot be reached', async () => {
    mockFetch(() => Promise.reject(new Error('network_down')));
    render(<App />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('not reachable');
  });

  it('surfaces a non-2xx response as an error rather than rendering nothing', async () => {
    mockFetch(() => Promise.resolve(new Response('nope', { status: 503 })));
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('http_503');
  });
});
