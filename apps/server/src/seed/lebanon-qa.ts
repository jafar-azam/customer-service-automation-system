import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import type { Logger } from 'pino';
import { PROPRIETARY_LOCAL_LICENSE } from '@csas/shared';
import { KbEntry } from '../db/models/index.js';

/**
 * Imports `reference/lebanon_qa.csv` — published FAQ content from Lebanese
 * and EU organisations, exported from the supplied workbook.
 *
 * **CSV rather than the `.xlsx` directly.** `exceljs` fails inside its own
 * loader on this file, and the maintained JavaScript alternatives are
 * deprecated — `CLAUDE.md` rules those out. The project already parses
 * `seniordata.csv` with `csv-parse`, so this is one format and one dependency
 * instead of two, and the export is a one-off documented step. The conversion
 * command is in the step README.
 *
 * **Why the file is git-ignored and every row is `publishable: false`.**
 *
 * The 80 Lebanese rows are the published FAQ text of Ogero, OMT and Alfa.
 * That is their copyright. Nothing grants permission to redistribute it, and
 * this repository is Apache-2.0 / CC BY 4.0 and public — so the content stays
 * local, exactly like `seniordata.csv`, and the importer is what gets
 * committed. Step 37's pre-publication audit fails the release if a record
 * carrying this flag ever reaches a committed file.
 *
 * The 120 EU rows are probably reusable under Decision 2011/833/EU with
 * attribution, but "probably" is not a licence determination, and they are
 * off-domain anyway — EU plant-variety registration is not what this company
 * supports.
 *
 * **Only the questions are imported.** They are real published Lebanese Arabic
 * in a service register — the one thing that cannot be invented convincingly,
 * and what step 15 lacked when it found Arabic retrieval untestable against an
 * entirely English knowledge base.
 *
 * The answers are left behind deliberately, and that decision removes two
 * problems at once rather than mitigating them:
 *
 * - **Copyright.** A short functional question carries little creative
 *   expression; a page of FAQ prose carries a lot. Not copying the prose is a
 *   stronger position than copying it and hoping.
 * - **Contact details.** The answers carry real support numbers and addresses.
 *   A scrubbing pass over them left a fragment — `391000` survived — which is
 *   the predictable outcome of trying to filter text rather than not taking
 *   it. An assistant quoting Ogero's switchboard at a C.S.A.S customer would
 *   be confidently wrong, which is the exact failure this phase exists to
 *   prevent.
 *
 * What lands is a **question awaiting an answer**: `pending_review`, with a
 * body that says so. Step 17's approval queue is where someone writes the real
 * answer for this company's products, and nothing reaches a customer before
 * then.
 */

export interface ImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly reason?: string;
}

interface Row {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly language: 'ar' | 'en';
  readonly organisation: string;
  readonly category: string;
  readonly url: string;
}

/**
 * Rejects a question that carries a contact detail of its own.
 *
 * A question rarely contains one, but "rarely" is not "never", and the
 * decision not to import the answers is worth nothing if a phone number
 * arrives through the other column. Rejected rather than scrubbed: a
 * question is one sentence, so dropping it costs almost nothing, and
 * scrubbing is what left `391000` behind in the answers.
 */
export function carriesContact(text: string): boolean {
  return (
    /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text) ||
    /\+?961[\s-]?\d/.test(text) ||
    /\b\d{6,}\b/.test(text) ||
    /\b1\d{3}\b/.test(text)
  );
}

/** What a reviewer sees in the approval queue until they write the answer. */
export const AWAITING_ANSWER =
  'Imported question, awaiting an answer written for this company. ' +
  'The original source answer was deliberately not imported — see seed/lebanon-qa.ts.';

export async function importLebanonQa(options: {
  readonly path: string;
  readonly logger: Logger;
  /** Arabic only by default: the English rows are off-domain and unlicensed. */
  readonly languages?: readonly ('ar' | 'en')[];
}): Promise<ImportResult> {
  const { path, logger } = options;
  const languages = options.languages ?? ['ar'];

  if (!existsSync(path)) {
    /* Absent is the normal case for anyone who is not the author — the file
       is git-ignored. Not an error, and not a silent no-op either. */
    logger.info({ path }, 'lebanon-qa: file not present, skipping');
    return { imported: 0, skipped: 0, reason: 'absent' };
  }

  const rows = await readRows(path);
  const wanted = rows.filter(
    (row) => languages.includes(row.language) && !carriesContact(row.question),
  );
  const rejected = rows.filter(
    (row) => languages.includes(row.language) && carriesContact(row.question),
  ).length;

  let imported = 0;
  for (const row of wanted) {
    /* `$setOnInsert` for the review state, so re-running the import never
       resurrects something an admin archived — the same mistake the seed made
       in step 05 and the reason that rule exists. */
    const result = await KbEntry.updateOne(
      { 'provenance.sourceRef': `lebanon-qa:${row.id}` },
      {
        $set: {
          title: row.question.slice(0, 200),
          question: row.question,
          /* Not the source answer. See the note at the top of this file. */
          body: AWAITING_ANSWER,
          language: row.language,
          category: row.category.slice(0, 120),
        },
        $setOnInsert: {
          /* Never `approved`. This is third-party text an admin has to look at
             before a customer is ever shown it, and the licence question is
             unresolved. */
          status: 'pending_review',
          version: 1,
          versions: [],
          /* The organisation is the attribution, and `tags` is where it can
             live: `provenance` has no free-text field, deliberately — a
             schema with a `note` becomes a place to put things nobody
             queries. */
          tags: ['imported', 'lebanon-qa', row.organisation.toLowerCase().slice(0, 40)],
          provenance: {
            /* `human_collected`, not `generated`: a person gathered these from
               published pages, and that distinction is what a licence review
               needs to see. */
            source: 'human_collected',
            sourceRef: `lebanon-qa:${row.id}`,
            license: PROPRIETARY_LOCAL_LICENSE,
            /* The flag step 37 looks for. */
            publishable: false,
          },
          usageCount: 0,
          unhelpfulCount: 0,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) imported += 1;
  }

  logger.info(
    { imported, considered: wanted.length, rejected, languages },
    'lebanon-qa: questions imported (pending_review, publishable: false, answers not copied)',
  );
  return { imported, skipped: rows.length - wanted.length };
}

/**
 * Reads the exported sheet.
 *
 * Columns are located by header name rather than by position, so a reordered
 * export still imports — a file that arrives from a spreadsheet is a file
 * whose columns move.
 */
async function readRows(path: string): Promise<Row[]> {
  const text = await readFile(path, 'utf8');
  const records = parse<Record<string, string>>(text, {
    columns: true,
    skip_empty_lines: true,
    /* The workbook has a trailing blank column; without this a short row
       throws rather than importing. */
    relax_column_count: true,
    bom: true,
  });

  return (
    records
      .map((record) => ({
        id: (record['ID'] ?? '').trim(),
        question: (record['Question'] ?? '').trim(),
        answer: (record['Answer'] ?? '').trim(),
        language: (record['Language'] ?? '').toLowerCase().startsWith('ar')
          ? ('ar' as const)
          : ('en' as const),
        organisation: (record['Company / organization'] ?? '').trim(),
        category: (record['Category'] ?? '').trim(),
        url: (record['Primary-source URL'] ?? '').trim(),
      }))
      /* A row with no answer in the source was never a complete FAQ entry, so
       it is skipped even though the answer is not imported — an unanswered
       question there is a gap in the source, not a question worth keeping. */
      .filter((row) => row.id !== '' && row.question !== '' && row.answer !== '')
  );
}
