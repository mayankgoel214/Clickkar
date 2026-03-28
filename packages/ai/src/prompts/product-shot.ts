/**
 * Scene prompt builder for Bria Product Shot API.
 * Maps style IDs + product categories to descriptive scene prompts.
 */

type StyleId =
  | 'clean_white'
  | 'warm_lifestyle'
  | 'gradient_minimal'
  | 'festival'
  | 'marble_premium'
  | 'outdoor_bokeh'
  | 'flat_lay';

type ProductCategory =
  | 'food'
  | 'jewellery'
  | 'garment'
  | 'skincare'
  | 'candle'
  | 'bag'
  | 'home_goods'
  | 'other';

/** Base scene descriptions indexed by style ID */
const BASE_SCENES: Record<StyleId, string> = {
  clean_white:
    'Clean white studio background with soft diffused lighting and subtle shadow',

  warm_lifestyle:
    'Warm wooden table surface, golden hour lighting, cozy lifestyle setting',

  gradient_minimal:
    'Dark charcoal to black gradient background, soft rim light from the side, luxury minimal aesthetic, high contrast',

  festival:
    'Festive Indian celebration setting, warm gold and orange tones, marigold flowers, diya lamps in background, rich textured surface, bokeh lights, festive warmth',

  marble_premium:
    'White Carrara marble surface, soft diffused studio lighting, luxury cosmetics photography style, subtle reflection on marble',

  outdoor_bokeh:
    'Natural outdoor setting, blurred lush green foliage background, bright natural daylight, fresh and vibrant',

  flat_lay:
    'Top-down flat lay photography on a styled surface, even overhead lighting, clean composition',
};

/** Category-specific overrides for certain styles */
const CATEGORY_OVERRIDES: Partial<
  Record<StyleId, Partial<Record<ProductCategory, string>>>
> = {
  warm_lifestyle: {
    food: 'Rustic kitchen setting, warm wooden cutting board surface, golden hour side lighting, cozy home cooking atmosphere',
    skincare:
      'Spa-like marble surface, soft morning light, white linen and green botanical accents, clean luxury lifestyle',
    candle:
      'Warm ambient setting, wooden surface, soft glowing light that complements the candle, cozy evening atmosphere',
  },
  flat_lay: {
    food: 'Top-down flat lay on a clean white ceramic surface with minimal props, even overhead lighting',
    garment:
      'Top-down flat lay on a clean light-colored textured fabric surface, styled composition',
    jewellery:
      'Top-down flat lay on a dark velvet surface, dramatic overhead lighting to highlight metal and gemstones',
    skincare:
      'Top-down flat lay on a white marble surface with subtle botanical props, spa aesthetic',
    bag: 'Top-down flat lay on a neutral linen surface showing the bag open slightly, structured composition',
    home_goods:
      'Top-down flat lay on a clean surface with complementary lifestyle props, styled home aesthetic',
  },
  marble_premium: {
    jewellery:
      'Dark black marble surface with subtle veining, dramatic side lighting, luxury jewellery photography style, high-end retail aesthetic',
  },
  festival: {
    food: 'Festive Indian celebration setting, warm gold and orange tones, brass thali and traditional accessories, marigold flowers, rich festive surface',
    garment:
      'Festive Indian celebration setting, warm gold tones, embroidered fabric surface, traditional Indian festive atmosphere, marigold accents',
  },
};

/**
 * Build a Bria Product Shot scene description.
 *
 * @param style          - One of the supported style IDs
 * @param productCategory - Detected or declared product category
 * @param voiceInstructions - Optional user-supplied instructions appended verbatim
 * @returns              Complete scene prompt string for the API
 */
export function buildScenePrompt(
  style: string,
  productCategory: string,
  voiceInstructions?: string
): string {
  const safeStyle = (
    Object.keys(BASE_SCENES).includes(style) ? style : 'clean_white'
  ) as StyleId;

  const safeCategory = (
    [
      'food',
      'jewellery',
      'garment',
      'skincare',
      'candle',
      'bag',
      'home_goods',
      'other',
    ].includes(productCategory)
      ? productCategory
      : 'other'
  ) as ProductCategory;

  // Check for a category-specific override first
  const override = CATEGORY_OVERRIDES[safeStyle]?.[safeCategory];
  let prompt = override ?? BASE_SCENES[safeStyle];

  // Append voice instructions if provided
  if (voiceInstructions && voiceInstructions.trim().length > 0) {
    prompt = `${prompt}. Additional instructions: ${voiceInstructions.trim()}`;
  }

  return prompt;
}

export type { StyleId, ProductCategory };
