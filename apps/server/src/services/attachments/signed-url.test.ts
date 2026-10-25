import { describe, expect, it } from 'vitest';
import { DOWNLOAD_TTL_SECONDS, issueDownloadToken, verifyDownload } from './signed-url.js';

const SECRET = 'a signing secret for the tests only'; // secret-scan:allow
const OTHER = 'a completely different signing secret'; // secret-scan:allow
const ID = '507f1f77bcf86cd799439011';
const SUBJECT = 'c:507f1f77bcf86cd799439012';
const NOW = new Date('2026-10-25T12:00:00Z');

describe('a download token', () => {
  it('verifies for the attachment and subject it was issued to', () => {
    const { token } = issueDownloadToken(ID, SUBJECT, SECRET, NOW);
    expect(verifyDownload(token, ID, SUBJECT, SECRET, NOW)).toBe('valid');
  });

  /* The reason a link in a browser history, a proxy log or a forwarded
     message stops being useful. */
  it('expires', () => {
    const { token, expiresAt } = issueDownloadToken(ID, SUBJECT, SECRET, NOW);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(DOWNLOAD_TTL_SECONDS * 1000);

    const justAfter = new Date(NOW.getTime() + (DOWNLOAD_TTL_SECONDS + 1) * 1000);
    expect(verifyDownload(token, ID, SUBJECT, SECRET, justAfter)).toBe('expired');
  });

  /* Bound to both, so a token cannot be carried to another file or replayed
     by another account inside its lifetime. */
  it('is useless for a different attachment', () => {
    const { token } = issueDownloadToken(ID, SUBJECT, SECRET, NOW);
    expect(verifyDownload(token, '507f1f77bcf86cd799439099', SUBJECT, SECRET, NOW)).toBe('invalid');
  });

  it('is useless for a different subject', () => {
    const { token } = issueDownloadToken(ID, SUBJECT, SECRET, NOW);
    expect(verifyDownload(token, ID, 'c:507f1f77bcf86cd799439099', SECRET, NOW)).toBe('invalid');
  });

  it('is useless under a different secret', () => {
    const { token } = issueDownloadToken(ID, SUBJECT, SECRET, NOW);
    expect(verifyDownload(token, ID, SUBJECT, OTHER, NOW)).toBe('invalid');
  });

  /* Pushing the embedded expiry out does not help, because the expiry is
     inside the signed payload rather than beside it. */
  it('cannot be extended by editing the timestamp', () => {
    const { token } = issueDownloadToken(ID, SUBJECT, SECRET, NOW);
    const [, mac] = token.split('.');
    const forged = `${String(Math.floor(NOW.getTime() / 1000) + 86_400)}.${String(mac)}`;
    expect(verifyDownload(forged, ID, SUBJECT, SECRET, NOW)).toBe('invalid');
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', '.', 'nodot', 'abc.def', '1e9.x', `${'9'.repeat(40)}.x`]) {
      expect(verifyDownload(bad, ID, SUBJECT, SECRET, NOW)).toBe('invalid');
    }
  });

  /* Expiry is reported only after the signature matches, so a forged token
     never reveals whether its embedded timestamp was in the future. */
  it('reports a forged expired token as invalid, not expired', () => {
    const past = Math.floor(NOW.getTime() / 1000) - 10_000;
    expect(verifyDownload(`${String(past)}.forged`, ID, SUBJECT, SECRET, NOW)).toBe('invalid');
  });
});
