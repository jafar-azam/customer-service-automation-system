import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { KbEntry } from '../db/models/index.js';

/**
 * Imports TechQA as the seed knowledge base.
 *
 * **Why this corpus.** It is 621 real support questions paired with a
 * *human-selected answer span* inside a specific document. That turns grounding
 * from a claim into a measurement: step 15's citation check and step 21's
 * grounding metric can compare what the assistant cited against what a human
 * annotator marked as the answer. A synthetic knowledge base could not support
 * that, because the generator would be grading itself.
 *
 * **Licence.** Community Data License Agreement – Permissive 1.0, from
 * `CDLA-Permissive-v1.0.pdf` in the archive and `README.txt`. This corrects
 * `datasets.md`, which recorded Apache-2.0 — that is the licence on the
 * repository's *code*, not on the data. CDLA-Permissive-1.0 permits
 * redistribution of derived data with the licence text and attribution, which
 * is why a curated subset may be committed while the 12 GB original is fetched
 * by the contributor.
 *
 * **The archive is never committed**: it is 12 GB, and `data/external/` is
 * git-ignored.
 */

export interface TechQaInstance {
  readonly questionId: string;
  readonly title: string;
  readonly questionText: string;
  readonly answer: string;
  readonly documentId: string;
}

interface RawInstance {
  QUESTION_ID?: unknown;
  QUESTION_TITLE?: unknown;
  QUESTION_TEXT?: unknown;
  /** The README documents this name; the files actually use QUESTION_TEXT. */
  QUESTION_BODY?: unknown;
  ANSWER?: unknown;
  ANSWERABLE?: unknown;
  DOCUMENT?: unknown;
}

export const TECHQA_LICENSE = 'CDLA-Permissive-1.0';

/** The three labelled files, in the order their instances are imported. */
const SOURCE_FILES = [
  'training_and_dev/training_Q_A.json',
  'training_and_dev/dev_Q_A.json',
  'validation/validation_reference.json',
] as const;

const TECHNOTES_FILE = 'training_and_dev/training_dev_technotes.json';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reads the labelled instances and keeps the answerable ones.
 *
 * The 309 unanswerable instances are deliberately **not** imported as knowledge
 * — they have no answer to hold. They are the escalation benchmark (step 21):
 * real technical questions that the corpus genuinely cannot answer, which is
 * exactly the case where a confident false answer does the most damage.
 */
export async function loadTechQaInstances(root: string): Promise<TechQaInstance[]> {
  const instances: TechQaInstance[] = [];

  for (const relative of SOURCE_FILES) {
    const path = join(root, relative);
    if (!existsSync(path)) continue;

    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    const records: RawInstance[] = Array.isArray(parsed)
      ? (parsed as RawInstance[])
      : Object.values(parsed as Record<string, RawInstance>);

    for (const record of records) {
      if (asString(record.ANSWERABLE) !== 'Y') continue;

      const questionId = asString(record.QUESTION_ID);
      const answer = asString(record.ANSWER);
      const title = asString(record.QUESTION_TITLE);
      if (questionId === '' || answer === '' || title === '') continue;

      instances.push({
        questionId,
        title,
        /* QUESTION_TEXT, not QUESTION_BODY: the README names the latter and the
           files contain the former. Both are read so a future release that
           follows its own README still imports. */
        questionText: asString(record.QUESTION_TEXT) || asString(record.QUESTION_BODY),
        answer,
        documentId: asString(record.DOCUMENT),
      });
    }
  }

  return instances;
}

export interface TechnoteMetadata {
  readonly title: string;
  readonly productName: string;
}

/**
 * Pulls the title and product for the few hundred documents actually cited.
 *
 * The technotes file is 292 MB of pretty-printed JSON. `JSON.parse` on it costs
 * well over a gigabyte of heap for metadata on ~600 documents, which would make
 * seeding fail on a small machine — the exact machine this project promises to
 * run on. So it is scanned line by line instead, which is possible precisely
 * because the file is pretty-printed: every scalar sits on its own line.
 *
 * That is a trade: the scan is tied to the file's formatting. It therefore
 * fails **soft** — a document whose metadata is not found still imports, with
 * the count reported — rather than failing the seed over a cosmetic field.
 */
export async function extractTechnoteMetadata(
  root: string,
  wanted: ReadonlySet<string>,
): Promise<Map<string, TechnoteMetadata>> {
  const path = join(root, TECHNOTES_FILE);
  const found = new Map<string, TechnoteMetadata>();
  if (!existsSync(path) || wanted.size === 0) return found;

  const reader = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  /* `  "swg21512700": {` — a top-level record at two-space indentation. */
  const recordStart = /^ {2}"([^"]+)":\s*\{/;
  const titleLine = /^\s{4}"title":\s*(".*?")\s*,?\s*$/;
  const productLine = /^\s{6}"productName":\s*(".*?")\s*,?\s*$/;

  let currentId: string | undefined;
  let title = '';
  let productName = '';

  const flush = (): void => {
    if (currentId !== undefined && (title !== '' || productName !== '')) {
      found.set(currentId, { title, productName });
    }
    currentId = undefined;
    title = '';
    productName = '';
  };

  for await (const line of reader) {
    const start = recordStart.exec(line);
    if (start) {
      flush();
      const id = start[1];
      if (id !== undefined && wanted.has(id)) currentId = id;
      continue;
    }
    if (currentId === undefined) continue;

    const titleMatch = titleLine.exec(line);
    if (titleMatch?.[1] !== undefined) {
      /* JSON.parse the quoted value so escapes are handled properly. */
      title = String(JSON.parse(titleMatch[1]));
      continue;
    }
    const productMatch = productLine.exec(line);
    if (productMatch?.[1] !== undefined) {
      productName = String(JSON.parse(productMatch[1]));
      /* Everything wanted has been seen for this record. */
      flush();
    }
  }
  flush();
  reader.close();

  return found;
}

export interface ImportTechQaOptions {
  readonly root: string;
  readonly logger: Logger;
  /** The admin recorded as having approved the seed entries. */
  readonly approvedByStaffId?: unknown;
  /** Skip the 292 MB metadata scan (tests, and fast re-seeds). */
  readonly withMetadata?: boolean;
}

export interface ImportResult {
  readonly inserted: number;
  readonly updated: number;
  readonly skipped: number;
  readonly withMetadata: number;
}

/**
 * Upserts one knowledge-base entry per answerable instance.
 *
 * Idempotent by `provenance.sourceRef`, which carries a unique index: running
 * the seed twice updates rather than duplicates, so a contributor can re-run it
 * without wondering whether the knowledge base now says everything twice. The
 * *status* is written only on insert, so a re-run never undoes an admin's
 * decision to archive an entry.
 *
 * Entries are imported as **approved**, because importing a licensed reference
 * corpus is an administrative act and the alternative — 621 rows in the review
 * queue — would make the approval queue useless for the thing it is for. The
 * import is audit-logged as `kb.imported`, and every entry carries its
 * provenance, so where these came from is never a guess.
 */
export async function importTechQa({
  root,
  logger,
  approvedByStaffId,
  withMetadata = true,
}: ImportTechQaOptions): Promise<ImportResult> {
  const instances = await loadTechQaInstances(root);
  if (instances.length === 0) {
    logger.warn({ root }, 'techqa: no instances found — is the corpus downloaded?');
    return { inserted: 0, updated: 0, skipped: 0, withMetadata: 0 };
  }

  const metadata = withMetadata
    ? await extractTechnoteMetadata(root, new Set(instances.map((i) => i.documentId)))
    : new Map<string, TechnoteMetadata>();

  let inserted = 0;
  let updated = 0;

  for (const instance of instances) {
    const documentMeta = metadata.get(instance.documentId);
    const result = await KbEntry.updateOne(
      { 'provenance.source': 'techqa', 'provenance.sourceRef': instance.questionId },
      {
        $set: {
          title: instance.title.slice(0, 200),
          question: instance.questionText.slice(0, 2000),
          body: instance.answer.slice(0, 8000),
          language: 'en',
          ...(documentMeta?.productName ? { product: documentMeta.productName.slice(0, 200) } : {}),
          provenance: {
            source: 'techqa',
            license: TECHQA_LICENSE,
            publishable: true,
            sourceRef: instance.questionId,
            /* The answer document groups every question answered by the same
               technote, so a split cannot put two questions about one document
               on opposite sides (step 22). */
            lineageId: instance.documentId,
            /* datasets.md's standing caveat: these are real IBM technotes and
               upstream anonymization was never verified. Step 19 runs the
               PII pass over the committed subset as a gate. */
            piiRedaction: 'pending',
          },
        },
        $setOnInsert: {
          version: 1,
          /* Review state is set **only on insert**. A later run must not
             overwrite a human decision: if an admin archives an entry because
             it is wrong, re-seeding would otherwise resurrect it as approved —
             silently defeating the approval gate this whole project rests on.
             The source corpus stays authoritative for the *text*; the admin
             stays authoritative for whether the assistant may use it. */
          status: 'approved',
          ...(approvedByStaffId ? { approvedByStaffId, approvedAt: new Date() } : {}),
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) inserted += 1;
    else if (result.modifiedCount > 0) updated += 1;
  }

  const result: ImportResult = {
    inserted,
    updated,
    skipped: instances.length - inserted - updated,
    withMetadata: metadata.size,
  };
  logger.info({ ...result, total: instances.length }, 'techqa import complete');
  return result;
}
