import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A short-lived capability to download one attachment.
 *
 * **The signature is not the access control.** The download route performs the
 * same ownership check as every other read, through the same repository
 * function. This exists for a narrower job: a URL that appears in a browser
 * history, a proxy log, a screenshot or a forwarded message stops working
 * within minutes.
 *
 * Both halves are needed and neither is sufficient. A signature alone would
 * make a leaked URL a permanent bearer token. An ownership check alone would
 * mean a URL stays valid forever for its owner, which is how an attachment
 * link pasted into a group chat outlives the conversation it belonged to.
 *
 * The token binds the attachment **and the subject it was issued to**, so one
 * customer's token cannot be replayed by another even inside its lifetime.
 */

export const DOWNLOAD_TTL_SECONDS = 300;

export interface DownloadToken {
  readonly attachmentId: string;
  readonly subject: string;
  readonly expiresAt: number;
}

function payload(token: DownloadToken): string {
  return `${token.attachmentId}.${token.subject}.${String(token.expiresAt)}`;
}

export function signDownload(token: DownloadToken, secret: string): string {
  const mac = createHmac('sha256', secret).update(payload(token)).digest('base64url');
  return `${String(token.expiresAt)}.${mac}`;
}

export function issueDownloadToken(
  attachmentId: string,
  subject: string,
  secret: string,
  now: Date = new Date(),
): { readonly token: string; readonly expiresAt: Date } {
  const expiresAt = Math.floor(now.getTime() / 1000) + DOWNLOAD_TTL_SECONDS;
  return {
    token: signDownload({ attachmentId, subject, expiresAt }, secret),
    expiresAt: new Date(expiresAt * 1000),
  };
}

export type VerifyResult = 'valid' | 'expired' | 'invalid';

/**
 * Checks a token against the attachment and subject it must have been issued
 * for.
 *
 * Expiry is checked **after** the signature, and compared with
 * `timingSafeEqual`. Checking expiry first would let a caller learn whether a
 * forged signature's embedded timestamp was in the future, which is a small
 * oracle but a free one to close.
 */
export function verifyDownload(
  presented: string,
  attachmentId: string,
  subject: string,
  secret: string,
  now: Date = new Date(),
): VerifyResult {
  const [rawExpiry, mac] = presented.split('.');
  if (rawExpiry === undefined || mac === undefined) return 'invalid';

  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt)) return 'invalid';

  const expected = signDownload({ attachmentId, subject, expiresAt }, secret);
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalid';

  return expiresAt * 1000 < now.getTime() ? 'expired' : 'valid';
}
