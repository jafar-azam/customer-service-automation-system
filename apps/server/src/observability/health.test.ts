import { describe, expect, it } from 'vitest';
import { HealthRegistry } from './health.js';

const pass = () => Promise.resolve();
const fail = (message: string) => () => Promise.reject(new Error(message));

describe('readiness', () => {
  it('is ready when every check passes', async () => {
    const registry = new HealthRegistry()
      .register({ name: 'mongo', critical: true, probe: pass })
      .register({ name: 'ml', critical: false, probe: pass });

    const report = await registry.run();
    expect(report.status).toBe('ready');
    expect(report.checks['mongo']?.status).toBe('pass');
    expect(report.checks['ml']?.status).toBe('pass');
  });

  it('is not ready when a critical check fails', async () => {
    const registry = new HealthRegistry().register({
      name: 'mongo',
      critical: true,
      probe: fail('connection refused'),
    });

    const report = await registry.run();
    expect(report.status).toBe('not_ready');
    expect(report.checks['mongo']?.reason).toBe('connection refused');
  });

  /* The distinction the whole design rests on: the assistant has a degraded
     mode without the ML service, so its absence must not stop traffic. */
  it('stays ready when a non-critical check fails, but reports it', async () => {
    const registry = new HealthRegistry()
      .register({ name: 'mongo', critical: true, probe: pass })
      .register({ name: 'ml', critical: false, probe: fail('ml service answered 503') });

    const report = await registry.run();
    expect(report.status).toBe('ready');
    expect(report.checks['ml']?.status).toBe('fail');
  });

  it('treats a probe that never settles as a failure', async () => {
    const registry = new HealthRegistry().register({
      name: 'mongo',
      critical: true,
      timeoutMs: 10,
      probe: () => new Promise<void>(() => undefined),
    });

    const report = await registry.run();
    expect(report.status).toBe('not_ready');
    expect(report.checks['mongo']?.reason).toContain('timed out');
  });

  it('runs every check even when one fails', async () => {
    const registry = new HealthRegistry()
      .register({ name: 'a', critical: true, probe: fail('down') })
      .register({ name: 'b', critical: false, probe: pass });

    const report = await registry.run();
    expect(Object.keys(report.checks).sort()).toEqual(['a', 'b']);
  });

  it('reports a non-Error rejection without crashing', async () => {
    const registry = new HealthRegistry().register({
      name: 'odd',
      critical: true,
      /* A driver that throws a string is the case this guards; eslint is right
         that application code should not, which is why it is written here. */
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      probe: () => Promise.reject('just a string'),
    });

    const report = await registry.run();
    expect(report.checks['odd']?.reason).toBe('unknown error');
  });

  it('is ready with no checks registered', async () => {
    expect((await new HealthRegistry().run()).status).toBe('ready');
  });

  it('replaces a check registered twice under the same name', async () => {
    const registry = new HealthRegistry()
      .register({ name: 'mongo', critical: true, probe: fail('old') })
      .register({ name: 'mongo', critical: true, probe: pass });

    const report = await registry.run();
    expect(report.status).toBe('ready');
    expect(registry.names()).toEqual(['mongo']);
  });
});
