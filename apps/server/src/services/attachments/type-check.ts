import { fileTypeFromBuffer } from 'file-type';

/**
 * What a file actually is, decided by its bytes.
 *
 * The client's `Content-Type` is a hint typed by whoever wrote the client, and
 * the extension is part of a string the user chose. Neither is evidence.
 * `shell.php` renamed to `holiday.jpg` arrives with `image/jpeg` and a `.jpg`
 * extension, and every check that reads those two fields passes it.
 *
 * So the allowlist is applied to the **detected** type, and the detected type
 * is what gets stored and later served.
 */

/**
 * The formats a support conversation actually needs.
 *
 * Deliberately short. Every entry is a format whose risk is understood:
 *
 * - The three raster images are re-encoded before they can be downloaded,
 *   which destroys both their metadata and any payload smuggled in them.
 * - PDF is here because invoices and error reports arrive as PDF and refusing
 *   them would push customers to screenshot a document. It is **not**
 *   re-encoded, so it is the one format served as uploaded — which is why it
 *   is served as a download and never rendered in our origin.
 * - Plain text covers pasted logs.
 *
 * Deliberately absent, each for a reason:
 *
 * - **SVG** is not an image, it is a document with a script element. Rendering
 *   one in our origin is stored XSS. Sanitising SVG is a losing arms race; the
 *   customer can send a PNG.
 * - **Archives** (zip, rar, 7z) hide their contents from every check here, and
 *   a scanner that unpacks them inherits the decompression-bomb problem.
 * - **Office documents** carry macros.
 * - **HTML** is the XSS vector with no disguise at all.
 */
export const ALLOWED_TYPES = new Map<
  string,
  { readonly extension: string; readonly image: boolean }
>([
  ['image/jpeg', { extension: 'jpg', image: true }],
  ['image/png', { extension: 'png', image: true }],
  ['image/webp', { extension: 'webp', image: true }],
  ['application/pdf', { extension: 'pdf', image: false }],
  ['text/plain', { extension: 'txt', image: false }],
]);

export type TypeVerdict =
  | {
      readonly ok: true;
      readonly mimeType: string;
      readonly extension: string;
      readonly image: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'empty' | 'unknown' | 'not_allowed';
      readonly detected?: string;
    };

/** %PDF- at offset 0. `file-type` detects PDF, but this is the shape check. */
function looksLikePdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * Whether a buffer is plausibly plain text.
 *
 * `file-type` detects *binary* formats by signature and returns nothing for
 * text, which has none. So text is the one case decided by exclusion, and the
 * exclusion has to be strict or "unknown binary" becomes "text".
 *
 * A NUL byte anywhere means it is not text. Beyond that the buffer must decode
 * as UTF-8 and contain no control characters other than tab, newline and
 * carriage return.
 */
export function looksLikeText(bytes: Buffer): boolean {
  if (bytes.length === 0) return false;
  if (bytes.includes(0)) return false;

  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (decoded.includes('\uFFFD')) return false;

  for (const character of decoded) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return false;
    if (code === 0x7f) return false;
  }
  return true;
}

/**
 * Looks for markup that a browser might execute if this file were ever served
 * inline.
 *
 * Belt and braces. Text is served as `text/plain` with `nosniff` and
 * `Content-Disposition: attachment`, so none of this should matter — but a
 * `.txt` whose first bytes are `<script>` is not a log file anyone needs to
 * attach, and refusing it costs a customer nothing.
 */
export function looksLikeMarkup(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 1024).toString('utf8').toLowerCase();
  return /<\s*(script|iframe|svg|html|\?php|embed|object)\b/.test(head);
}

export async function detectType(bytes: Buffer): Promise<TypeVerdict> {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };

  const detected = await fileTypeFromBuffer(bytes);

  if (detected) {
    const allowed = ALLOWED_TYPES.get(detected.mime);
    if (!allowed) return { ok: false, reason: 'not_allowed', detected: detected.mime };

    /* `file-type` reports PDF from a signature that can appear later in the
       file; requiring it at offset 0 refuses a polyglot whose first bytes are
       something else entirely. */
    if (detected.mime === 'application/pdf' && !looksLikePdf(bytes)) {
      return { ok: false, reason: 'not_allowed', detected: detected.mime };
    }

    return {
      ok: true,
      mimeType: detected.mime,
      extension: allowed.extension,
      image: allowed.image,
    };
  }

  /* No binary signature. Text is the only remaining possibility. */
  if (looksLikeText(bytes) && !looksLikeMarkup(bytes)) {
    return { ok: true, mimeType: 'text/plain', extension: 'txt', image: false };
  }

  return { ok: false, reason: 'unknown' };
}

/**
 * A filename safe to put in a `Content-Disposition` header.
 *
 * The stored original is shown in the interface and must never reach a header
 * unescaped: a newline in it splits the response, and a quote breaks out of
 * the parameter. This keeps a readable basename and nothing else — no path
 * separators, no control characters, no quotes.
 */
export function safeFilename(original: string | undefined, extension: string): string {
  const base = (original ?? 'attachment')
    .split(/[/\\]/)
    .pop()
    /* eslint-disable-next-line no-control-regex -- removing control characters is the point */
    ?.replace(/[\u0000-\u001f\u007f"'\\]/g, '')
    .trim();

  const cleaned = (base === undefined || base === '' ? 'attachment' : base).slice(0, 80);
  return cleaned.toLowerCase().endsWith(`.${extension}`) ? cleaned : `${cleaned}.${extension}`;
}
