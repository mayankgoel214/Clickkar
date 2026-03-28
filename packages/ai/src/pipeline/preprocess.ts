import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// HEIC detection
// ---------------------------------------------------------------------------

/**
 * Detect HEIC/HEIF by magic bytes.
 * HEIC files have 'ftyp' at offset 4 followed by 'heic', 'heix', 'hevc', or 'mif1'.
 */
function isHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const ftyp = buffer.toString('ascii', 4, 8);
  if (ftyp !== 'ftyp') return false;
  const brand = buffer.toString('ascii', 8, 12).toLowerCase();
  return ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const MAX_EDGE_PX = 4000;

/**
 * Preprocess a raw product image buffer before sending to the AI pipeline.
 *
 * Steps:
 * 1. Convert HEIC to JPEG (detected by magic bytes)
 * 2. Auto-rotate based on EXIF orientation
 * 3. Resize if any edge exceeds MAX_EDGE_PX (4000px)
 * 4. Normalise output to JPEG with quality 92
 *
 * Returns the processed buffer + metadata.
 */
export async function preprocessImage(imageBuffer: Buffer): Promise<{
  buffer: Buffer;
  metadata: ImageMetadata;
}> {
  const startMs = Date.now();

  let pipeline = sharp(imageBuffer, {
    // Sharp reads EXIF and can handle most formats
    failOn: 'truncated',
  });

  // HEIC detection: sharp supports HEIC if libvips is compiled with heif support
  // We log a warning if detected — in production environments this should work
  if (isHeic(imageBuffer)) {
    console.info(
      JSON.stringify({ event: 'preprocess_heic_detected' })
    );
    // Sharp handles HEIC conversion automatically when reading — just ensure
    // we output as JPEG below
  }

  // Step 1 & 2: Auto-rotate (applies EXIF orientation) and get metadata
  pipeline = pipeline.rotate(); // reads EXIF orientation, strips it

  const rawMeta = await pipeline.metadata();
  const originalWidth = rawMeta.width ?? 0;
  const originalHeight = rawMeta.height ?? 0;

  // Step 3: Resize if any edge exceeds limit
  if (originalWidth > MAX_EDGE_PX || originalHeight > MAX_EDGE_PX) {
    pipeline = pipeline.resize(MAX_EDGE_PX, MAX_EDGE_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    console.info(
      JSON.stringify({
        event: 'preprocess_resize',
        originalWidth,
        originalHeight,
        maxEdge: MAX_EDGE_PX,
      })
    );
  }

  // Step 4: Output as JPEG with high quality, strip metadata except colour profile
  const { data: processedBuffer, info } = await pipeline
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const metadata: ImageMetadata = {
    width: info.width,
    height: info.height,
    format: 'jpeg',
    sizeBytes: info.size,
  };

  console.info(
    JSON.stringify({
      event: 'preprocess_complete',
      width: metadata.width,
      height: metadata.height,
      sizeBytes: metadata.sizeBytes,
      durationMs: Date.now() - startMs,
    })
  );

  return { buffer: processedBuffer, metadata };
}
