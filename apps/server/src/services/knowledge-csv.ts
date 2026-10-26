import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import type { Logger } from 'pino';
import { KbEntry } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';
import { listEntries, type KbEntryDocument } from '../repositories/knowledge.js';
import { toObjectId, type Scope } from '../repositories/scope.js';
import { record as recordAudit } from './audit.js';
import { auditActorFor } from './audit-scope.js';

/**
 * Knowledge in and out as CSV.
 *
 * The reason this exists is concrete rather than general. Step 16 imported 79
 * Lebanese Arabic questions whose answers were deliberately not taken — each
 * one sits in the queue with a placeholder body saying so. Somebody has to
 * write 79 answers, and nobody writes 79 of anything one web form at a time.
 * They write them in a spreadsheet.
 *
 * So the round trip is the feature: export the queue, fill in the `body`
 * column, import it back. The `id` column is what makes it a round trip rather
 * than a second copy.
 */

/**
 * The columns, in order. Fixed and small on purpose: an export that carries
 * every field invites someone to edit `status` in Excel and import their way
 * past the approval gate, which is the one thing this file must not allow.
 */
export const COLUMNS = [
  'id',
  'language',
  'category',
  'question',
  'title',
  'body',
  'status',
] as const;

/**
 * Neutralises a value that a spreadsheet would execute.
 *
 * A cell beginning `=`, `+`, `-`, `@`, or a tab/carriage return before one of
 * those, is a formula to Excel, Google Sheets and LibreOffice — so an exported
 * knowledge body starting `=HYPERLINK(...)` runs when a colleague opens the
 * file. This is CSV injection, and it is the export's problem rather than the
 * importer's: the attacker's target is the person who opens the spreadsheet.
 *
 * Prefixing a single quote is the conventional fix; it is what the spreadsheet
 * strips when displaying the cell, so the text reads correctly to a human and
 * is inert to the parser. `csv-stringify` does not do this — correct quoting
 * and formula safety are different problems, and it only solves the first.
 */
export function neutraliseFormula(value: string): string {
  return /^[\t\r]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function row(entry: KbEntryDocument): Record<string, string> {
  return {
    id: String(entry._id),
    language: entry.language,
    category: neutraliseFormula(entry.category ?? ''),
    question: neutraliseFormula(entry.question ?? ''),
    title: neutraliseFormula(entry.title),
    body: neutraliseFormula(entry.body),
    /* Exported so the file is readable on its own, and ignored on import. */
    status: entry.status,
  };
}

export interface ExportOptions {
  readonly status?: readonly ('draft' | 'pending_review' | 'approved' | 'archived')[];
  readonly language?: 'ar' | 'en';
  readonly limit?: number;
}

export async function exportCsv(
  scope: Scope,
  options: ExportOptions,
  logger: Logger,
): Promise<string> {
  const entries = await listEntries(scope, {
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.language === undefined ? {} : { language: options.language }),
    limit: options.limit ?? 200,
  });

  await recordAudit(logger, {
    action: 'dataset.exported',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    metadata: { rows: entries.length, ...(options.language ? { language: options.language } : {}) },
  });

  return stringify(entries.map(row), {
    header: true,
    columns: [...COLUMNS],
    /* A byte-order mark, so Excel on Windows opens Arabic as UTF-8 instead of
       the system code page. Without it the questions arrive as mojibake and
       come back the same way — the round trip silently destroys the data it
       exists to carry. */
    bom: true,
  });
}

/* ── Import ─────────────────────────────────────────────────────────────── */

export interface ImportRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly question: string;
  readonly category: string;
  readonly language: string;
}

export interface ImportReport {
  readonly updated: number;
  readonly unchanged: number;
  readonly rejected: readonly { readonly row: number; readonly reason: string }[];
}

/** Undoes the export's formula guard, so a round trip is lossless. */
function unquote(value: string): string {
  return /^'[\t\r]*[=+\-@]/.test(value) ? value.slice(1) : value;
}

/**
 * The placeholder step 16 writes. An import that leaves it in place has not
 * answered anything, and letting it through would put "awaiting an answer" in
 * front of a customer the moment somebody approved the row.
 */
const PLACEHOLDER = 'awaiting an answer';

/**
 * Applies an edited export.
 *
 * **Only text.** `status` is read from the file and thrown away: an import
 * that could set `approved` is a way to put arbitrary text in front of
 * customers with no human looking at it, which is the entire thing the
 * approval gate exists to prevent. Everything this touches lands as
 * `pending_review` and goes through the queue like anything else.
 *
 * **Row by row, rejections reported.** One bad row does not abandon the other
 * two hundred, and the report names the line number — a 200-row import that
 * fails with "invalid input" and no position is an import nobody can fix.
 */
export async function importCsv(scope: Scope, text: string, logger: Logger): Promise<ImportReport> {
  if (scope.kind !== 'staff') {
    throw new ApiError(403, 'forbidden', 'Only staff can import knowledge');
  }

  let records: Record<string, string>[];
  try {
    records = parse<Record<string, string>>(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      /* A re-saved spreadsheet often gains or loses a trailing column. */
      relax_column_count: true,
    });
  } catch (error) {
    throw new ApiError(400, 'unparseable_csv', 'That file could not be read as CSV', {
      detail: error instanceof Error ? error.message : 'unknown',
    });
  }

  if (records.length > 1_000) {
    throw new ApiError(413, 'too_many_rows', 'Import at most 1000 rows at a time');
  }

  const rejected: { row: number; reason: string }[] = [];
  let updated = 0;
  let unchanged = 0;

  for (const [index, record] of records.entries()) {
    /* Header is line 1, so a spreadsheet row n is line n + 1 — the number the
       person fixing it sees in their editor. */
    const line = index + 2;
    const id = (record['id'] ?? '').trim();
    const title = unquote((record['title'] ?? '').trim());
    const body = unquote((record['body'] ?? '').trim());

    if (!/^[0-9a-f]{24}$/i.test(id)) {
      rejected.push({ row: line, reason: 'the id column is missing or not an entry id' });
      continue;
    }
    if (title === '' || body === '') {
      rejected.push({ row: line, reason: 'title and body are both required' });
      continue;
    }
    if (body.toLowerCase().includes(PLACEHOLDER)) {
      rejected.push({ row: line, reason: 'the body is still the placeholder — write an answer' });
      continue;
    }

    const current = await KbEntry.findOne({ _id: toObjectId(id) })
      .select('title body question category status version')
      .lean<KbEntryDocument>()
      .exec();

    if (!current) {
      rejected.push({ row: line, reason: 'no entry with that id' });
      continue;
    }
    if (current.status === 'archived') {
      rejected.push({ row: line, reason: 'that entry is archived' });
      continue;
    }

    const question = unquote((record['question'] ?? '').trim());
    const category = unquote((record['category'] ?? '').trim());

    if (
      current.title === title &&
      current.body === body &&
      (current.question ?? '') === question &&
      (current.category ?? '') === category
    ) {
      unchanged += 1;
      continue;
    }

    await KbEntry.updateOne(
      { _id: current._id, version: current.version },
      {
        $set: {
          title,
          body,
          ...(question === '' ? {} : { question }),
          ...(category === '' ? {} : { category }),
          /* Back through the gate, whatever it was before. */
          status: 'pending_review',
        },
        $inc: { version: 1 },
        $push: {
          versions: {
            $each: [
              {
                version: current.version,
                title: current.title,
                body: current.body,
                status: current.status,
                /* Narrowed to `staff` by the guard at the top of this
                   function, so no second check is needed here. */
                editedByStaffId: toObjectId(scope.staffId),
                editedAt: new Date(),
                changeNote: `CSV import, row ${String(line)}`,
              },
            ],
            $slice: -50,
          },
        },
        $unset: { approvedByStaffId: '', approvedAt: '' },
      },
    ).exec();
    updated += 1;
  }

  await recordAudit(logger, {
    action: 'kb.imported',
    ...auditActorFor(scope),
    targetType: 'kb_entry',
    metadata: { rows: records.length, updated, unchanged, rejected: rejected.length },
  });

  logger.info({ rows: records.length, updated, unchanged, rejected: rejected.length }, 'kb import');
  return { updated, unchanged, rejected };
}
