#!/usr/bin/env node
/**
 * Keeps `docs/security/CHECKLIST.md` honest.
 *
 * A security checklist decays in one specific way: rows get marked **done**
 * while the control is still planned, or the counts in the header stop matching
 * the table. Both make the document worse than having none, because it is then
 * cited as evidence. This script re-derives the counts from the rows and
 * refuses to let them drift, and it checks the structural rules the document
 * claims for itself:
 *
 *   * every row has an id, a requirement, a control, a code location, a test
 *     and a status;
 *   * every status is `done`, `step NN`, or `accepted` — nothing vague;
 *   * every id is unique;
 *   * the header counts match reality.
 *
 * It cannot verify that a **done** row's test exists and passes — that is step
 * 34's job, done by reading the code. What it can do is make a lie about the
 * shape of the document fail in CI.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHECKLIST = 'docs/security/CHECKLIST.md';

/** A table row: `| 1.1 | requirement | std | control | code | test | status |` */
const ROW = /^\|\s*(\d+\.\d+)\s*\|(.+)\|\s*$/;

const STATUS = {
  done: /^\*\*done\*\*$/,
  /* `step 06`, `step 15, 24`, `step 06–31` — a range is honest when a control
     is built up across several steps (the audit taxonomy is one). */
  planned: /^step \d{2}([,–-]\s*\d{2})*$/,
  accepted: /^accepted/,
};

export function parseRows(markdown) {
  const rows = [];
  for (const [index, line] of markdown.split('\n').entries()) {
    const match = ROW.exec(line);
    if (!match) continue;
    const cells = match[2].split('|').map((cell) => cell.trim());
    rows.push({ id: match[1], line: index + 1, cells });
  }
  return rows;
}

export function classify(status) {
  for (const [name, pattern] of Object.entries(STATUS)) {
    if (pattern.test(status)) return name;
  }
  return 'unknown';
}

export function audit(markdown) {
  const problems = [];
  const rows = parseRows(markdown);
  const counts = { done: 0, planned: 0, accepted: 0 };
  const seen = new Map();

  for (const row of rows) {
    const where = `${CHECKLIST}:${String(row.line)} (${row.id})`;

    if (seen.has(row.id)) {
      problems.push(`${where}: duplicate id, also at line ${String(seen.get(row.id))}`);
    }
    seen.set(row.id, row.line);

    /* requirement, std, control, code, test, status — six cells after the id. */
    if (row.cells.length !== 6) {
      problems.push(`${where}: expected 6 columns after the id, found ${String(row.cells.length)}`);
      continue;
    }

    const [requirement, , control, code, test, status] = row.cells;
    for (const [name, value] of [
      ['requirement', requirement],
      ['control', control],
      ['code', code],
      ['test', test],
    ]) {
      if (!value || value === '—') {
        /* An accepted row is allowed to have no code and no test: that is what
           "accepted" means. Everything else must name both. */
        if (classify(status) === 'accepted') continue;
        problems.push(`${where}: ${name} is empty — a row with no ${name} proves nothing`);
      }
    }

    const kind = classify(status);
    if (kind === 'unknown') {
      problems.push(`${where}: status "${status}" is not done / step NN / accepted`);
      continue;
    }
    counts[kind] += 1;
  }

  if (rows.length === 0) problems.push(`${CHECKLIST}: no rows found — has the format changed?`);

  /* `[\s\S]*?` rather than a space: the sentence wraps across lines, and its
     wording changes as the document grows. Only the numbers are the contract —
     an audit that fails because a sentence was edited is an audit someone
     switches off. */
  const declared = /Counts as of[\s\S]*?\*\*(\d+) done, (\d+) planned, (\d+) accepted\*\*/.exec(
    markdown,
  );
  if (!declared) {
    problems.push(`${CHECKLIST}: the header count line is missing`);
  } else {
    const [, done, planned, accepted] = declared;
    const expected = `${String(counts.done)} done, ${String(counts.planned)} planned, ${String(counts.accepted)} accepted`;
    const found = `${done} done, ${planned} planned, ${accepted} accepted`;
    if (expected !== found) {
      problems.push(`${CHECKLIST}: header says "${found}" but the table has "${expected}"`);
    }
  }

  return { problems, counts, rows: rows.length };
}

function main() {
  const { problems, counts, rows } = audit(readFileSync(CHECKLIST, 'utf8'));

  if (problems.length > 0) {
    console.error(`checklist-audit: ${String(problems.length)} problem(s)\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `checklist-audit: ${String(rows)} requirements — ` +
      `${String(counts.done)} done, ${String(counts.planned)} planned, ` +
      `${String(counts.accepted)} accepted`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
