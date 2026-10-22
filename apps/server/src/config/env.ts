import { createEnv, EnvValidationError, type Env } from '@csas/shared';

let cached: Env | undefined;

/**
 * The process environment, validated once.
 *
 * Deliberately lazy rather than validated at import time: a module that throws
 * while being imported produces a stack trace pointing at the import, not at
 * the misconfiguration, and makes the module impossible to load in a test that
 * does not care about the environment.
 */
export function getEnv(): Env {
  cached ??= createEnv(process.env);
  return cached;
}

/** Test-only: forget the cached environment. */
export function resetEnvCache(): void {
  cached = undefined;
}

export { EnvValidationError };
