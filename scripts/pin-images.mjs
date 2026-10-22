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

const FILES = [
  'docker-compose.yml',
  'apps/server/Dockerfile',
  'apps/client/Dockerfile',
  'apps/ml/Dockerfile',
];

/** `image: foo:1.2` / `ARG X=foo:1.2` / `FROM foo:1.2`, digest not yet applied. */
const REFERENCE = /((?:image:\s*|FROM\s+|=)\s*)([a-z0-9][a-z0-9._/-]*:[A-Za-z0-9._-]+)(?!@)/g;

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

  const resolved = new Map();
  let changed = 0;

  for (const file of FILES) {
    const original = readFileSync(file, 'utf8');
    const updated = original.replace(REFERENCE, (match, prefix, reference) => {
      /* Local build stages (`FROM deps AS build`) are not registry images. */
      if (!reference.includes('/') && !reference.includes('.') && !/:\d/.test(reference)) {
        return match;
      }
      try {
        if (!resolved.has(reference)) resolved.set(reference, digestOf(reference));
        return `${prefix}${reference}@${resolved.get(reference)}`;
      } catch (error) {
        console.warn(`pin-images: skipped ${reference} — ${error.message}`);
        return match;
      }
    });

    if (updated !== original) {
      writeFileSync(file, updated);
      changed += 1;
      console.log(`pin-images: updated ${file}`);
    }
  }

  for (const [reference, digest] of resolved) console.log(`  ${reference} -> ${digest}`);
  console.log(`pin-images: ${String(changed)} file(s) changed`);
}

main();
