/**
 * V5 Style Prompts — SCHEMA-structured photographic prompts (Phase 2, 2026-04-20).
 *
 * Rewritten based on Gemini 3 Pro Image best-practice research (DeepMind
 * prompt guide, Google Cloud prompt guide, SCHEMA methodology paper Feb 2026):
 *
 * - **Photographic vocabulary, not atmospheric.** Gemini 3 Pro responds to
 *   "50mm lens, f/1.8 shallow DOF, 3200K warm light" the way a cinematographer
 *   briefing would interpret it — concrete visual behavior. Atmospheric words
 *   like "swirling smoke, drifting particles" in V1 made the model either
 *   ignore them or over-apply them to the product itself (gold trim, glow).
 * - **Concrete composition rules.** "Product centered at lower-third, 50mm
 *   eye-level" is enforceable; "think about how to position the product"
 *   is not. The V1 meta-prompting was what let Gemini freestyle on Autmn
 *   Special (stone slab on temple pedestal).
 * - **SCHEMA structure:** Subject → Environment → Composition → Lighting →
 *   Mood → Technical. Scene description covers Environment + Composition +
 *   Lighting + Mood. Subject is the product (from lightAnalyze). Technical
 *   defaults to photorealistic commercial. Preservation anchor (Phase 1)
 *   covers the constraint layer.
 * - **Positive framing only.** No "don't do X" — instead describe what
 *   we DO want. Gemini respects affirmative constraints much more reliably
 *   than negations (the pink-elephant effect applies even at Pro tier).
 * - **Concrete creative latitude, not philosophical freedom.** Autmn Special
 *   gives three explicit composition options the model picks between,
 *   rather than telling it "style doesn't matter."
 *
 * Size: ~300-500 chars per scene (vs V1 800-1500 chars). Total prompt
 * (scene + displayHint + preservation anchor + aspect) stays under the
 * 65,536 token input limit with huge margin.
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

// ---------------------------------------------------------------------------
// Scene descriptions — SCHEMA-structured photographic prompts (Phase 2).
//
// Rewritten 2026-04-20 per Gemini 3 Pro Image prompting best practices:
// - Photographic vocabulary (camera, lens, lighting, color temp) not atmospheric
//   ("swirling smoke, drifting particles" → "volumetric haze backlit by a rim
//   light at 3200K")
// - Concrete compositional rules instead of "think about..." meta-prompting
// - Structure: Subject → Environment → Composition → Lighting → Mood →
//   Technical. Scene description handles Environment + Composition + Lighting +
//   Mood; Subject is the product (handled via analysis); Technical is the
//   "Photographic quality" line appended by the caller; Preservation constraint
//   is the anchor appended at end of prompt.
// - Each scene description targets ~300 chars vs the 800-1500 char originals.
// - No "create the best advertisement for this product" filler — we already
//   said we want a professional ad.
// ---------------------------------------------------------------------------

function getSceneDescription(style: string, analysis: LightAnalysis): string {
  const product = getProductDescriptor(analysis);
  switch (style) {
    case 'style_clean_white':
      // Clean, commercial catalog shot. No creative latitude — just the product
      // perfectly lit on white. The style WhatsApp users pick when they want
      // "just a clean shot" for an e-commerce listing.
      return `A professional commercial product photograph of ${product} on a seamless pure-white cyclorama studio background. Composition: product centered, occupying the middle third of the frame, shot at 50mm eye-level with a slight front-three-quarter angle showing the most recognizable face. Lighting: large softbox key light from front-left + softbox fill from front-right, balanced so shadows are soft and minimal, color temperature 5500K neutral daylight. Mood: clean, precise, catalog-ready.`;

    case 'style_studio':
      // Bold colored backdrop with intentional props. Not "think about color"
      // — tell Gemini to PICK a saturated color that contrasts with the
      // product and add 1-2 props that directly relate to the product's use.
      return `A professional editorial product photograph of ${product} on a single-color cyclorama backdrop in a saturated hue that contrasts cleanly with the product (examples: deep teal, terracotta, mustard yellow, dusty rose — pick one that flatters this specific product's colors). Composition: product as hero at the lower-center, with 1-2 props directly related to the product's use placed in the negative space around it (not on top of it), shot at 50mm eye-level. Lighting: single key light at 45° from upper-left creating a defined soft shadow, the backdrop is separately lit to saturate the color. Mood: bold, confident, editorial.`;

    case 'style_gradient':
      // Dark luxury — replace "swirling smoke, atmospheric haze" vocab with
      // concrete scene elements. Gemini 3 Pro responds to camera/lens/light
      // specifics like "briefing a cinematographer" per DeepMind's guide.
      return `A cinematic dark-luxury product photograph of ${product} on a black polished marble or lacquered wood surface in a darkened high-end interior, with out-of-focus deep velvet furniture and brass accents visible in the background bokeh. Composition: product centered at lower third, shot at 85mm with a shallow f/1.8 depth of field, slight low angle showing the top face. Lighting: single overhead key light creating a pool of warm 3000K amber illumination on the product, subtle rim light catching the top edge, a thin layer of volumetric haze backlit by the rim light for atmosphere. Mood: cinematic, editorial, hushed, luxurious. Style reference: premium magazine campaign photograph.`;

    case 'style_lifestyle':
      // Already-good style. Made the scene anchor concrete: "home or cafe
      // setting that matches the product's natural use context." Removed
      // "think about..." meta-prompting.
      return `A warm lifestyle product photograph of ${product} placed naturally in a real-world setting where this product is actually used (a home living space, kitchen counter, desk, or cafe table — pick the context that matches this specific product's use). Composition: product in natural placement (either centered or in rule-of-thirds lower-left), with 2-3 lived-in contextual items visible around it (books, mug, blanket, plants, notebook, etc. — appropriate to the setting), shot at 50mm eye-level with shallow f/2.8 depth of field. Lighting: warm golden-hour sun filtered through a window from the side at 3200K, gentle long shadows, soft natural fill. Mood: warm, lived-in, authentic.`;

    case 'style_outdoor':
      // Concrete "pick an outdoor scene that matches product" — not
      // philosophical framing. Uses "golden hour" + specific time cues.
      return `A natural outdoor product photograph of ${product} placed in an outdoor setting appropriate to this product's use context (urban sidewalk, park bench, beach, forest clearing, rooftop — pick the context that fits this specific product). Composition: product as the clear hero of the frame, positioned in rule-of-thirds, shot at 35mm for environmental context with f/4 depth of field keeping both product and background readable, eye-level. Lighting: golden-hour sun at 4000K, low-angle warm light creating long soft shadows, natural ambient fill from the sky. Mood: organic, natural, authentic.`;

    case 'style_festive':
      // Indian festive. Concrete elements: diyas, marigolds, gold trim
      // fabrics, rangoli — pick based on product. Elements around, not on
      // the product.
      return `A warm Indian festive product photograph of ${product} placed as the centerpiece of a celebration scene, with 2-3 traditional festive elements arranged around it — choose elements that suit this specific product (diyas with soft flame glow, strands of marigold flowers, gold-trimmed silk fabric, rangoli pattern, brass pooja items, or scattered rose petals). Composition: product prominently centered, festive elements in the foreground and midground creating depth, shot at 50mm eye-level with shallow f/2.8 DOF. Lighting: warm 2700K golden diya light as the key source from below-front, subtle rim light from behind, rich warm color temperature throughout. Mood: celebratory, traditional, intimate, warm.`;

    case 'style_minimal':
      // Architectural minimalism. Negative space made concrete: "product at
      // 1/3, empty space at 2/3, one geometric element."
      return `A minimalist product photograph of ${product} in an empty pastel or neutral solid-color environment (choose a muted color that flatters the product — cream, dusty pink, sage, pale blue, bone white). Composition: product placed in one third of the frame with two-thirds intentional empty space, optionally one simple geometric architectural element nearby (a pedestal, a cast shadow line, a color block, a single organic curve), shot at 50mm with a clean eye-level or slightly low angle. Lighting: single large softbox key from 90° providing even soft illumination at 5000K neutral, minimal contrast, gentle soft shadow. Mood: calm, architectural, restrained, thoughtful.`;

    case 'style_with_model':
      // Model with product — concrete: "single person, hands visible, natural
      // interaction, product in clear focus." Diverse but South Asian default
      // for Indian market.
      return `A lifestyle product photograph featuring a single person naturally using, wearing, or holding ${product}. Composition: the person occupies roughly the upper two-thirds of the frame with the product clearly visible and in sharp focus as the hero of the shot, shot at 50mm eye-level with f/2.8 shallow depth of field separating subject from background. Subject: a genuine candid moment of the person engaging with the product (using it, wearing it, looking at it, or simply holding it casually) — warm, authentic, unposed feeling. Setting: match the product's natural use context (home, cafe, outdoor, street). Lighting: soft natural daylight at 3500K from a side window or open shade, warm skin tones, subtle fill. Mood: relatable, authentic, in-the-moment.`;

    case 'style_autmn_special':
      // Creative Signature (shown to user as "Autmn Special"). This is the
      // style that produced the "stone slab on temple pedestal" failure on
      // Nano Banana. Fixed by giving concrete compositional options instead
      // of "style doesn't matter."
      //
      // Pick ONE of these compositions based on what best fits the product —
      // all three are real ad-production compositions that preserve product
      // while creating an unexpected memorable image. The model chooses.
      return `A striking creative commercial product photograph of ${product} — choose ONE of the following unexpected but photorealistic compositions that best suits this specific product:
(A) The product suspended in mid-air with motion-frozen scattered thematic elements around it (water splashes, petals, powder, steam, confetti — match the element to the product's category);
(B) The product placed on an unusual surface that contrasts with its category (a crumpled silk scarf, a block of ice, a mossy rock, a folded linen cloth, a mirrored surface, a bed of dried leaves);
(C) The product as the hero of a stylized frozen-moment scene (a single dramatic splash, a falling sequence caught mid-air, a tight overhead flat-lay with geometric negative space).
Composition: product as the unambiguous hero, centered or in a deliberate rule-of-thirds placement, shot at 50mm or 85mm with selective depth of field. Lighting: single theatrical key light at a deliberate angle with one rim or fill for depth, color temperature chosen to flatter the product. Mood: unexpected, memorable, high-craft, editorial.`;

    default:
      return `A professional commercial product photograph of ${product}. Composition: product centered, shot at 50mm eye-level. Lighting: soft studio key light with balanced fill at 5000K neutral. Mood: clean, commercial.`;
  }
}
