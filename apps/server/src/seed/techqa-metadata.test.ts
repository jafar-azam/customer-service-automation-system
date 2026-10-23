import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractTechnoteMetadata } from './techqa.js';
import { findRepoRoot, resolveFromRepoRoot } from './repo-root.js';

/**
 * The technotes file is 292 MB, so it is scanned line by line rather than
 * parsed — `JSON.parse` on it costs more than a gigabyte of heap, on the small
 * machine this project promises to run on. These fixtures reproduce the file's
 * exact pretty-printed shape, which is what makes the scan possible.
 */
async function writeTechnotes(body: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'csas-notes-'));
  await mkdir(join(root, 'training_and_dev'), { recursive: true });
  await writeFile(join(root, 'training_and_dev/training_dev_technotes.json'), body);
  return root;
}

const RECORD = (id: string, title: string, product: string) => `  "${id}": {
    "id": "${id}",
    "content": "<div>a very long html blob that must be skipped</div>",
    "title": ${JSON.stringify(title)},
    "text": "plain text body",
    "metadata": {
      "sourceDocumentId": "${id}",
      "date": "2011-09-02",
      "productName": ${JSON.stringify(product)},
      "productId": "SSS9LM"
    }
  }`;

describe('the technote metadata scan', () => {
  it('finds the title and product of the documents asked for', async () => {
    const root = await writeTechnotes(
      `{\n${RECORD('swg1', 'First note', 'IBM WebSphere MQ')},\n${RECORD('swg2', 'Second note', 'IBM DB2')}\n}\n`,
    );
    const found = await extractTechnoteMetadata(root, new Set(['swg1', 'swg2']));
    expect(found.get('swg1')).toEqual({ title: 'First note', productName: 'IBM WebSphere MQ' });
    expect(found.get('swg2')?.productName).toBe('IBM DB2');
  });

  it('ignores documents nobody asked about', async () => {
    const root = await writeTechnotes(
      `{\n${RECORD('swg1', 'Wanted', 'A')},\n${RECORD('swg2', 'Unwanted', 'B')}\n}\n`,
    );
    const found = await extractTechnoteMetadata(root, new Set(['swg1']));
    expect([...found.keys()]).toEqual(['swg1']);
  });

  it('handles a title containing escaped quotes', async () => {
    const root = await writeTechnotes(`{\n${RECORD('swg1', 'A "quoted" title', 'A')}\n}\n`);
    const found = await extractTechnoteMetadata(root, new Set(['swg1']));
    expect(found.get('swg1')?.title).toBe('A "quoted" title');
  });

  it('keeps a record that has a title but no product', async () => {
    const root = await writeTechnotes(
      `{\n  "swg1": {\n    "id": "swg1",\n    "title": "No product here"\n  }\n}\n`,
    );
    const found = await extractTechnoteMetadata(root, new Set(['swg1']));
    expect(found.get('swg1')?.title).toBe('No product here');
  });

  /* Fail soft: the scan is tied to the file's formatting, and a cosmetic field
     must never be the reason a seed fails. */
  it('returns nothing rather than throwing when the file is absent', async () => {
    const found = await extractTechnoteMetadata('/nonexistent', new Set(['swg1']));
    expect(found.size).toBe(0);
  });

  it('does no work when nothing is wanted', async () => {
    const root = await writeTechnotes(`{\n${RECORD('swg1', 'T', 'P')}\n}\n`);
    expect((await extractTechnoteMetadata(root, new Set())).size).toBe(0);
  });
});

describe('path resolution', () => {
  /* npm runs a workspace script with the *workspace* as the working directory,
     so `data/external/techqa` resolved to `apps/server/data/external/techqa`
     and the seed reported "no corpus found" while the corpus sat where it was
     configured to be. */
  it('finds the monorepo root, not the workspace', () => {
    const root = findRepoRoot();
    expect(root.endsWith('apps/server')).toBe(false);
    expect(resolveFromRepoRoot('data/external/techqa')).toBe(`${root}/data/external/techqa`);
  });

  it('leaves an absolute path alone', () => {
    expect(resolveFromRepoRoot('/srv/corpora/techqa')).toBe('/srv/corpora/techqa');
  });

  it('falls back to the working directory outside a workspace', () => {
    expect(findRepoRoot('/')).toBe(process.cwd());
  });
});
