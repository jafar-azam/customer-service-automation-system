import { describe, expect, it } from 'vitest';
import { audit, classify, parseRows } from './checklist-audit.mjs';

const header = (done, planned, accepted) =>
  `Counts as of step 04: **${done} done, ${planned} planned, ${accepted} accepted**.\n\n`;

const row = (id, status, { code = '`services/x`', test = 'a test' } = {}) =>
  `| ${id} | Requirement | ASVS 1.1 | A control | ${code} | ${test} | ${status} |\n`;

describe('status classification', () => {
  it('accepts the three permitted shapes', () => {
    expect(classify('**done**')).toBe('done');
    expect(classify('step 06')).toBe('planned');
    expect(classify('step 15, 24')).toBe('planned');
    expect(classify('step 06–31')).toBe('planned');
    expect(classify('accepted (roadmap P5)')).toBe('accepted');
  });

  /* The failure this guards against is a row that reads as reassuring without
     committing to anything. */
  it('rejects a vague status', () => {
    expect(classify('partially done')).toBe('unknown');
    expect(classify('soon')).toBe('unknown');
    expect(classify('✔')).toBe('unknown');
  });
});

describe('parsing', () => {
  it('finds every numbered row and its line', () => {
    const rows = parseRows(`${row('1.1', 'step 06')}${row('2.3', '**done**')}`);
    expect(rows.map((r) => r.id)).toEqual(['1.1', '2.3']);
    expect(rows[1]?.line).toBe(2);
  });

  it('ignores the legend and prose tables, which have no ids', () => {
    expect(parseRows('| **done** | Implemented |\n')).toHaveLength(0);
  });
});

describe('the audit', () => {
  it('passes a well-formed document', () => {
    const markdown = header(1, 1, 0) + row('1.1', '**done**') + row('1.2', 'step 06');
    expect(audit(markdown).problems).toEqual([]);
  });

  /* The failure that made this script worth writing: hand-written counts in the
     header drifted from the table on the day the table was created. */
  it('catches counts that drift from the table', () => {
    const markdown = header(5, 1, 0) + row('1.1', '**done**') + row('1.2', 'step 06');
    expect(audit(markdown).problems[0]).toMatch(/header says "5 done/);
  });

  it('catches a duplicated requirement id', () => {
    const markdown = header(0, 2, 0) + row('1.1', 'step 06') + row('1.1', 'step 08');
    expect(audit(markdown).problems.some((p) => p.includes('duplicate id'))).toBe(true);
  });

  it('catches a vague status', () => {
    const markdown = header(0, 1, 0) + row('1.1', 'mostly done');
    expect(audit(markdown).problems.some((p) => p.includes('is not done'))).toBe(true);
  });

  /* A planned row with no named test is how a checklist becomes decoration. */
  it('catches a row that names no test', () => {
    const markdown = header(0, 1, 0) + row('1.1', 'step 06', { test: '—' });
    expect(audit(markdown).problems.some((p) => p.includes('test is empty'))).toBe(true);
  });

  it('allows an accepted row to name no code or test', () => {
    const markdown =
      header(0, 0, 1) + row('1.1', 'accepted (roadmap P5)', { code: '—', test: '—' });
    expect(audit(markdown).problems).toEqual([]);
  });

  it('catches a missing header line', () => {
    expect(audit(row('1.1', 'step 06')).problems.some((p) => p.includes('count line'))).toBe(true);
  });

  it('catches an emptied table', () => {
    expect(audit(header(0, 0, 0)).problems.some((p) => p.includes('no rows found'))).toBe(true);
  });
});
