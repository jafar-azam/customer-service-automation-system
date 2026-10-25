import sharp from 'sharp';

/**
 * Re-encodes an image, destroying everything that is not pixels.
 *
 * This does three jobs at once, and the third is the one people forget:
 *
 * 1. **Metadata is gone.** EXIF carries GPS coordinates, the device serial,
 *    and the capture time. A customer photographing a broken printer sends
 *    their office location without knowing it. `PRIVACY.md` requires this.
 * 2. **Appended payloads are gone.** A JPEG stays a valid JPEG with a ZIP, a
 *    PHP script or an HTML document concatenated after its end marker. Every
 *    byte after the image data is discarded here, because only the decoded
 *    pixels survive.
 * 3. **The file is re-made by a decoder we chose.** A file crafted to exploit
 *    one specific viewer no longer has its crafted bytes.
 *
 * Re-encoding is lossy for JPEG, and that is an accepted cost: this is a
 * support attachment, not an archival master.
 */

/**
 * Above this, an image is a decompression bomb rather than a screenshot.
 *
 * The two limits have to agree, and the first version's did not: a
 * `MAX_DIMENSION` of 8000 means 64 megapixels at square, above a 50 megapixel
 * budget — so an image at exactly the resize threshold could never be
 * decoded to be resized. 6000 squared is 36 megapixels, comfortably inside.
 *
 * For scale: a 4K screenshot is 8.3 megapixels and a current phone photograph
 * is about 12. Fifty is already far beyond anything a support ticket needs.
 */
export const MAX_PIXELS = 50_000_000;
export const MAX_DIMENSION = 6000;

export interface SanitizedImage {
  readonly bytes: Buffer;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

export class ImageRejected extends Error {
  constructor(readonly reason: 'too_large' | 'undecodable') {
    super(`image rejected: ${reason}`);
    this.name = 'ImageRejected';
  }
}

export async function sanitizeImage(bytes: Buffer): Promise<SanitizedImage> {
  /* The dimensions come from the header, which is parsed rather than decoded —
     cheap, and safe on a file claiming to be enormous. Reading them *without*
     the pixel limit is deliberate: with it, sharp refuses here and the only
     thing the caller learns is "undecodable", which is both wrong and
     unhelpful. Checking the number ourselves means a bomb is reported as a
     bomb. */
  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: false, failOn: 'error' }).metadata();
  } catch {
    throw new ImageRejected('undecodable');
  }

  /* sharp types these as required, but a header it could parse while still
     failing to report dimensions is exactly the malformed case this guards. */
  const width: number = metadata.width;
  const height: number = metadata.height;
  if (width === 0 || height === 0) throw new ImageRejected('undecodable');
  if (width * height > MAX_PIXELS) throw new ImageRejected('too_large');

  /* Now decode, with the limit applied so a header that lied about its size
     cannot make sharp allocate for the real one. `failOn: 'error'` stops it
     quietly accepting a truncated file and producing something. */
  const pipeline = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'error' });

  /* Animated input is flattened to its first frame on purpose: an animation
     is not something a support screenshot needs, and keeping frames keeps a
     second decoder surface. */
  try {
    const resized =
      width > MAX_DIMENSION || height > MAX_DIMENSION
        ? pipeline.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside' })
        : pipeline;

    /* PNG for everything. One output format means one decoder on the way back
       out, it is lossless for the screenshots that make up most of these, and
       it sidesteps the question of which JPEG quality is "enough" for someone
       reading an error message in a photograph.

       Sharp writes no EXIF unless asked; `withMetadata()` is deliberately not
       called, which is what makes the GPS strip happen. */
    const output = await resized.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });

    return {
      bytes: output.data,
      mimeType: 'image/png',
      width: output.info.width,
      height: output.info.height,
    };
  } catch (error) {
    if (error instanceof ImageRejected) throw error;
    throw new ImageRejected('undecodable');
  }
}
