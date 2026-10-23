import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import type { Logger } from 'pino';
import { PROPRIETARY_LOCAL_LICENSE } from '@csas/shared';
import { KbEntry } from '../db/models/index.js';

/**
 * Imports `reference/data/seniordata.csv` — the real interaction log.
 *
 * **This data may never be published.** It is real customer interactions from a
 * business: the free-text column carries first names, gendered references and
 * churn detail tied to identifiable people. Every imported row is therefore
 * written with `license: proprietary-local` and `publishable: false`, and
 * step 37's pre-publication audit fails the release if a record carrying that
 * flag ever reaches a committed file. The CSV itself lives in `reference/`,
 * which is git-ignored.
 *
 * **It is imported as `pending_review`, not `approved`.** Three reasons, and
 * all three are worth stating because the easy choice would have been to
 * approve it:
 *
 *  1. It has not been de-identified, so it is not fit to be read back to a
 *     customer by the assistant.
 *  2. The domain is Indian mobile telecom — porting to Idea and BSNL, data
 *     plans — not the IT support this product is for. Approving it would teach
 *     the assistant to answer confidently about the wrong industry.
 *  3. It demonstrates the approval gate on real data, which is the point of
 *     having the gate.
 *
 * **What is deliberately not imported.** `Priority`, `SentimentScore`,
 * `TimeToResolution`, `SatisfactionRating`, `FollowUpRequired`,
 * `CallDurationSeconds`, `AgentID`, `CustomerID` and `LocationID` describe a
 * *ticket*, not a knowledge-base entry. Copying them onto a knowledge entry
 * would manufacture operational history for incidents this system never
 * handled — exactly what `datasets.md` warns against. Priority and follow-up
 * survive as tags, where they are visibly annotations rather than measurements.
 */

export const SENIORDATA_SOURCE = 'seniordata_csv';

/** The columns the specification lists, plus the ones the real file adds. */
interface Row {
  RecordID?: string;
  CustomerInteractionRawText?: string;
  AgentAssignedTopic?: string;
  TopicCategory?: string;
  ResolutionText?: string;
  Priority?: string;
  SentimentScore?: string;
  SatisfactionRating?: string;
  TimeToResolution?: string;
  FollowUpRequired?: string;
}

export interface SeniordataImportResult {
  readonly rows: number;
  readonly inserted: number;
  readonly updated: number;
  readonly skipped: number;
}

const PARSE_OPTIONS = {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  /* The file is a business export, not a contract: a row with a missing
     trailing column should not abort the import of the other fifty. */
  relax_column_count: true,
  bom: true,
} as const;

export interface ParseOutcome {
  readonly rows: Row[];
  /** Set when the file was truncated and only part of it could be read. */
  readonly truncatedAfter?: number;
}

/**
 * Parses the export, surviving a truncated final record.
 *
 * The real file ends mid-field: the last line opens a quote and the export
 * stops. `csv-parse` reports `CSV_QUOTE_NOT_CLOSED` and throws away all 52
 * records it had already read, which — before this was handled — aborted the
 * entire seed over one bad line at the end of an optional input.
 *
 * So a failed parse is retried on the content up to the last complete line.
 * That keeps the 52 good records, loses only the record that was already
 * incomplete, and reports which line was dropped instead of hiding it. Real
 * exports are truncated more often than anyone admits, and an importer that
 * fails whole-file on the last byte is an importer nobody can use.
 */
export function parseSeniordata(csv: string): ParseOutcome {
  try {
    return { rows: parse<Row>(csv, PARSE_OPTIONS) };
  } catch (error) {
    if ((error as { code?: string }).code !== 'CSV_QUOTE_NOT_CLOSED') throw error;

    const lines = csv.split(/\r?\n/);
    /* Drop trailing blank lines, then the incomplete record itself. */
    while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
    const droppedLine = lines.length;
    lines.pop();

    return {
      rows: parse<Row>(lines.join('\n'), PARSE_OPTIONS),
      truncatedAfter: droppedLine,
    };
  }
}

/** `Port Out` + `Account Management` → a title a human can scan in a queue. */
export function buildTitle(row: Row): string {
  const topic = row.AgentAssignedTopic?.trim() ?? '';
  const category = row.TopicCategory?.trim() ?? '';
  if (topic !== '' && category !== '') return `${topic} — ${category}`.slice(0, 200);
  return (topic || category || 'Imported interaction').slice(0, 200);
}

export function buildTags(row: Row): string[] {
  const tags: string[] = [];
  const priority = row.Priority?.trim().toLowerCase();
  if (priority) tags.push(`source-priority:${priority}`);
  if (row.FollowUpRequired?.trim().toLowerCase() === 'yes') tags.push('source-followup');
  return tags;
}

export interface ImportSeniordataOptions {
  readonly path: string;
  readonly logger: Logger;
}

export async function importSeniordata({
  path,
  logger,
}: ImportSeniordataOptions): Promise<SeniordataImportResult> {
  if (!existsSync(path)) {
    /* Not an error: the file is optional and most contributors will not have
       it. The seed continues with the publishable corpus alone. */
    logger.info({ path }, 'seniordata: no local file, skipping');
    return { rows: 0, inserted: 0, updated: 0, skipped: 0 };
  }

  const { rows, truncatedAfter } = parseSeniordata(await readFile(path, 'utf8'));
  if (truncatedAfter !== undefined) {
    logger.warn(
      { path, line: truncatedAfter },
      'seniordata: the file ends with an incomplete record; it was dropped and the rest imported',
    );
  }
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const recordId = row.RecordID?.trim();
    const resolution = row.ResolutionText?.trim();
    const question = row.CustomerInteractionRawText?.trim();

    /* A row with no resolution is not knowledge. It is dropped rather than
       imported as an empty entry somebody would later have to explain. */
    if (!recordId || !resolution || !question) {
      skipped += 1;
      continue;
    }

    const result = await KbEntry.updateOne(
      { 'provenance.source': SENIORDATA_SOURCE, 'provenance.sourceRef': recordId },
      {
        $set: {
          title: buildTitle(row),
          question: question.slice(0, 2000),
          body: resolution.slice(0, 8000),
          topic: row.AgentAssignedTopic?.trim().slice(0, 200),
          category: row.TopicCategory?.trim().slice(0, 200),
          language: 'en',
          tags: buildTags(row),
          provenance: {
            source: SENIORDATA_SOURCE,
            license: PROPRIETARY_LOCAL_LICENSE,
            publishable: false,
            sourceRef: recordId,
            lineageId: `seniordata:${recordId}`,
            /* Names appear in the free text. Until a redaction pass has run,
               this says so rather than implying the data is clean. */
            piiRedaction: 'pending',
          },
        },
        $setOnInsert: {
          version: 1,
          /* The gate, on real data — and set only on insert, so re-running the
             seed cannot return a row an admin has already rejected to the
             review queue. */
          status: 'pending_review',
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) inserted += 1;
    else if (result.modifiedCount > 0) updated += 1;
  }

  const result: SeniordataImportResult = { rows: rows.length, inserted, updated, skipped };
  logger.info(
    { ...result, publishable: false },
    'seniordata import complete — every row flagged unpublishable',
  );
  return result;
}
