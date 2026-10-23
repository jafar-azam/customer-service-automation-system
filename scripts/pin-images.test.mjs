import { describe, expect, it } from 'vitest';
import { pinReferences } from './pin-images.mjs';

const DIGEST = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const OTHER = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
const resolve = () => DIGEST;

describe('references that must be pinned', () => {
  it('pins a compose image', () => {
    const { text } = pinReferences('    image: mongo:8\n', resolve);
    expect(text).toBe(`    image: mongo:8@${DIGEST}\n`);
  });

  it('pins a Dockerfile ARG default', () => {
    const { text } = pinReferences('ARG NODE_IMAGE=node:24.22.1-bookworm-slim\n', resolve);
    expect(text).toBe(`ARG NODE_IMAGE=node:24.22.1-bookworm-slim@${DIGEST}\n`);
  });

  it('pins a FROM line', () => {
    const { text } = pinReferences('FROM nginx:alpine AS serve\n', resolve);
    expect(text).toBe(`FROM nginx:alpine@${DIGEST} AS serve\n`);
  });

  /* nginx:alpine has no slash, no dot and no digit in its tag — the earlier
     "is this a local build stage?" heuristic mistook it for one and left the
     only unpinned image in the stack. */
  it('pins a tag that contains no digits', () => {
    const { text } = pinReferences('    image: nginx:alpine\n', resolve);
    expect(text).toContain(`nginx:alpine@${DIGEST}`);
  });

  it('resolves each distinct reference once', () => {
    const seen = [];
    pinReferences('image: mongo:8\nimage: mongo:8\nimage: redis:8-alpine\n', (reference) => {
      seen.push(reference);
      return DIGEST;
    });
    expect(seen).toEqual(['mongo:8', 'redis:8-alpine']);
  });
});

describe('references that must be left alone', () => {
  /* `COPY --chown=node:node` is a user and a group that happen to be spelled
     like a tagged image. A bare `=` prefix matched it. */
  it('skips a --chown argument', () => {
    const source = 'COPY --chown=node:node apps/client apps/client\n';
    expect(pinReferences(source, resolve).text).toBe(source);
  });

  it('skips a local build stage', () => {
    const source = 'FROM deps AS build\nFROM ${NODE_IMAGE} AS runtime\n';
    expect(pinReferences(source, resolve).text).toBe(source);
  });

  /* The regression this file exists for: a lookahead of (?!@) lets the engine
     backtrack one character and match `ollama:lates`, rewriting the file with a
     tag that does not exist. Re-running the script must be a no-op. */
  it('is idempotent on an already-pinned reference', () => {
    const source = `    image: ollama/ollama:latest@${DIGEST}\n`;
    expect(pinReferences(source, () => OTHER).text).toBe(source);
  });

  it('never truncates a pinned tag', () => {
    const { text } = pinReferences(
      `ARG NODE_IMAGE=node:24.22.1-bookworm-slim@${DIGEST}\n`,
      () => OTHER,
    );
    expect(text).not.toContain('bookworm-sli@');
    expect(text).toContain(`bookworm-slim@${DIGEST}`);
  });
});

describe('a reference Docker cannot resolve', () => {
  it('is reported and left unchanged rather than failing the run', () => {
    const skipped = [];
    const { text } = pinReferences(
      '    image: mongo:8\n',
      () => {
        throw new Error('No such image');
      },
      (reference) => skipped.push(reference),
    );
    expect(text).toBe('    image: mongo:8\n');
    expect(skipped).toEqual(['mongo:8']);
  });
});
