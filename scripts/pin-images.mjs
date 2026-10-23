#!/usr/bin/env node
/**
 * Rewrites every base-image reference in the repository to `tag@sha256:...`.
 *
 * Why: a tag is mutable. `mongo:8` today and `mongo:8` next month can be
 * different bytes, which means a build is not reproducible and a compromised
 * upstream tag is invisible. A digest is the image's content hash.
 *
 * Needs Docker running, because the digest comes from the registry:
 *
 *     docker compose pull && npm run pin:images
 *
 * Re-running it after a deliberate version bump is the intended workflow; the
 * diff then shows exactly which images changed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FILES = [
  'docker-compose.yml',
  'apps/server/Dockerfile',
  'apps/client/Dockerfile',
  'apps/ml/Dockerfile',
];

/**
 * `image: foo:1.2` / `ARG X=foo:1.2` / `FROM foo:1.2`, digest not yet applied.
 *
 * The trailing lookahead rejects *any* continuation of the tag, not just `@`.
 * `(?!@)` alone is not enough: the engine simply backtracks the tag one
 * character short, so `ollama/ollama:latest@sha256:...` matches as
 * `ollama/ollama:lates` and the file is rewritten with a corrupted tag. That
 * bug shipped once; `pin-images.test.mjs` is what keeps it from shipping twice.
 *
 * A local build stage (`FROM deps AS build`) carries no tag, so it cannot match.
 * The `=` branch is narrowed to `ARG NAME=` for the same class of reason: a
 * bare `=` also matches `COPY --chown=node:node`, which is a user and a group,
 * not an image.
 */
export const REFERENCE =
  /((?:image:\s*|FROM\s+|\bARG\s+[A-Za-z_][A-Za-z0-9_]*=)\s*)([a-z0-9][a-z0-9._/-]*:[A-Za-z0-9._-]+)(?![A-Za-z0-9._@-])/g;

/**
 * Rewrites every registry reference in `text` to `tag@sha256:...`, asking
 * `resolve(reference)` for each digest. Separated from file and Docker access
 * so the rewrite rules can be tested without either.
 */
export function pinReferences(text, resolve, onSkip = () => {}) {
  const resolved = new Map();
  const updated = text.replace(REFERENCE, (match, prefix, reference) => {
    try {
      if (!resolved.has(reference)) resolved.set(reference, resolve(reference));
      return `${prefix}${reference}@${resolved.get(reference)}`;
    } catch (error) {
      onSkip(reference, error);
      return match;
    }
  });
  return { text: updated, resolved };
}

function digestOf(reference) {
  const output = execFileSync(
    'docker',
    ['image', 'inspect', reference, '--format', '{{index .RepoDigests 0}}'],
    { encoding: 'utf8' },
  ).trim();
  const digest = output.split('@')[1];
  if (!digest?.startsWith('sha256:')) {
    throw new Error(`no digest for ${reference} — run \`docker pull ${reference}\` first`);
  }
  return digest;
}

function main() {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' });
  } catch {
    console.error('pin-images: Docker is not available. Start Docker Desktop and try again.');
    process.exitCode = 1;
    return;
  }

  const cache = new Map();
  const resolve = (reference) => {
    if (!cache.has(reference)) cache.set(reference, digestOf(reference));
    return cache.get(reference);
  };
  const onSkip = (reference, error) =>
    console.warn(`pin-images: skipped ${reference} — ${error.message}`);
  let changed = 0;

  for (const file of FILES) {
    const original = readFileSync(file, 'utf8');
    const { text: updated } = pinReferences(original, resolve, onSkip);

    if (updated !== original) {
      writeFileSync(file, updated);
      changed += 1;
      console.log(`pin-images: updated ${file}`);
    }
  }

  for (const [reference, digest] of cache) console.log(`  ${reference} -> ${digest}`);
  console.log(`pin-images: ${String(changed)} file(s) changed`);
}

/* Importable for tests; only the CLI invocation runs main(). */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
