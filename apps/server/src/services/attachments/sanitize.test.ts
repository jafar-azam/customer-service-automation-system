import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { makeJpeg, makeJpegWithGps, makePng, makePngWithTrailer } from './fixtures.js';
import { ImageRejected, MAX_DIMENSION, sanitizeImage } from './sanitize.js';

describe('metadata is destroyed', () => {
  /* The control this whole step exists for. A customer photographing a broken
     printer sends their office location in EXIF without knowing it. */
  it('removes GPS coordinates from a photograph', async () => {
    const original = await makeJpegWithGps();

    /* The fixture must actually carry what the test claims to remove, or this
       passes against an image that never had GPS in the first place. */
    const before = await sharp(original).metadata();
    expect(before.exif).toBeInstanceOf(Buffer);
    expect(before.exif?.toString('latin1')).toContain('C.S.A.S Test');

    const clean = await sanitizeImage(original);
    const after = await sharp(clean.bytes).metadata();

    expect(after.exif).toBeUndefined();
    expect(clean.bytes.toString('latin1')).not.toContain('C.S.A.S Test');
    expect(clean.bytes.toString('latin1')).not.toContain('GPS');
  });

  /* A JPEG stays a valid JPEG with a ZIP, a PHP script or an HTML document
     concatenated after its end marker. Only decoded pixels survive a
     re-encode, so every byte past the image data is gone. */
  it('discards a payload appended after the image data', async () => {
    const withTrailer = await makePngWithTrailer('<?php system($_GET[0]); ?>');
    expect(withTrailer.toString('latin1')).toContain('<?php');

    const clean = await sanitizeImage(withTrailer);
    expect(clean.bytes.toString('latin1')).not.toContain('<?php');
  });

  it('normalises every accepted image to one output format', async () => {
    for (const input of [await makePng(), await makeJpeg()]) {
      const clean = await sanitizeImage(input);
      expect(clean.mimeType).toBe('image/png');
      expect(clean.bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }
  });

  it('keeps the picture', async () => {
    const clean = await sanitizeImage(await makePng(40, 25));
    expect(clean.width).toBe(40);
    expect(clean.height).toBe(25);
  });
});

describe('what it refuses', () => {
  it('refuses something that is not an image at all', async () => {
    await expect(sanitizeImage(Buffer.from('not an image'))).rejects.toThrow(ImageRejected);
  });

  it('refuses a truncated image rather than producing something', async () => {
    const png = await makePng(32, 32);
    await expect(sanitizeImage(png.subarray(0, 30))).rejects.toThrow(ImageRejected);
  });

  /* Large but legitimate: inside the pixel budget, so it is resized rather
     than refused. A wide screenshot should still arrive. */
  it('resizes an oversized but decodable image', async () => {
    const wide = await sharp({
      create: { width: 7000, height: 1200, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();

    const clean = await sanitizeImage(wide);
    expect(Math.max(clean.width, clean.height)).toBe(MAX_DIMENSION);
    /* Aspect ratio preserved — `fit: 'inside'`, not a squash. */
    expect(clean.height).toBe(Math.round((1200 / 7000) * MAX_DIMENSION));
  });

  /* A decompression bomb: a few kilobytes on disk, gigabytes once decoded.
     Refused on the header, before anything allocates for it — and reported as
     what it is, which the first version got wrong by letting sharp's own
     limit fire and calling the result "undecodable". */
  it('refuses a decompression bomb, and says so', async () => {
    const bomb = await sharp({
      /* 144 megapixels: far above this service's 50 megapixel budget, and
         below sharp's own 268 megapixel default — which the first attempt at
         this fixture exceeded, so sharp refused to *create* the bomb and the
         test failed before reaching the code it was testing. */
      create: { width: 12_000, height: 12_000, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();

    /* The ratio is what makes it a bomb, not any particular file size: this
       is under half a megabyte on disk and over 400 MB once decoded. */
    const decodedBytes = 12_000 * 12_000 * 3;
    expect(decodedBytes / bomb.byteLength).toBeGreaterThan(100);
    await expect(sanitizeImage(bomb)).rejects.toMatchObject({ reason: 'too_large' });
  });
});
