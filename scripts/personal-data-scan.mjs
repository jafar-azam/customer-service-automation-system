#!/usr/bin/env node
/**
 * Refuses to let local-only personal data reach a tracked file.
 *
 * `docs/security/PRIVACY.md` §1 says the published repository contains only
 * synthetic and licensed data, and step 05's importer flags every row from
 * `reference/data/seniordata.csv` as `publishable: false`. That flag protects
 * the *database*. Nothing protected the repository — and a review found a real
 * leak: a step README quoted a customer interaction verbatim, first name
 * included, to illustrate why the file must stay private.
 *
 * So the claim is now a check. It takes the local CSV — the only copy of the
 * real data — and looks for its content in files git actually tracks.
 *
 * **It only works where the file exists**, which is this machine and nowhere
 * else, so it cannot be CI's last line of defence. It is a pre-commit and
 * pre-publication gate for the one person who holds the data, which is exactly
 * who is in a position to leak it. When the file is absent it says so and
 * exits 0 rather than pretending to have checked.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_SOURCE = 'reference/data/seniordata.csv';

/**
 * Long enough that a match cannot be coincidence, short enough to catch a
 * quoted fragment. A 40-character slice of free text is effectively unique;
 * common phrases ("the customer called about") are shorter than this.
 */
const SLICE_LENGTH = 40;

/** Columns whose content is personal data rather than structure. */
const TEXT_COLUMNS = ['CustomerInteractionRawText', 'ResolutionText'];

/** Files that may legitimately mention the data set by name. */
const ALLOWED = [/^reference\//, /^scripts\/personal-data-scan\./];

export function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '' && !ALLOWED.some((rule) => rule.test(path)));
}

/**
 * Pulls distinctive slices out of the CSV's free-text columns.
 *
 * Parsed crudely on purpose: this must work on a file that is **truncated**
 * (the real one ends mid-field), and a strict parser throws rather than
 * returning what it managed to read. A scanner that gives up on malformed
 * input is a scanner that stops running.
 */
export function extractSlices(csv, { sliceLength = SLICE_LENGTH } = {}) {
  const [header = ''] = csv.split(/\r?\n/, 1);
  const columns = header.split(',').map((name) => name.trim());
  const wanted = TEXT_COLUMNS.map((name) => columns.indexOf(name)).filter((index) => index >= 0);
  if (wanted.length === 0) return [];

  const slices = new Set();
  /* Every quoted field in the file, in order; the free-text columns are the
     quoted ones, and anything quoted and long is worth protecting anyway. */
  for (const match of csv.matchAll(/"((?:[^"]|"")*)"/g)) {
    const value = (match[1] ?? '').replace(/""/g, '"').trim();
    if (value.length < sliceLength) continue;
    /* The opening slice is enough: a quote of the field's middle without its
       beginning is vanishingly unlikely, and one slice per field keeps the
       comparison fast. */
    slices.add(value.slice(0, sliceLength).toLowerCase());
  }
  return [...slices];
}

export function findLeaks(slices, files, readFile = (path) => readFileSync(path, 'utf8')) {
  const findings = [];
  for (const path of files) {
    let content;
    try {
      content = readFile(path).toLowerCase();
    } catch {
      /* Binary or unreadable: nothing quotable in it. */
      continue;
    }
    for (const slice of slices) {
      if (content.includes(slice)) {
        findings.push({ path, preview: `${slice.slice(0, 24)}…` });
        break;
      }
    }
  }
  return findings;
}

function main(argv = process.argv.slice(2)) {
  const source = argv[0] ?? DEFAULT_SOURCE;

  if (!existsSync(source)) {
    console.log(`personal-data-scan: ${source} is not on this machine — nothing to compare`);
    return;
  }

  const slices = extractSlices(readFileSync(source, 'utf8'));
  if (slices.length === 0) {
    console.error(`personal-data-scan: no text columns found in ${source}`);
    process.exitCode = 1;
    return;
  }

  const leaks = findLeaks(slices, trackedFiles());

  if (leaks.length > 0) {
    console.error(
      `personal-data-scan: ${String(leaks.length)} tracked file(s) contain real data\n`,
    );
    for (const leak of leaks) console.error(`  ${leak.path}  ${leak.preview}`);
    console.error('\nThis data may never be published. Paraphrase it, or remove it.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `personal-data-scan: clean — ${String(slices.length)} protected passages, ` +
      `none present in tracked files`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
