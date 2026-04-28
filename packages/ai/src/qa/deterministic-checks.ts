import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeterministicResult {
  pass: boolean;
  failReason: string | null;
  sceneNCC: number;           // 0-1, higher = more similar to input
  estimatedFillPct: number;   // 0-100
  isValid: boolean;
  isBlank: boolean;
  // New diagnostic fields (always populated, used for logging/retry decisions)
  laplacianVariance: number;  // <100 = blurry/smeared, >500 = sharp
  quadrantSymmetry: number;   // >0.85 = likely product duplication
  colorDistance: number;      // >0.5 = significant color shift
  edgeDensityRatio: number;   // <0.4 = over-smooth, >3.0 = artifact halos
  warnings: string[];         // non-fatal issues to feed into retry prompts
}

// ---------------------------------------------------------------------------
// Normalized Cross-Correlation (NCC)
// ---------------------------------------------------------------------------

/**
 * Compute NCC between two grayscale buffers of same size.
 * Returns 0-1 where 1 = identical, 0 = completely different.
 */
function computeNCC(a: Buffer, b: Buffer): number {
  const n = a.length;
  if (n !== b.length || n === 0) return 0;

  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]!;
    sumB += b[i]!;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    dotProduct += da * db;
    normA += da * da;
    normB += db * db;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1; // both are flat/identical
  return Math.max(0, dotProduct / denom);
}

// ---------------------------------------------------------------------------
// Fill Estimation (variance + edge density per grid cell)
// ---------------------------------------------------------------------------

async function estimateFill(buffer: Buffer): Promise<number> {
  const SIZE = 256;
  const GRID = 4;
  const cellSize = SIZE / GRID;

  const raw = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  const cellScores: number[] = [];

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let sum = 0, sumSq = 0, edgeSum = 0, count = 0, edgeCount = 0;

      for (let y = gy * cellSize; y < (gy + 1) * cellSize; y++) {
        for (let x = gx * cellSize; x < (gx + 1) * cellSize; x++) {
          const val = raw[y * SIZE + x]!;
          sum += val;
          sumSq += val * val;
          count++;

          if (x < (gx + 1) * cellSize - 1 && y < (gy + 1) * cellSize - 1) {
            const right = raw[y * SIZE + x + 1]!;
            const below = raw[(y + 1) * SIZE + x]!;
            const edgeStrength = Math.abs(val - right) + Math.abs(val - below);
            edgeSum += edgeStrength;
            edgeCount++;
          }
        }
      }

      const mean = sum / count;
      const variance = sumSq / count - mean * mean;
      const avgEdge = edgeCount > 0 ? edgeSum / edgeCount : 0;

      const hasVariance = variance > 15;
      const hasEdges = avgEdge > 8;
      cellScores.push(hasVariance || hasEdges ? 1 : 0);
    }
  }

  const activeCells = cellScores.reduce((a, b) => a + b, 0);
  return Math.round((activeCells / (GRID * GRID)) * 100);
}

// ---------------------------------------------------------------------------
// Laplacian Variance (blur/smear detection)
// ---------------------------------------------------------------------------

/**
 * Compute Laplacian variance of a grayscale image.
 * Low variance (<100) = blurry/smeared/plastic. High (>500) = sharp/detailed.
 */
async function computeLaplacianVariance(buffer: Buffer): Promise<number> {
  const SIZE = 256;
  const gray = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  let sum = 0, sumSq = 0, count = 0;
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const center = gray[y * SIZE + x]!;
      const lap = 4 * center
        - gray[(y - 1) * SIZE + x]!
        - gray[(y + 1) * SIZE + x]!
        - gray[y * SIZE + (x - 1)]!
        - gray[y * SIZE + (x + 1)]!;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

// ---------------------------------------------------------------------------
// Quadrant Symmetry (duplication detection without AI)
// ---------------------------------------------------------------------------

/**
 * Compare diagonal quadrants of the image via NCC.
 * High similarity (>0.85) suggests product duplication in mirrored positions.
 */
async function computeQuadrantSymmetry(buffer: Buffer): Promise<number> {
  const SIZE = 256;
  const HALF = SIZE / 2;
  const gray = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  // Extract 4 quadrants
  const quads: Buffer[] = [];
  for (const [qy, qx] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
    const q = Buffer.alloc(HALF * HALF);
    for (let y = 0; y < HALF; y++) {
      for (let x = 0; x < HALF; x++) {
        q[y * HALF + x] = gray[(qy * HALF + y) * SIZE + (qx * HALF + x)]!;
      }
    }
    quads.push(q);
  }

  // Max NCC between diagonal pairs (TL-BR, TR-BL)
  const ncc1 = computeNCC(quads[0]!, quads[3]!);
  const ncc2 = computeNCC(quads[1]!, quads[2]!);
  return Math.max(ncc1, ncc2);
}

// ---------------------------------------------------------------------------
// Color Histogram Distance (product color shift detection)
// ---------------------------------------------------------------------------

/**
 * Compare center-region color histograms between input and output.
 * Returns chi-squared distance. >0.5 = significant color shift.
 */
async function computeColorDistance(inputBuf: Buffer, outputBuf: Buffer): Promise<number> {
  const SIZE = 128;

  const extractCenter = async (buf: Buffer) => {
    const meta = await sharp(buf).metadata();
    const w = meta.width!, h = meta.height!;
    const cropW = Math.round(w * 0.6), cropH = Math.round(h * 0.6);
    const left = Math.round((w - cropW) / 2), top = Math.round((h - cropH) / 2);
    return sharp(buf)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(SIZE, SIZE)
      .raw()
      .toBuffer();
  };

  const [inputData, outputData] = await Promise.all([
    extractCenter(inputBuf),
    extractCenter(outputBuf),
  ]);

  // Build 8-bin histograms per channel
  const bins = 8;
  const inputHist = new Float32Array(bins * 3);
  const outputHist = new Float32Array(bins * 3);
  const pixelCount = SIZE * SIZE;

  for (let i = 0; i < pixelCount * 3; i += 3) {
    for (let c = 0; c < 3; c++) {
      const iBin = Math.min(bins - 1, Math.floor((inputData[i + c] ?? 0) / 32));
      inputHist[c * bins + iBin] = (inputHist[c * bins + iBin] ?? 0) + 1;
      const oBin = Math.min(bins - 1, Math.floor((outputData[i + c] ?? 0) / 32));
      outputHist[c * bins + oBin] = (outputHist[c * bins + oBin] ?? 0) + 1;
    }
  }

  // Normalize histograms
  for (let i = 0; i < inputHist.length; i++) {
    inputHist[i] = (inputHist[i] ?? 0) / pixelCount;
    outputHist[i] = (outputHist[i] ?? 0) / pixelCount;
  }

  // Chi-squared distance
  let chiSq = 0;
  for (let i = 0; i < inputHist.length; i++) {
    const denom = inputHist[i]! + outputHist[i]!;
    if (denom > 0) {
      chiSq += ((inputHist[i]! - outputHist[i]!) ** 2) / denom;
    }
  }
  return chiSq;
}

// ---------------------------------------------------------------------------
// Edge Density (artifact/halo detection)
// ---------------------------------------------------------------------------

/**
 * Compute edge density of an image (fraction of pixels with strong gradients).
 * Returns 0-1. Compare input vs output ratio to detect over-smooth or artifact halos.
 */
async function computeEdgeDensity(buffer: Buffer): Promise<number> {
  const SIZE = 256;
  const gray = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  let edgePixels = 0;
  const threshold = 30;
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const gx = gray[y * SIZE + x + 1]! - gray[y * SIZE + x - 1]!;
      const gy = gray[(y + 1) * SIZE + x]! - gray[(y - 1) * SIZE + x]!;
      if (Math.sqrt(gx * gx + gy * gy) > threshold) edgePixels++;
    }
  }
  return edgePixels / ((SIZE - 2) * (SIZE - 2));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const NCC_REJECT_THRESHOLD = 0.92;
const MIN_FILL_PCT = 12;
const MIN_DIMENSION = 512;
const BLANK_STDDEV_THRESHOLD = 5;
const LAPLACIAN_REJECT_THRESHOLD = 50;     // Very blurry/smeared
const QUADRANT_SYMMETRY_THRESHOLD = 0.85;  // Likely duplication

/**
 * Layer 0: Deterministic programmatic gates.
 * Pure sharp — zero API cost, <200ms.
 * Catches: identical-to-input, product too small, blank/corrupt, wrong dimensions,
 *          blurry/smeared output, product duplication, color shift, artifact halos.
 */
export async function runDeterministicChecks(
  inputBuffer: Buffer,
  outputBuffer: Buffer,
): Promise<DeterministicResult> {
  const result: DeterministicResult = {
    pass: true,
    failReason: null,
    sceneNCC: 0,
    estimatedFillPct: 50,
    isValid: true,
    isBlank: false,
    laplacianVariance: 0,
    quadrantSymmetry: 0,
    colorDistance: 0,
    edgeDensityRatio: 1,
    warnings: [],
  };

  // ---- Check 0A: Image validity + aspect ratio ----
  try {
    const meta = await sharp(outputBuffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;

    if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
      result.pass = false;
      result.failReason = `output_too_small:${w}x${h}`;
      result.isValid = false;
      return result;
    }

    const aspectDiff = Math.abs(w - h) / Math.max(w, h);
    if (aspectDiff > 0.10) {
      result.pass = false;
      result.failReason = `wrong_aspect_ratio:${w}x${h}`;
      result.isValid = false;
      return result;
    }

    // Blank detection
    const tiny = await sharp(outputBuffer)
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    let sum = 0, sumSq = 0;
    for (let i = 0; i < tiny.length; i++) {
      sum += tiny[i]!;
      sumSq += tiny[i]! * tiny[i]!;
    }
    const mean = sum / tiny.length;
    const stddev = Math.sqrt(sumSq / tiny.length - mean * mean);

    if (stddev < BLANK_STDDEV_THRESHOLD) {
      result.pass = false;
      result.failReason = 'output_is_blank';
      result.isBlank = true;
      return result;
    }
  } catch {
    result.pass = false;
    result.failReason = 'output_corrupt';
    result.isValid = false;
    return result;
  }

  // ---- Check 0B: Scene change detection via NCC ----
  try {
    const NCC_SIZE = 256;
    const [inputGray, outputGray] = await Promise.all([
      sharp(inputBuffer).resize(NCC_SIZE, NCC_SIZE, { fit: 'fill' }).grayscale().raw().toBuffer(),
      sharp(outputBuffer).resize(NCC_SIZE, NCC_SIZE, { fit: 'fill' }).grayscale().raw().toBuffer(),
    ]);

    result.sceneNCC = computeNCC(inputGray, outputGray);

    if (result.sceneNCC > NCC_REJECT_THRESHOLD) {
      result.pass = false;
      result.failReason = `no_scene_change:ncc=${result.sceneNCC.toFixed(3)}`;
      return result;
    }
  } catch {
    // Non-fatal
  }

  // ---- Check 0C: Product fill estimation ----
  try {
    result.estimatedFillPct = await estimateFill(outputBuffer);

    if (result.estimatedFillPct < MIN_FILL_PCT) {
      result.pass = false;
      result.failReason = `product_too_small:fill=${result.estimatedFillPct}%`;
      return result;
    }
  } catch {
    // Non-fatal
  }

  // ---- Check 0D: Laplacian variance (blur/smear detection) ----
  try {
    result.laplacianVariance = await computeLaplacianVariance(outputBuffer);

    if (result.laplacianVariance < LAPLACIAN_REJECT_THRESHOLD) {
      result.pass = false;
      result.failReason = `output_blurry:laplacian=${Math.round(result.laplacianVariance)}`;
      return result;
    }

    // Warning level: not a hard fail but feed into retry prompt
    if (result.laplacianVariance < 200) {
      result.warnings.push(`Image appears soft/slightly blurry (sharpness=${Math.round(result.laplacianVariance)}). Generate a SHARPER, more detailed image.`);
    }
  } catch {
    // Non-fatal
  }

  // ---- Check 0E: Quadrant symmetry (duplication detection) ----
  try {
    result.quadrantSymmetry = await computeQuadrantSymmetry(outputBuffer);

    if (result.quadrantSymmetry > QUADRANT_SYMMETRY_THRESHOLD) {
      result.pass = false;
      result.failReason = `likely_duplication:quadrant_ncc=${result.quadrantSymmetry.toFixed(3)}`;
      return result;
    }
  } catch {
    // Non-fatal
  }

  // ---- Check 0F: Color histogram distance (color shift) ----
  try {
    result.colorDistance = await computeColorDistance(inputBuffer, outputBuffer);

    // V1.2 — severe color shift becomes a hard fail. Threshold 2.5 catches
    // catastrophic identity drift (e.g. white Monster Zero Ultra → black
    // regular Monster) without false-positiving normal scene background
    // changes (red table → blue splash, green velvet → red velvet).
    if (result.colorDistance > 2.5) {
      result.pass = false;
      result.failReason = `severe_color_shift:colorDistance=${result.colorDistance.toFixed(2)}`;
      return result;
    }

    // Mild color shift — warning only. Scene background changes naturally
    // produce some shift; we only flag if it's notable.
    if (result.colorDistance > 1.0) {
      result.warnings.push(`Product colors may have shifted significantly (colorDistance=${result.colorDistance.toFixed(2)}). Ensure the product's EXACT original colors are preserved.`);
    }
  } catch {
    // Non-fatal
  }

  // ---- Check 0G: Edge density ratio (artifact/over-smooth detection) ----
  try {
    const [inputEdge, outputEdge] = await Promise.all([
      computeEdgeDensity(inputBuffer),
      computeEdgeDensity(outputBuffer),
    ]);

    result.edgeDensityRatio = inputEdge > 0 ? outputEdge / inputEdge : 1;

    // Over-smooth output (painted/plastic look)
    if (result.edgeDensityRatio < 0.3 && outputEdge < 0.05) {
      result.warnings.push('Image appears unnaturally smooth/painted. Generate a more PHOTOREALISTIC image with natural texture detail.');
    }

    // Excessive edges (artifact halos)
    if (result.edgeDensityRatio > 4.0) {
      result.warnings.push('Image has unusual edge artifacts. Generate a cleaner, more natural image.');
    }
  } catch {
    // Non-fatal
  }

  return result;
}
