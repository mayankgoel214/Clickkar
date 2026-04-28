/**
 * V5 Composite Engine — composites real product cutout onto AI-generated background.
 *
 * Guarantees pixel-perfect product fidelity by using the actual product pixels
 * from BiRefNet cutout, not AI-regenerated product.
 */

export interface CompositeOptions {
  cutoutBuffer: Buffer;      // Product cutout with alpha channel (from BiRefNet)
  backgroundBuffer: Buffer;  // AI-generated background scene (from Gemini)
  physicalSize: string;      // 'tiny' | 'small' | 'medium' | 'large'
  style: string;             // Affects placement and shadow
}

export async function compositeProductOntoBackground(
  options: CompositeOptions,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const { cutoutBuffer, backgroundBuffer, physicalSize, style } = options;

  const CANVAS_SIZE = 1024;

  // Step 1: Resize background to canvas — keep lossless PNG to avoid DCT block
  // edges that amplify moiré when the product cutout is composited on top.
  // Final JPEG compression happens at the very end (Step 8).
  const bg = await sharp(backgroundBuffer)
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'cover' })
    .png()
    .toBuffer();

  // Step 2: Determine fill fraction based on size and style
  const baseFill: Record<string, number> = {
    tiny: 0.45,
    small: 0.55,
    medium: 0.60,
    large: 0.65,
  };
  let fillFraction = baseFill[physicalSize] ?? 0.55;

  // Style adjustments
  if (style === 'style_minimal') fillFraction -= 0.12;
  if (style === 'style_gradient' || style === 'style_autmn_special') fillFraction += 0.05;
  if (style === 'style_clean_white') fillFraction += 0.08;

  // Enforce minimum fill for small products in product-focused styles
  const productFocusStyles = ['style_gradient', 'style_clean_white', 'style_autmn_special', 'style_studio'];
  if ((physicalSize === 'tiny' || physicalSize === 'small') && productFocusStyles.includes(style)) {
    fillFraction = Math.max(fillFraction, 0.58); // minimum 58% for small products in these styles
  }

  fillFraction = Math.max(0.25, Math.min(0.75, fillFraction));

  const targetDim = Math.round(CANVAS_SIZE * fillFraction);

  // Step 3: Resize cutout preserving aspect ratio
  const cutoutMeta = await sharp(cutoutBuffer).metadata();
  const cutoutW = cutoutMeta.width ?? 512;
  const cutoutH = cutoutMeta.height ?? 512;

  const scale = Math.min(targetDim / cutoutW, targetDim / cutoutH);
  const newW = Math.round(cutoutW * scale);
  const newH = Math.round(cutoutH * scale);

  let resizedCutout = await sharp(cutoutBuffer)
    .resize(newW, newH, { fit: 'inside', kernel: 'lanczos3' })
    .ensureAlpha()
    .png()
    .toBuffer();

  // Step 4: Apply edge feathering (subtle Gaussian blur on alpha channel)
  resizedCutout = await featherEdges(resizedCutout, newW, newH);

  // Step 5: Determine placement
  const placement = getPlacement(style, newW, newH, CANVAS_SIZE);

  // Step 6: Generate shadow
  const shadow = await generateShadow(resizedCutout, newW, newH, style);
  const shadowOffsetY = getShadowOffset(style);

  // Step 7: Lighting harmonization (subtle brightness match)
  const harmonizedCutout = await harmonizeLighting(
    resizedCutout, bg, placement, newW, newH,
  );

  // Step 8: Composite layers
  const result = await sharp(bg)
    .composite([
      // Shadow layer (below product)
      {
        input: shadow,
        left: Math.max(0, placement.left),
        top: Math.max(0, Math.min(CANVAS_SIZE - 10, placement.top + shadowOffsetY)),
        blend: 'over' as const,
      },
      // Product cutout layer (on top)
      {
        input: harmonizedCutout,
        left: Math.max(0, placement.left),
        top: Math.max(0, placement.top),
        blend: 'over' as const,
      },
    ])
    .jpeg({ quality: 93 })
    .toBuffer();

  console.info(JSON.stringify({
    event: 'v5_composite_done',
    style,
    physicalSize,
    fillFraction: Math.round(fillFraction * 100),
    cutoutSize: `${newW}x${newH}`,
    placement,
  }));

  return result;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function getPlacement(
  style: string,
  cutoutW: number,
  cutoutH: number,
  canvasSize: number,
): { left: number; top: number } {
  // Minimal: rule of thirds (left intersection)
  if (style === 'style_minimal') {
    return {
      left: Math.round(canvasSize * 0.33 - cutoutW / 2),
      top: Math.round(canvasSize * 0.45 - cutoutH / 2),
    };
  }

  // Default: center horizontally, slightly below vertical center (grounded feel)
  return {
    left: Math.round((canvasSize - cutoutW) / 2),
    top: Math.round(canvasSize * 0.52 - cutoutH / 2),
  };
}

function getShadowOffset(style: string): number {
  const offsets: Record<string, number> = {
    style_gradient:       10,
    style_clean_white:    5,
    style_minimal:        3,
    style_studio:         7,
    style_festive:        6,
    style_lifestyle:      6,
    style_outdoor:        6,
    style_autmn_special:  8,
  };
  return offsets[style] ?? 6;
}

async function generateShadow(
  cutoutBuffer: Buffer,
  width: number,
  height: number,
  style: string,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;

  const shadowConfig: Record<string, { blur: number; opacity: number }> = {
    style_gradient:       { blur: 25, opacity: 0.55 },
    style_clean_white:    { blur: 15, opacity: 0.12 },
    style_minimal:        { blur: 4,  opacity: 0.30 },
    style_studio:         { blur: 14, opacity: 0.22 },
    style_festive:        { blur: 16, opacity: 0.18 },
    style_lifestyle:      { blur: 18, opacity: 0.18 },
    style_outdoor:        { blur: 20, opacity: 0.15 },
    style_autmn_special:  { blur: 20, opacity: 0.30 },
  };
  const config = shadowConfig[style] ?? { blur: 16, opacity: 0.20 };

  // Extract alpha from cutout, create black shadow with that alpha * opacity
  const { data, info } = await sharp(cutoutBuffer)
    .ensureAlpha()
    .resize(width, height)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const shadowRGBA = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const alpha = data[i * 4 + 3] ?? 0;
    shadowRGBA[i * 4]     = 0; // R
    shadowRGBA[i * 4 + 1] = 0; // G
    shadowRGBA[i * 4 + 2] = 0; // B
    shadowRGBA[i * 4 + 3] = Math.round(alpha * config.opacity);
  }

  // Blur the shadow
  const blurRadius = Math.max(1, Math.round(config.blur));
  return sharp(shadowRGBA, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .blur(blurRadius)
    .png()
    .toBuffer();
}

async function featherEdges(
  cutoutBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;

  // Extract alpha, apply slight blur, recombine
  const { data } = await sharp(cutoutBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Create alpha-only image, blur it slightly
  const alphaOnly = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    alphaOnly[i] = data[i * 4 + 3] ?? 0;
  }

  const blurredAlpha = await sharp(alphaOnly, {
    raw: { width, height, channels: 1 },
  })
    .blur(1.0) // 1.0px feather — reduced to minimise translucent edge zone where moiré forms
    .raw()
    .toBuffer();

  // Rebuild RGBA with blurred alpha
  const result = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    result[i * 4]     = data[i * 4]     ?? 0;
    result[i * 4 + 1] = data[i * 4 + 1] ?? 0;
    result[i * 4 + 2] = data[i * 4 + 2] ?? 0;
    result[i * 4 + 3] = blurredAlpha[i] ?? 0;
  }

  return sharp(result, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function harmonizeLighting(
  cutoutBuffer: Buffer,
  backgroundBuffer: Buffer,
  placement: { left: number; top: number },
  cutoutW: number,
  cutoutH: number,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;

  try {
    // Sample background brightness in the product region
    const bgMeta = await sharp(backgroundBuffer).metadata();
    const bgW = bgMeta.width ?? 1024;
    const bgH = bgMeta.height ?? 1024;

    // Clamp extraction region to background bounds
    const extractLeft = Math.max(0, Math.min(placement.left, bgW - cutoutW));
    const extractTop = Math.max(0, Math.min(placement.top, bgH - cutoutH));
    const extractWidth = Math.min(cutoutW, bgW - extractLeft);
    const extractHeight = Math.min(cutoutH, bgH - extractTop);

    if (extractWidth < 10 || extractHeight < 10) return cutoutBuffer;

    const bgRegion = await sharp(backgroundBuffer)
      .extract({ left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight })
      .stats();

    const bgBrightness =
      (bgRegion.channels[0]!.mean + bgRegion.channels[1]!.mean + bgRegion.channels[2]!.mean) / 3;

    const cutoutStats = await sharp(cutoutBuffer).stats();
    const cutoutBrightness =
      (cutoutStats.channels[0]!.mean + cutoutStats.channels[1]!.mean + cutoutStats.channels[2]!.mean) / 3;

    if (cutoutBrightness < 5) return cutoutBuffer; // Avoid division issues

    const ratio = bgBrightness / cutoutBrightness;
    const clamped = Math.max(0.85, Math.min(1.15, ratio)); // Max +-15% adjustment

    if (Math.abs(clamped - 1.0) < 0.04) return cutoutBuffer; // Close enough

    return sharp(cutoutBuffer)
      .modulate({ brightness: clamped })
      .png()
      .toBuffer();
  } catch {
    // On any error, return cutout unchanged
    return cutoutBuffer;
  }
}
