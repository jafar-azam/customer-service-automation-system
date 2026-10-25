import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every source file is actually committed.
 *
 * This exists because six files were not. `.gitignore` carried an unanchored
 * `models/`, meant for trained ML artefacts at the repository root; an
 * unanchored pattern matches a directory of that name at *any* depth, so it
 * also matched `apps/server/src/db/models/` — the entire data layer. Every
 * local build worked, because the files were on disk. The first CI run could
 * not build the server image at all.
 *
 * The class of bug is the same one the smoke test exists for: **what runs
 * locally is not what ships.** A unit test cannot see it, because the test
 * runner reads the working tree too. Only git knows.
 */

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/**
 * Whether git can answer at all.
 *
 * A source tarball — or a `git archive` export, which is how the runner's
 * context was reproduced while diagnosing this — has no `.git`, and these
 * checks are meaningless there rather than failing. Skipping is honest; an
 * error would say "the sources are untracked" when the truth is "there is no
 * repository to ask".
 */
const inWorkTree = (() => {
  try {
    return git('rev-parse', '--is-inside-work-tree') === 'true';
  } catch {
    return false;
  }
})();

/** Files git would refuse to commit, limited to real source directories. */
function ignoredSources() {
  const listed = git(
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--',
    'apps/*/src',
    'packages/*/src',
    'scripts',
    'infra',
  );
  return listed === '' ? [] : listed.split('\n');
}

describe.skipIf(!inWorkTree)('nothing under a source directory is git-ignored', () => {
  it('tracks every source file', () => {
    expect(ignoredSources()).toEqual([]);
  });

  /* The specific regression, named so the reason survives the fix. */
  it('still tracks the data layer', () => {
    const tracked = git('ls-files', 'apps/server/src/db/models').split('\n').filter(Boolean);
    expect(tracked.length).toBeGreaterThanOrEqual(6);
    expect(tracked).toContain('apps/server/src/db/models/index.ts');
  });

  /* An unanchored directory pattern is the trap. `models/` matches at any
     depth; `/models/` matches only the repository root. Anything in this list
     names a common directory name that could plausibly appear inside a source
     tree. */
  it('anchors directory patterns that could match inside a source tree', () => {
    const risky = ['models', 'data', 'build', 'storage', 'logs', 'config', 'assets', 'public'];

    /* The working tree, not HEAD: this must fail on a bad pattern *before* it
       is committed, which is the only moment the fix is cheap. */
    const patterns = readFileSync('.gitignore', 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    const unanchored = patterns.filter((pattern) => {
      const bare = pattern.replace(/\/$/, '');
      return risky.includes(bare) && !pattern.startsWith('/');
    });

    expect(
      unanchored,
      'an unanchored pattern matches a directory of that name at any depth — ' +
        'prefix it with "/" to limit it to the repository root',
    ).toEqual([]);
  });
});
