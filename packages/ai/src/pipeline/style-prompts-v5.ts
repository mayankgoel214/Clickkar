/**
 * Beta-mode prompt builder — the only prompt path used in production.
 *
 * History: this file used to also export the SCHEMA-structured
 * `getStylePromptV5` (300+ char per style with photographic vocabulary,
 * preservation anchors, and display hints) and `buildSkinnyPrompt`
 * (one-liner control test). Both belonged to the V5 over-generation
 * pipeline that was archived on 2026-04-23. Production now uses only
 * the Beta prompt — ultra-minimal, no preservation anchors, no aspect
 * forcing in scene description (aspect is appended here as `1:1 square`).
 *
 * Beta won the comparison: simpler prompts produced more reliable output
 * because Pro's natural priors weren't being fought by elaborate constraints.
 */

/**
 * Beta prompt — ultra-minimal one-liner per style.
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
 * Signature keeps `productName` for call-site compatibility but ignores it.
 */
export function buildBetaPrompt(
  style: string,
  _productName: string,
  userInstructions?: string,
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

  // with_model uses different phrasing ("with a model"), not "in X style".
  // Indian default, dropped if the user gives any instruction. "Naturally
  // holding or using the product" nudges the model to show interaction
  // (hand on product, using it, wearing it) rather than standing next to it —
  // the key difference between AI Studio's winning output and earlier builds
  // where the model just posed in the background.
  if (style === 'style_with_model') {
    if (extra) return `Generate an ad for me for this product with a model naturally holding or using the product. ${extra}.${textRule}${aspectRule}`;
    return `Generate an ad for me for this product with an Indian model naturally holding or using the product.${textRule}${aspectRule}`;
  }

  // All other styles follow the pattern: "Generate an ad for me for this
  // product in <style> style". No adjectives — let the model interpret the
  // style name from its own priors. Only Autmn Special keeps a tiny
  // descriptor since "autmn special" isn't a real style name Gemini knows.
  const base = (() => {
    switch (style) {
      case 'style_clean_white':    return `Generate an ad for me for this product in clean white studio style`;
      case 'style_lifestyle':      return `Generate an ad for me for this product in lifestyle style`;
      case 'style_autmn_special':  return `Generate a creative, editorial ad for me for this product`;
      case 'style_gradient':       return `Generate an ad for me for this product in dark luxury style`;
      case 'style_outdoor':        return `Generate an ad for me for this product in outdoor style`;
      case 'style_studio':         return `Generate an ad for me for this product in colored studio style`;
      case 'style_festive':        return `Generate an ad for me for this product in festive Indian style`;
      case 'style_minimal':        return `Generate an ad for me for this product in minimal style`;
      default:                     return `Generate an ad for me for this product`;
    }
  })();

  return extra ? `${base}. ${extra}.${textRule}${aspectRule}` : `${base}.${textRule}${aspectRule}`;
}
