/**
 * V5 Style Prompts — Ad-referenced, Gemini-optimized.
 *
 * Strategy:
 * - 8 descriptive styles reference Gemini's ad training corpus per-style
 *   ("Reference the best [X] ads for this product type") so each style's
 *   creative direction draws from real-world campaign best-practice.
 * - Autmn Special is the exception: maximum creative permission with
 *   explicit product-preservation clause. No ad-research framing — the
 *   point of this style is Gemini-native creativity, not emulation.
 *
 * Design rules:
 * - ~10-15 words per prompt (Autmn Special is the exception — ~35 words to balance creative unlock + product anchor)
 * - No "advertisement" vocabulary in the 8 non-special styles (we use "product ads" specifically — that's scoped and doesn't trigger text overlays, whereas a generic "world-class advertisements" suffix did)
 * - No "Cannes Lions" / "award-winning" adjectives (caused product drift)
 * - Default suffix blocks AI-added taglines/captions/ad copy (but preserves
 *   the product's own printed text). Dropped when customer sends instructions.
 * - When a customer instruction is present, the prompt opens with the human-readable
 *   style name ("You are generating the 'With Model' style…") and tells Gemini to
 *   apply only the relevant parts — prevents per-style instructions bleeding across
 *   styles when the customer gives different directions for different styles.
 * - Let Gemini's i2i conditioning handle fidelity; prompts handle direction
 */

import type { LightAnalysis } from './light-analyzer.js';

/**
 * Builds the product descriptor string used in style prompts.
 *
 * For single items: "this Kinder Bueno White chocolate bar"
 * For multi-item sets: "this complete bridal jewelry set consisting of a Kundan Polki
 *   necklace with emerald drops, matching drop earrings, and a maang tika — all pieces
 *   shown together as a coherent set"
 *
 * This prevents Gemini from dropping pieces of multi-item products (e.g., missing the
 * maang tika when rendering a model wearing jewelry).
 */
function getProductDescriptor(analysis: LightAnalysis): string {
  if (analysis.itemCount > 1 && analysis.items.length > 1) {
    const itemList = analysis.items.join(', ');
    const setType = analysis.setDescription ?? `${analysis.items.length}-piece set`;
    return `this complete ${setType} consisting of ${itemList} — all pieces shown together as a coherent set`;
  }
  return `this ${analysis.productName}`;
}

/**
 * Human-readable style name for inclusion in Gemini prompts when
 * customers send per-style instructions.
 */
function getStyleDisplayName(style: string): string {
  switch (style) {
    case 'style_clean_white':    return 'Clean White';
    case 'style_studio':         return 'Colored Studio';
    case 'style_gradient':       return 'Gradient';
    case 'style_lifestyle':      return 'Lifestyle';
    case 'style_outdoor':        return 'Outdoor';
    case 'style_festive':        return 'Festive';
    case 'style_minimal':        return 'Minimal';
    case 'style_with_model':     return 'With Model';
    // Renamed internally to avoid Gemini misreading "Autmn" as "Autumn" (the season).
    // Users still see "Autmn Special" in WhatsApp — that comes from packages/session/src/messages.ts styleDisplayName, which is unchanged.
    case 'style_autmn_special':  return 'Creative Signature';
    default:                     return 'Professional';
  }
}

/**
 * Generate the prompt sent to Gemini for image generation.
 */
export function getStylePromptV5(
  style: string,
  _track: 'COMPOSITE' | 'DIRECT',
  analysis: LightAnalysis,
  userInstructions?: string,
): string {
  const scene = getSceneDescription(style, analysis);

  // Display-method hint — applies to all styles EXCEPT style_with_model.
  // In with_model, the model's body IS the display, so this would conflict.
  // For every other style (including autmn_special), we nudge Gemini to use
  // the conventional professional presentation for the product's category.
  // Examples are illustrative not prescriptive — Gemini picks the best fit.
  const displayHint = style === 'style_with_model'
    ? ''
    : ' Display the product using the conventional professional presentation method for this product type (for example: jewelry on a velvet bust or tray, garments on a mannequin or hanger, watches on a display stand, shoes paired on a stand, skincare bottles standing and grouped, beverage cans and bottles standing upright). The product is presented from its most recognizable angle with the brand label, logo, or front-facing side clearly visible to the camera, framed as it would appear in a professional advertisement. The product itself must appear clean, intact, and professionally presented. Any creative interpretation applies to the setting, lighting, and composition around the product — not to the product itself.';

  // Identity preservation anchor — Phase 1 (2026-04-20).
  // Proven pattern from Google DeepMind's prompting guide for Gemini 3 Pro Image:
  // explicit "exactly the same as Image 1" language anchors product fidelity more
  // reliably than atmospheric vocabulary or generic "product is preserved" clauses.
  // Placed near the end of the prompt for strong recency effect.
  const preservationAnchor = ' Preservation: the product shown must be exactly the same as reference image 1 — same colors, same logo position, same material finish, same proportions, same physical details. Any creative interpretation applies to the scene around the product, never to the product itself.';

  if (userInstructions?.trim()) {
    // Customer instruction present — trust the customer to drive decisions.
    // Display hint still included: professional default. Customer note comes
    // AFTER the hint, so any specific display instructions they gave will win.
    const note = userInstructions.trim();
    const styleName = getStyleDisplayName(style);
    return `You are generating the "${styleName}" style. ${scene}${displayHint} Customer note: "${note}". Apply the parts of this note relevant to the "${styleName}" style.${preservationAnchor} Square 1:1.`;
  }

  // No customer instruction — scope text to the product's own branding only.
  // Positive framing: tell Gemini what text SHOULD be there, not what shouldn't.
  return `${scene}${displayHint} The only text visible in the image is the text already printed on the product itself.${preservationAnchor} Square 1:1.`;
}

function getSceneDescription(style: string, analysis: LightAnalysis): string {
  const product = getProductDescriptor(analysis);
  switch (style) {
    case 'style_clean_white':
      return `A professional product advertisement for ${product} on a clean white studio background. A clean white studio has bright even lighting, a seamless white backdrop, and minimal elements — the product is shown clearly and attractively. Think about how to position, angle, and light this specific product to look its absolute best in a white studio setting. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    case 'style_studio':
      return `A professional product advertisement for ${product} on a bold colored studio backdrop with contextual props. This style uses a vivid color as the backdrop and includes props or elements relevant to the product — props that tell its story or complement its use. Think about what color and which props would make this specific product shine. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    case 'style_gradient':
      return `A professional dark-luxury product advertisement for ${product}. Dark-luxury ads are cinematic and theatrical — rich with swirling smoke, drifting light particles, atmospheric haze, reflective wet surfaces, dramatic rim lighting cutting across the scene, and layered depth with distinct foreground, midground, and background elements. Think about what specifically luxurious environment best showcases this product — a scene that feels like a premium magazine campaign, not a simple product-on-stand shot. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    case 'style_lifestyle':
      return `A professional lifestyle product advertisement for ${product}. Lifestyle advertising places the product in a warm real-world setting where it naturally belongs. Think about the environment and moments where this specific product actually lives, and show it there authentically. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    case 'style_outdoor':
      return `A professional outdoor product advertisement for ${product} in a natural setting. Outdoor advertising uses golden-hour light and the natural environment to frame the product. Think about what outdoor setting makes sense for this specific product and show it in the most compelling way. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    case 'style_festive':
      return `A professional Indian festive product advertisement for ${product}. An Indian festive scene celebrates warmth, celebration, and tradition — think about what festive elements would complement THIS specific product authentically. Place the product prominently in the scene with festive decorations arranged around and beside it, enhancing the product through its surrounding environment. The product itself stays as it is while the environment celebrates around it. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    case 'style_minimal':
      return `A professional minimalist product advertisement for ${product}. Minimalism uses vast negative space, precise placement, and restraint to highlight the product. Think about how to place and light this specific product for maximum impact. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    case 'style_with_model':
      return `A professional lifestyle product advertisement featuring a person naturally using, wearing, or interacting with ${product}. The product remains clearly visible as the focus of the shot. Think about how a real person would authentically use this product and capture that moment. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    case 'style_autmn_special':
      return `Create a genuinely unexpected, striking creative advertisement for ${product}. The style doesn't matter here — only the product does. Think about the most creative and memorable way to represent this specific product, whatever form that takes. The creative direction should feel authentically connected to what this product is, does, or culturally represents — unexpected but rooted in the product's real identity, not thematically random. Push for real setting, narrative, and unexpected composition. The product appears exactly as it is. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;

    default:
      return `A professional product advertisement for ${product}. Create the best advertisement for this particular product, making sure the ad is relevant to this specific product.`;
  }
}
