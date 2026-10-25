import sharp from 'sharp';

/**
 * Real files, generated rather than hard-coded.
 *
 * The first version of these tests used hand-written magic bytes — an eight
 * byte PNG signature followed by zeros — and `file-type` correctly refused to
 * call it a PNG, because it validates the chunk structure rather than just the
 * first eight bytes. Weakening the detector to accept the fixture would have
 * been exactly the wrong fix: the fixture was wrong, and a detector that
 * accepts a signature with no valid structure is the one a polyglot walks
 * through.
 *
 * Generating with sharp also means the sanitiser is tested against images a
 * decoder actually produced, including the EXIF the strip has to remove.
 */

export async function makePng(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .png()
    .toBuffer();
}

export async function makeJpeg(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 90, b: 160 } },
  })
    .jpeg()
    .toBuffer();
}

export async function makeWebp(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 120, b: 60 } },
  })
    .webp()
    .toBuffer();
}

/**
 * A JPEG carrying GPS coordinates, for proving the strip works.
 *
 * The coordinates are invented — somewhere in the Mediterranean — because a
 * real location in a test fixture is the sort of thing this whole control
 * exists to prevent.
 */
export async function makeJpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .withExif({
      IFD0: { Make: 'C.S.A.S Test', Model: 'Fixture' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '33/1 0/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '35/1 0/1 0/1',
      },
    })
    .jpeg()
    .toBuffer();
}

/** A valid PNG with a payload concatenated after its end marker. */
export async function makePngWithTrailer(trailer: string): Promise<Buffer> {
  return Buffer.concat([await makePng(), Buffer.from(trailer, 'utf8')]);
}
