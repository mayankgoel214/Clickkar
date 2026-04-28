/**
 * Composition library — concrete scene starters per style (Phase A, 2026-04-22).
 *
 * For each of the 9 styles we maintain ~8 concrete composition variants.
 * When the Art Director builds a creative brief, it receives ONE random
 * variant as a "starting composition suggestion" to seed around.
 *
 * Why this matters: without variety seeds, the Art Director tends toward the
 * same modal output for a given (style, product category) pair every time.
 * A random composition seed pushes different scenes on different runs while
 * keeping all variants within the style's visual vocabulary.
 *
 * These are intentionally specific and photographic — they name surfaces,
 * lighting positions, props, and compositional elements. The Art Director
 * then adapts the seed to THIS product.
 */

/**
 * Each style has a pool of composition seeds. The Art Director picks one
 * randomly per generation and adapts it to the product.
 *
 * Design notes:
 * - 5-8 variants per style — enough variety, not so many they overlap
 * - Photographic language only — surfaces, lens, lighting, not vibes
 * - NO product-specific references ("a bottle on a bar") — Art Director
 *   adapts for product. These are SCENE seeds, not product placements.
 * - Wild Card (style_autmn_special) has the widest variety — by design
 */
export const COMPOSITION_SEEDS: Record<string, string[]> = {
  style_clean_white: [
    'Centered on a seamless white cyclorama, soft shadow pooling directly below, 50mm dead-centre eye-level',
    'Lower-third placement on pure white, negative space above, subtle floor reflection',
    'Slight front-three-quarter angle on a bright white sweep, minimal shadow, catalog-ready',
    'Top-down flat-lay on pure white with generous negative space around the product',
    'Isolated on white with a thin cast shadow, 50mm perfect front elevation',
    'White cyclorama with a gentle radial vignette pulling focus to the centre',
  ],

  style_studio: [
    'Saturated teal backdrop, product on a matching cube pedestal, one contextual prop in front',
    'Warm terracotta sweep, low camera angle, a single shadow cast diagonally across the frame',
    'Dusty rose paper backdrop, two relevant props floating in negative space beside the product',
    'Deep navy cyclorama, rim-lit from behind, 50mm front-three-quarter',
    'Mustard yellow wall, product on a minimal wooden block, symmetrical flanking props',
    'Forest-green backdrop, spotlight from upper-left creating a clean ellipse of focus',
    'Burgundy velvet drape behind the product, warm spotlight centred on the product itself',
    'Pale sage wall with a single colour-matched pedestal, soft even key, editorial minimal',
  ],

  style_gradient: [
    'Polished black marble surface with a distant out-of-focus velvet drape, warm amber pool light on the product',
    'Wet dark asphalt, neon bokeh glow reflecting in puddles, rim light cutting across the top',
    'Obsidian shelf in a dim gallery interior, single tungsten spotlight from upper-right at 3000K',
    'Mirrored black lacquer tabletop with a perfect reflection of the product, subtle brass accents visible in bokeh',
    'Dark leather bench in a hushed hotel lobby, single pool of warm light from a hanging fixture',
    'Black volcanic rock with thin drifting haze at the base backlit by cool 5500K rim',
    'Deep burgundy silk gathered into folds behind the product, single soft key light camera-left',
    'Polished concrete podium in a cavernous dark room, dramatic Rembrandt-style side lighting',
  ],

  style_lifestyle: [
    'Warm oak kitchen counter by a sunlit window, a ceramic cup and a folded linen napkin just in frame',
    'Wooden cafe table, morning golden-hour light, a paperback and coffee in soft focus behind the product',
    'A modern desk with a small potted plant, leather notebook, and warm lamp glow from one side',
    'Living-room side table beside a textured throw, soft natural light from a large window',
    'Marble kitchen island with a dish towel and a small bowl of fruit in shallow-focus background',
    'Reclaimed wood breakfast bar, morning light spilling from stage-left, a cup of tea out of focus',
    'Linen-covered side table in a sunlit bedroom, a stack of magazines softly out of focus nearby',
    'Cozy window-seat scene, blanket crumpled nearby, soft backlight filtered through sheer curtains',
  ],

  style_outdoor: [
    'Forest clearing at golden hour, soft shafts of light through trees, product on a moss-covered rock',
    'Urban rooftop at sunset with a blurred city skyline, warm side-light from the setting sun',
    'Wooden park bench under an autumn tree, leaves scattered nearby, dappled 4000K light',
    'Pebbled beach at low tide, soft waves softly out of focus behind the product, overcast cool daylight',
    'Mountain-top flat rock with a hazy valley visible in bokeh behind, cool blue-hour light',
    'Desert landscape at dawn, amber sand and long shadows, product on a single weathered stone',
    'Garden path with moss and dappled shade, summer afternoon light, soft environmental framing',
    'Cliffside at dusk with a dramatic layered skyline, long shadows cast across a flat surface',
  ],

  style_festive: [
    'Scattered marigold petals on a brass tray, diyas glowing warm at the edges of frame, 2700K golden light',
    'Red silk backdrop with gold zari embroidery, a brass thali beside the product, warm candle glow',
    'Dark wooden table with a rangoli pattern visible in bokeh below, a single diya flame lighting the scene',
    'Mandala-patterned cloth with scattered rose petals, brass jug out of focus, warm low tungsten light',
    'Ornate brass tray with flower garlands encircling the product, soft glow from a nearby oil lamp',
    'Deep emerald backdrop with gold accents and small brass bells along the top edge, warm rim light',
    'Polished copper surface with scattered saffron strands and a small diya flickering nearby',
    'Royal blue silk with gold trim, scattered sequins catching warm light, festive and intimate',
  ],

  style_minimal: [
    'Pale cream room with a single soft shadow diagonal, nothing but product and vast negative space',
    'Muted sage wall with a thin horizontal line at waist height, product at lower-third intersection',
    'Dusty pink surface with one perfectly-round geometric element in the background, soft even light',
    'Bone-white stage with a single cast shadow stretching beyond the frame, architectural stillness',
    'Pale grey cyclorama with a delicate arching curve in the top half, monochrome restraint',
    'Cream-on-cream with a subtle concrete-textured pedestal, 5000K neutral, no other elements',
    'Off-white with a single crisp rectangular shadow in the lower-right corner, product at upper-third',
    'Soft lavender background with one minimalist vertical line element, generous empty space',
  ],

  style_with_model: [
    'Natural-light portrait in a sunlit kitchen, model holding product at chest-level looking at camera',
    'Cafe window-seat, model casually using the product mid-motion, warm morning light from the side',
    'Home office scene, model at a desk interacting with the product, soft diffused daylight',
    'Outdoor park bench, model relaxed with the product in their lap, golden-hour backlight',
    'Bedroom mirror scene, model standing casually with the product, soft bouncing daylight',
    'Studio portrait on neutral backdrop, model in clean casual clothing holding product at chest level',
    'Stylish living room couch, model lounging with the product, warm lamp-light from camera-left',
    'Intimate close-up of hands only interacting with the product, shallow DOF, soft warm light',
  ],

  // Wild Card — intentionally varied, pushing toward the unexpected.
  // Art Director riffs on these to produce memorable Instagram-stopping compositions.
  style_autmn_special: [
    'Suspended mid-air with motion-frozen water splashing around it, dark deep-indigo void background',
    'Floating above a crumpled silk scarf that ripples out toward the frame edges, one dramatic side-light',
    'On a mossy stone in an overgrown glade, sunbeams breaking through in a cinematic light shaft',
    'Centre of a perfect powder-burst cloud of colour, caught mid-moment against a dark backdrop',
    'Positioned on a mirrored surface so it appears to float above its own reflection, minimalist void around',
    'On a small ice block actively melting, droplets catching a single warm spotlight, dark studio backdrop',
    'Inside a tight overhead flat-lay surrounded by radial geometric negative space and one off-axis shadow',
    'On a thin concrete slab suspended in black void, wisps of smoke drifting past, dramatic spotlight',
    'Wrapped in layered torn-paper strips that create abstract geometric forms around it, warm editorial light',
    'Centre of a shallow pool of still water, one concentric ripple emanating outward, cool moody lighting',
  ],
};

/**
 * Pick one composition seed at random for the given style.
 * Returns an empty string when no seeds are defined for that style
 * (caller should fall back to its own defaults).
 */
export function pickCompositionSeed(style: string): string {
  const pool = COMPOSITION_SEEDS[style];
  if (!pool || pool.length === 0) return '';
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Total composition count across all styles — useful for tests/logging.
 */
export function getLibrarySize(): { totalVariants: number; perStyle: Record<string, number> } {
  const perStyle: Record<string, number> = {};
  let totalVariants = 0;
  for (const [style, pool] of Object.entries(COMPOSITION_SEEDS)) {
    perStyle[style] = pool.length;
    totalVariants += pool.length;
  }
  return { totalVariants, perStyle };
}
