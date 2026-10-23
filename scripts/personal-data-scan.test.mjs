import { describe, expect, it } from 'vitest';
import { extractSlices, findLeaks } from './personal-data-scan.mjs';

/** The shape of the real export, with invented content. */
const CSV = `RecordID,CustomerInteractionRawText,AgentAssignedTopic,ResolutionText,Priority
1,"The warehouse module stopped syncing stock counts overnight again",Sync,"Re-ran the nightly job and corrected the scheduler timezone setting",High
2,"Short one",Sync,"Also short",Low
`;

describe('extracting protected passages', () => {
  it('takes a slice of each long quoted field', () => {
    const slices = extractSlices(CSV);
    expect(slices).toHaveLength(2);
    expect(slices[0]).toContain('the warehouse module stopped syncing');
  });

  /* Short fields are phrases, not identifying content, and would generate
     false positives on ordinary English. */
  it('ignores fields too short to be identifying', () => {
    expect(extractSlices(CSV).some((slice) => slice.includes('short one'))).toBe(false);
  });

  it('compares case-insensitively, since a quote may be re-typed', () => {
    expect(extractSlices(CSV).every((slice) => slice === slice.toLowerCase())).toBe(true);
  });

  /* The real file ends mid-field. A scanner that throws on malformed input is
     a scanner that stops being run. */
  it('still works on a truncated file', () => {
    const truncated = `${CSV}3,"An interaction that was cut off while the export was still writ`;
    expect(extractSlices(truncated).length).toBeGreaterThanOrEqual(2);
  });

  it('reports nothing when the columns are not there', () => {
    expect(extractSlices('a,b,c\n1,2,3\n')).toEqual([]);
  });
});

describe('finding leaks', () => {
  const slices = extractSlices(CSV);
  const files = { 'docs/step.md': '', 'src/fixture.ts': '' };
  const read = (path) => files[path] ?? '';

  it('passes when no tracked file quotes the data', () => {
    files['docs/step.md'] = 'The free text carries first names, which is why it stays private.';
    expect(findLeaks(slices, Object.keys(files), read)).toEqual([]);
  });

  /* The leak this script was written for: a step README quoting a real
     interaction verbatim to explain why it must not be published. */
  it('catches a verbatim quote in documentation', () => {
    files['docs/step.md'] =
      'For example: "The warehouse module stopped syncing stock counts overnight again".';
    const leaks = findLeaks(slices, Object.keys(files), read);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.path).toBe('docs/step.md');
  });

  /* The second leak it found on its first run: a test fixture copied from the
     real file with only the name changed. */
  it('catches a fixture derived from the real file', () => {
    files['src/fixture.ts'] =
      'const CSV = `1,"x","Re-ran the nightly job and corrected the scheduler timezone setting"`;';
    expect(
      findLeaks(slices, Object.keys(files), read).some((l) => l.path === 'src/fixture.ts'),
    ).toBe(true);
  });

  it('reports each file once, however many passages it quotes', () => {
    files['docs/step.md'] = Object.values(slices).join(' ');
    expect(findLeaks(slices, ['docs/step.md'], read)).toHaveLength(1);
  });

  it('skips a file it cannot read rather than failing the run', () => {
    const throwing = () => {
      throw new Error('EISDIR');
    };
    expect(findLeaks(slices, ['some/binary'], throwing)).toEqual([]);
  });
});
