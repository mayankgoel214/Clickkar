/**
 * Beta-mode prompt builder — the only prompt path used in production V1.
 *
 * V1 ad-engineered prompt (April 2026):
 *   1. Style — minimal one-liner per style ("in clean white studio style")
 *   2. Per-style creative mood anchor — 2-4 words elevating beyond "generic ad"
 *      (e.g. "bold and editorial" for studio, "cinematic and dramatic" for
 *      gradient). Pulls Pro toward award-winning ad photography priors.
 *   3. Ad qualifier — "for a premium, head-turning ad campaign" (concrete
 *      creative push without forcing specific composition)
 *   4. Per-category nudge — single sentence specific to the product category
 *      (only added for high-value categories where Pro consistently fails)
 *   5. Text rule — "Keep only text already printed on the product"
 *      (dropped when user explicitly asks for tagline / caption / copy)
 *   6. Aspect — "1:1 square" (locked for ad consistency)
 *
 * Beta won the comparison vs SCHEMA prompts because Pro's natural priors
 * weren't being fought by elaborate constraints. V1 keeps minimalism but
 * adds three specific levers proven to help:
 *   - ad-mode trigger (premium quality, scroll-stopping)
 *   - per-style creative mood (cinematic / opulent / architectural / etc.)
 *   - per-category brand-fidelity nudge (jewellery sets, food labels, etc.)
 *
 * Autmn Special is the wildcard — explicitly asks for striking, art-directed,
 * magazine-cover-worthy compositions instead of "in X style".
 */

const AD_QUALIFIER = ' for a premium, head-turning ad campaign';

/**
 * Per-style creative mood anchor — 2-4 words inserted between style and
 * ad qualifier. Pushes Pro toward specific creative aesthetics WITHOUT
 * prescribing exact composition (which previously failed in V5 SCHEMA).
 *
 * Clean White stays uncreative — it's literally meant to be a clean catalog
 * shot. Other styles get their own creative direction.
 */
function getStyleCreativeMood(style: string): string {
  switch (style) {
    case 'style_clean_white':    return '';                                 // clean is the mood
    case 'style_studio':         return ', bold and editorial';
    case 'style_lifestyle':      return ', warm and authentic';
    case 'style_gradient':       return ', cinematic and dramatic';
    case 'style_outdoor':        return ', immersive and natural';
    case 'style_festive':        return ', opulent and celebratory';
    case 'style_minimal':        return ', architectural and restrained';
    default:                     return '';
  }
}

/**
 * Per-category brand-fidelity nudges. Only added for categories where Pro
 * consistently fails on the same axis (e.g. food labels need to stay readable,
 * jewellery sets drop pieces). Categories with no nudge ('cat_general',
 * 'cat_handicraft') get a clean prompt.
 *
 * Maps to category IDs from packages/session/src/types.ts.
 */
function getCategoryNudge(category: string | undefined): string {
  switch (category) {
    case 'cat_jewellery':
      return ' Show the metalwork detail and stones clearly. If multiple pieces, all visible together as a coherent set.';
    case 'cat_food':
      return ' Brand label and packaging text fully readable, sharp, and unaltered.';
    case 'cat_garment':
      return ' Fabric texture and stitching visible, garment pose flatters the cut.';
    case 'cat_skincare':
      return ' Bottle or jar label clearly readable, hero composition, clean ingredient-focus aesthetic.';
    case 'cat_candle':
      return ' Glow ambiance complements the candle without overpowering the product label.';
    case 'cat_bag':
      return ' Hardware and stitching details visible, bag shape clearly defined.';
    case 'cat_general':
    case 'cat_handicraft':
    default:
      return '';
  }
}

/**
 * Per-style art direction provided by the Creative Brief step (V1.1).
 * When present, it's spliced between the style label and the ad qualifier.
 */
export interface StyleArtDirection {
  /** 10-25 word concrete scene: where + what's happening + key visual element. */
  sceneDirection: string;
  /** 3-7 word emotional/visual tone (e.g. "warm and aspirational"). */
  moodAnchor: string;
}

/**
 * V1 / V1.1 Beta prompt builder.
 *
 * Deliberately does NOT name the product. Naming pulls the model toward
 * the training-set average for that product class (e.g. "Bluetooth speaker"
 * biases toward a generic rectangular speaker, eroding the specific reference).
 * By saying only "this product" the model has nothing to draw from except
 * the input image itself — maximum identity anchoring, zero conceptual drift.
 *
 * For `style_with_model`: defaults to "Indian model" since Autmn targets Indian
 * SMBs. User instructions (voice note / typed) override the default — e.g. if
 * they ask for "young male" or "middle-aged woman", we drop the Indian default
 * and honor their ask verbatim.
 *
 * For all other styles: user instructions are appended to the base prompt.
 *
 * V1.1: When `artDirection` is provided, the per-product scene + mood is
 * spliced in just before the ad qualifier. This makes each ad genuinely
 * product-specific instead of a generic style template. When omitted (the
 * Creative Brief step failed or was skipped), the prompt falls back to the
 * V1 base Beta — proven working.
 *
 * Signature keeps `productName` for call-site compatibility but ignores it.
 */
export function buildBetaPrompt(
  style: string,
  _productName: string,
  userInstructions?: string,
  productCategory?: string,
  artDirection?: StyleArtDirection,
): string {
  const extra = userInstructions?.trim();

  // Text rule: only keep text that's already printed on the product. Dropped
  // when the user explicitly asks for text/tagline — their ask wins. Positive
  // framing ("keep only X") — Gemini respects affirmative rules more reliably.
  const userWantsText = !!extra && /\b(text|tagline|headline|caption|copy|slogan)\b/i.test(extra);
  const textRule = userWantsText
    ? ''
    : ' Keep only text that is already printed on the product itself.';

  // Aspect ratio: lock every style to 1:1 square for consistent output shape
  // across all 3 styles in one order. Square fits WhatsApp, Instagram post,
  // Facebook feed uniformly.
  const aspectRule = ' Aspect: 1:1 square.';

  // Per-category brand-fidelity nudge — empty string for low-value categories.
  const categoryNudge = getCategoryNudge(productCategory);

  // V1.1 art-direction insert. When the Creative Brief step succeeded for
  // this style, splice in: " — <sceneDirection>, <moodAnchor>". This is the
  // per-product creative direction. Falls through to V1 base prompt otherwise.
  const adInsert = artDirection
    ? ` — ${artDirection.sceneDirection.trim().replace(/\.+$/, '')}, ${artDirection.moodAnchor.trim().replace(/\.+$/, '')}`
    : '';

  // V1.2 preservation reinforcement. Added when art direction is present —
  // explicitly tells Pro the product is identical to the reference, only
  // the scene varies. Fixes the Monster (white → black) identity drift and
  // multi-piece set drops (jewellery earrings missing).
  const preservationRule = artDirection
    ? ' The product is shown EXACTLY as in the reference image — same color, same logo, same packaging variant, same shape, same details. If the reference shows multiple pieces, ALL pieces must be visible in the output. Any creative interpretation applies only to the scene around the product, never to the product itself.'
    : '';

  // with_model uses different phrasing ("with a model"), not "in X style".
  // Indian default, dropped if the user gives any instruction. "Naturally
  // holding or using the product" nudges the model to show interaction
  // (hand on product, using it, wearing it) rather than standing next to it —
  // the key difference between AI Studio's winning output and earlier builds
  // where the model just posed in the background.
  if (style === 'style_with_model') {
    if (extra) {
      return `Generate an ad for me for this product with a model naturally holding or using the product${adInsert}${AD_QUALIFIER}. ${extra}.${categoryNudge}${preservationRule}${textRule}${aspectRule}`;
    }
    return `Generate an ad for me for this product with an Indian model naturally holding or using the product${adInsert}${AD_QUALIFIER}.${categoryNudge}${preservationRule}${textRule}${aspectRule}`;
  }

  // Autmn Special is the creative wildcard — explicit ask for art-directed,
  // unexpected, magazine-cover-worthy compositions. Different sentence
  // structure from the other styles since "autmn special" isn't a style
  // name Gemini would interpret meaningfully on its own.
  if (style === 'style_autmn_special') {
    const base = `Generate a striking, art-directed, magazine-cover-worthy ad for me for this product — the composition should be bold and unexpected, but the product itself stays exactly as shown in the reference`;
    // For Autmn Special, the art-direction (when present) replaces the
    // generic "bold and unexpected" with a specific creative scene.
    const wildcardBase = artDirection
      ? `Generate a striking, art-directed, magazine-cover-worthy ad for me for this product — ${artDirection.sceneDirection.trim().replace(/\.+$/, '')}, ${artDirection.moodAnchor.trim().replace(/\.+$/, '')}. The product itself stays exactly as shown in the reference`
      : base;
    if (extra) {
      return `${wildcardBase}. ${extra}.${categoryNudge}${preservationRule}${textRule}${aspectRule}`;
    }
    return `${wildcardBase}.${categoryNudge}${preservationRule}${textRule}${aspectRule}`;
  }

  // All other styles follow: "Generate an ad for me for this product in
  // <style> style[ — <sceneDirection>, <moodAnchor>][, <staticMood>]
  //  for a premium, head-turning ad campaign."
  // When art direction is present, it REPLACES the static creative mood.
  const base = (() => {
    switch (style) {
      case 'style_clean_white':    return `Generate an ad for me for this product in clean white studio style`;
      case 'style_lifestyle':      return `Generate an ad for me for this product in lifestyle style`;
      case 'style_gradient':       return `Generate an ad for me for this product in dark luxury style`;
      case 'style_outdoor':        return `Generate an ad for me for this product in outdoor style`;
      case 'style_studio':         return `Generate an ad for me for this product in colored studio style`;
      case 'style_festive':        return `Generate an ad for me for this product in festive Indian style`;
      case 'style_minimal':        return `Generate an ad for me for this product in minimal style`;
      default:                     return `Generate an ad for me for this product`;
    }
  })();

  // Static creative mood is used ONLY when art direction isn't provided.
  // (Art direction's moodAnchor supersedes the static mood.)
  const creativeMood = artDirection ? '' : getStyleCreativeMood(style);

  if (extra) {
    return `${base}${adInsert}${creativeMood}${AD_QUALIFIER}. ${extra}.${categoryNudge}${preservationRule}${textRule}${aspectRule}`;
  }
  return `${base}${adInsert}${creativeMood}${AD_QUALIFIER}.${categoryNudge}${preservationRule}${textRule}${aspectRule}`;
}
