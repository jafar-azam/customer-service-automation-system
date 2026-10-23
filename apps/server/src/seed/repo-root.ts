import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The monorepo root, found by walking up from this file.
 *
 * `process.cwd()` is not it. npm runs a workspace script with the *workspace*
 * as the working directory, so `data/external/techqa` resolved to
 * `apps/server/data/external/techqa` and the seed quietly reported "no corpus
 * found" while the corpus sat where it was supposed to be. Resolving against
 * the repository root makes the configured paths mean the same thing however
 * the script is invoked — from the root, from a workspace, or from a container.
 */
export function findRepoRoot(startDir = import.meta.dirname): string {
  let current = startDir;
  for (let depth = 0; depth < 10; depth += 1) {
    const manifest = join(current, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (parsed.workspaces !== undefined) return current;
      } catch {
        /* An unreadable package.json on the way up is not fatal: keep walking. */
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  /* In a container the app is copied without the root manifest. Falling back to
     cwd keeps the seed working there, where paths are absolute anyway. */
  return process.cwd();
}

/** Absolute paths are honoured as given; relative ones hang off the repo root. */
export function resolveFromRepoRoot(path: string): string {
  return resolve(findRepoRoot(), path);
}
