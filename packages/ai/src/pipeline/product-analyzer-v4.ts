import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';
import { analyzeAndPlanV3 } from './product-analyzer-v3.js';

// ---------------------------------------------------------------------------
// V4 Schema — merges multi-angle-analyzer + V3 into a single Gemini call
// ---------------------------------------------------------------------------

export const ProductProfileV4Schema = z.object({
  // === INPUT QA ===
  usable: z.boolean(),
  rejectionReason: z.string().nullable(),

  // === PRIMARY IMAGE ===
  primaryImageIndex: z.number().int().min(0),
  primaryImageReason: z.string(),

  // === PRODUCT IDENTIFICATION ===
  productName: z.string(),
  brandName: z.string().nullable(),
  productType: z.string(),
  specificDescription: z.string(),
  productCategory: z.string().transform(v => {
    const valid = ['food', 'jewellery', 'garment', 'skincare', 'candle', 'bag', 'home_goods', 'electronics', 'handicraft', 'other'] as const;
    return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'other';
  }),

  // === PHYSICAL CHARACTERISTICS ===
  dominantColors: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : [v],
  ).catch([]),
  material: z.string(),
  shape: z.string(),
  keyVisualElements: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : [v],
  ).catch([]),
  productComponents: z.union([z.array(z.string()), z.string()])
    .transform(v => (Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v]))
    .catch([]),
  visibleText: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v],
  ).catch([]),
  productPhysicalSize: z.string().transform(v => {
    const valid = ['tiny', 'small', 'medium', 'large'] as const;
    return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'medium';
  }).catch('medium'),
  productDimensionality: z.string().transform(v => {
    const valid = ['flat_2d', 'shallow_3d', 'deep_3d'] as const;
    return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'shallow_3d';
  }).catch('shallow_3d'),
  recommendedCanvasFill: z.number().catch(0.65).transform(v => Math.max(0.3, Math.min(0.95, v))),
  isTransparent: z.boolean().catch(false),
  isColdBeverage: z.boolean().catch(false),

  // === BRANDING ===
  hasBranding: z.boolean(),
  brandingConfidence: z.number().catch(0.5).transform(v => Math.max(0, Math.min(1, v))),
  brandElements: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v],
  ).catch([]),

  // === COMPLETE BRANDING INVENTORY (from all angles) ===
  brandingInventory: z.array(z.object({
    text: z.string(),
    type: z.string().transform(v => {
      const valid = ['brand_name', 'tagline', 'ingredient', 'certification', 'weight', 'barcode', 'other'] as const;
      return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'other';
    }).catch('other'),
    prominence: z.string().transform(v => {
      const valid = ['dominant', 'secondary', 'small_print'] as const;
      return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'secondary';
    }).catch('secondary'),
  })).catch([]),

  // === REFERENCE IMAGE RANKING ===
  referenceImageRanking: z.array(z.object({
    index: z.number().int().min(0),
    valueScore: z.number().catch(5).transform(v => Math.max(0, Math.min(10, v))),
    uniqueInfo: z.string(),
  })).catch([]),

  // === MULTI-ANGLE INSIGHTS ===
  crossAngleInsights: z.string().catch(''),

  // === PER-ANGLE QUALITY ASSESSMENT ===
  angleQualities: z.array(z.object({
    index: z.number().int().min(0),
    quality: z.string().transform(v => {
      const valid = ['excellent', 'good', 'usable', 'poor'] as const;
      return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'usable';
    }),
    bestFor: z.string(),
  })).catch([]),

  // === PRODUCT USAGE CONTEXT ===
  servingTemperature: z.string().transform(v => {
    const valid = ['hot', 'cold', 'room_temperature', 'frozen', 'not_applicable'] as const;
    return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'not_applicable';
  }).catch('not_applicable'),
  consumptionMethod: z.string().catch(''),
  typicalSetting: z.string().catch(''),
  servingVessel: z.string().catch('not_applicable'),
  utensils: z.string().catch('not_applicable'),
  usageOccasion: z.string().catch(''),
  productState: z.string().catch('as_shown'),

  // === AUDIENCE & EMOTION ===
  targetAudience: z.string().catch(''),
  priceSegment: z.string().transform(v => {
    const valid = ['budget', 'mid_range', 'premium', 'luxury'] as const;
    return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'mid_range';
  }).catch('mid_range'),
  desiredEmotion: z.string().catch(''),

  // === CREATIVE DIRECTION ===
  heroMoment: z.string(),
  emotionalTrigger: z.string().transform(v => {
    const valid = ['craving', 'desire', 'energy', 'comfort', 'luxury', 'freshness', 'joy', 'confidence', 'warmth', 'power', 'serenity', 'excitement', 'nostalgia', 'sophistication', 'playfulness', 'wonder'] as const;
    return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'desire';
  }),
  storyScene: z.string(),
  creativeBrief: z.string(),
  dynamicElements: z.union([z.array(z.string()), z.string()]).transform(v =>
    Array.isArray(v) ? v : [v],
  ).catch([]),
  scenePrompt: z.string().catch(''),
  backgroundOnlyPrompt: z.string().catch(''),

  // === INPUT QUALITY ===
  hasGlare: z.boolean().catch(false),
  inputAngleQuality: z.string().transform(v => {
    const valid = ['good', 'suboptimal', 'unusable'] as const;
    return valid.includes(v as (typeof valid)[number]) ? (v as (typeof valid)[number]) : 'good';
  }).catch('good'),

  // === AD BEST PRACTICES ===
  adBestPractices: z.string().catch(''),
});

export type ProductProfileV4 = z.infer<typeof ProductProfileV4Schema>;

// ---------------------------------------------------------------------------
// Style Narrative Pools — REMOVED. Generic narrative pools produce repetitive,
// category-generic outputs. Gemini now thinks per-product (see buildV4Prompt).
// ---------------------------------------------------------------------------

/* STYLE_NARRATIVE_POOLS removed — replaced with product-specific creative thinking.
const STYLE_NARRATIVE_POOLS: Record<string, Record<string, string[]>> = {
  style_lifestyle: {
    food: [
      `CRAVING TRIGGER. Techniques: INGREDIENT SCATTER + CROSS-SECTION REVEAL + WARM CHIAROSCURO. Kitchen counter scene — product beside a glass of warm chai, crumbs scattered naturally, warm window backlight from behind creating a golden halo on the food. One unit broken open to reveal inside texture. Rustic wood surface with authentic wear marks. The mess IS the story — the viewer physically craves this.`,
      `PICNIC IDYLL. Techniques: OUTDOOR FLAT LAY + DAPPLED LIGHT + WOVEN TEXTURES. Product centered on a sun-bleached picnic blanket beside a woven basket. Dappled sunlight filtering through leaves creates dancing light patches. Fresh fruit, a linen napkin, a glass jar of lemonade as contextual props. Warm golden tones, shallow DOF blurring the grass beyond. The viewer wants to be at this picnic.`,
      `DINNER TABLE. Techniques: OVERHEAD COMPOSITION + WARM PENDANT GLOW + PLACE SETTING. Product on a ceramic plate as part of a restaurant table setting — cutlery flanking, a linen napkin folded beside, warm pendant lamp creating a focused pool of amber light from above. Dark wood table. The food looks like it was just served. Appetite-inducing warmth.`,
      `MORNING RITUAL. Techniques: TRAY COMPOSITION + LINEN TEXTURE + SOFT SIDE LIGHT. Product on a breakfast-in-bed tray — crumpled white linen sheets, a small ceramic cup of coffee, a folded newspaper corner. Soft morning light from the left window washing across the scene. Intimate, quiet, comforting. The viewer imagines lazy Sunday mornings.`,
      `MARKET FRESH. Techniques: RUSTIC DISPLAY + BUSY BOKEH + NATURAL ABUNDANCE. Product displayed on a wooden crate at a market stall, surrounded by fresh produce and hand-written price tags. Busy market activity dissolves into warm bokeh behind. Overhead canvas diffusing harsh sun. Authentic, abundant, alive with energy.`,
    ],
    default: [
      `COZY NOOK. Techniques: SHELF STYLING + WARM LAMP LIGHT + CONTEXTUAL PROPS. Product placed on a cozy home shelf or wooden nook, flanked by a small plant and a ceramic vase. Warm table lamp creating a focused amber glow from one side. Books stacked nearby. The viewer imagines this product on THEIR shelf.`,
      `WORKSPACE CURATED. Techniques: DESK SCENE + NATURAL WINDOW LIGHT + LIFESTYLE CONTEXT. Product on a curated workspace desk beside a ceramic coffee cup, a leather notebook, and a potted succulent. Natural window light from the side, 4000K. Shallow DOF blurring the monitor and wall art behind. Productive, aspirational energy.`,
      `MORNING COUNTER. Techniques: KITCHEN/BATHROOM CONTEXT + MORNING LIGHT + CASUAL PLACEMENT. Product placed casually on a marble kitchen counter or bathroom shelf beside contextual items (toothbrush holder, fruit bowl, soap dish). Soft morning light streaming from a window. The scene feels lived-in, real, relatable.`,
      `CAFE TABLE. Techniques: WARM AMBIANCE + BACKGROUND BOKEH + INTIMATE FRAMING. Product on a round cafe table, a latte with art beside it, warm pendant lamp overhead. The cafe interior dissolves into creamy warm bokeh behind — other patrons, shelves, hanging plants all softened. Intimate, inviting atmosphere.`,
      `BEDSIDE STYLING. Techniques: NIGHTSTAND SCENE + EVENING LAMP + COZY DEPTH. Product on a styled bedroom nightstand beside a stack of books, a small plant, and reading glasses. Warm evening lamp glow from behind the product creating a rim of amber light. Soft linen textures. The viewer wants this exact quiet evening.`,
    ],
    jewellery: [
      `VANITY MOMENT. The jewellery set arranged on a vintage brass vanity tray beside an ornate mirror. Warm lamp light spills from the left. A small perfume bottle and fresh flowers as props. The scene suggests a woman preparing for an evening out.`,
      `SILK AND GOLD. The jewellery draped across flowing silk fabric in deep jewel tones (burgundy, navy, or emerald). Natural window light creates soft highlights on the metal. One piece laid flat, others arranged as if just removed.`,
      `BRIDAL PREPARATION. The jewellery laid out on an embroidered cushion or pooja thali. Warm golden light from traditional brass lamps. Rose petals scattered nearby. The scene suggests auspicious preparation.`,
      `COLLECTOR'S DESK. The jewellery on a dark leather-topped desk beside a magnifying glass and soft cloth. Warm task light from an antique desk lamp. Scholarly, appreciative atmosphere — the jewellery as art object.`,
      `GIFT UNWRAPPED. The jewellery emerging from its velvet box, lid propped open, on a marble surface. Soft diffused light. A handwritten card or ribbon nearby. The moment of receiving something precious.`,
    ],
    beverage_cold: [
      `GYM COUNTER ENERGY. Techniques: HARSH GYM FLUORESCENT LIGHT + WORKOUT PROPS + CONDENSATION CLOSE-UP. The cold can sits on a gym counter on top of a folded gym towel, beside wireless earbuds and a chalk-dusted weight clip. Harsh overhead fluorescent creates cool-white rim highlights on the beaded condensation. Blurred barbells and cable machines in background bokeh. Cold, refreshing, high-energy — the reward after the grind.`,
      `SKATE RAMP EDGE. Techniques: AFTERNOON BACKLIGHT + URBAN CONCRETE + MOTION BLUR BACKGROUND. The can rests on the concrete edge of a skate ramp, catching afternoon sun from behind that creates a glowing rim on every condensation droplet. The blurred shapes of skaters mid-trick fill the background. Worn grip tape and chalk on the concrete below. Raw urban energy — cold, charged, alive.`,
      `ROOFTOP CITY VIEW. Techniques: GOLDEN HOUR BACKLIGHT + CITY BOKEH + COLD SWEAT DETAIL. The chilled can stands on a rooftop ledge with a warm golden hour sun behind it, creating a halo of light around the can. City skyline dissolves into golden bokeh behind. Frost rings on the ledge surface from where the cold can rested moments ago. Aspirational, energetic, urban freedom.`,
    ],
  },

  style_gradient: {
    food: [
      `SINFUL INDULGENCE. Techniques: INGREDIENT EXPLOSION + DARK REFLECTIVE SURFACE + DUAL RIM LIGHTING. Pitch black background. Product on polished black acrylic creating a mirror reflection below. One frozen moment: a single ingredient piece mid-fall beside the product, caught in hard rim light from behind. Polished black surface with mirror reflection. Everything else is darkness and stillness.`,
      `FROZEN POUR. Techniques: LIQUID SPLASH + HARD OVERHEAD SPOTLIGHT + DARK VOID. Dark void background. A liquid pour — milk, honey, chocolate sauce — frozen mid-cascade over the product from directly above. Single hard spotlight from overhead catches every droplet in crystalline detail. The liquid crown splash is the hero element. Wet surface below with authentic splash scatter.`,
      `SMOKE AND HEAT. Techniques: BLACK MARBLE + RISING STEAM + AMBER UNDERLIGHTING. Product on black marble surface. Steam or smoke rising from behind and around the product, caught in warm amber accent light coming from below and behind. The steam creates depth layers against the darkness. Surface shows authentic condensation. Moody, sultry, indulgent.`,
      `LEVITATION BEAM. Techniques: SPOTLIGHT CONE + SINGLE SUSPENDED ELEMENT. Dark gradient background. Product at center with one key ingredient piece suspended above it in a tight cone of hard spotlight. Everything outside the cone is pitch black. Dramatic, theatrical, otherworldly.`,
      `WET OBSIDIAN. Techniques: WET BLACK SURFACE + CONDENSATION + COOL RIM LIGHT. Product on wet black obsidian surface, beaded with condensation droplets — each one a tiny lens reflecting the product. Single cool blue-white rim light from behind creating a sharp edge glow. The wet surface reflects the product in a dark, distorted mirror. Cold, refreshing, premium.`,
    ],
    jewellery: [
      `VELVET THRONE. The jewellery set rests on a sculpted black velvet bust and matching earring stands, dramatically lit by a single hard spotlight from above. The velvet absorbs all light except what the gems catch. Pure black background. The display form gives the jewellery its natural wearing shape.`,
      `FLOATING CONSTELLATION. Each piece of the jewellery set suspended in pure black void, arranged as if worn by an invisible figure. A single focused beam from upper-left catches every facet, creating scattered light points like stars. No surface, no props — just jewellery and light against infinity.`,
      `STONE ALTAR. The jewellery arranged on a raw black marble slab with visible white veining. One hard side light rakes across the stone, catching the metalwork. The marble texture provides visual contrast to the precision of the jewellery. Deep shadows pool around the edges.`,
      `MIRROR FRAGMENT. The jewellery placed on a large shard of dark mirror glass, its reflection creating a perfect symmetrical double below. A thin beam of light cuts diagonally across the frame, illuminating only the jewellery. Everything else is shadow.`,
      `INTIMATE REVEAL. Close-up composition — the jewellery fills 80% of the frame against pitch black. Extreme shallow depth of field, with the foreground piece razor-sharp and background pieces softly blurred. Every facet, prong, and setting is visible in exquisite detail.`,
    ],
    default: [
      `DRAMATIC HERO. Techniques: POLISHED BLACK ACRYLIC + MIRROR REFLECTION + DUAL RIM LIGHT. Product on polished black acrylic with perfect mirror reflection below. Two strip softbox rim lights from behind-left and behind-right creating razor-sharp glowing edges on every surface. Atmospheric mist at the base. Premium, cinematic, desire-inducing.`,
      `LIQUID EXPLOSION. Techniques: WATER SPLASH + SINGLE HARD SPOTLIGHT + DARK VOID. Dark void. A dramatic water or liquid splash frozen mid-explosion around the product — droplets and arcs of liquid suspended in sharp focus. Single hard overhead spotlight catches every droplet. The violence of the splash contrasts with the product's stillness. Dynamic, powerful, arresting.`,
      `COLORED GEL GLOW. Techniques: MATTE BLACK + COLORED ACCENT LIGHT + LOW FOG. Product on matte black surface. A colored gel accent light matching the product's dominant color creates a dramatic chromatic glow on one side. Low-lying fog rolls across the base. The opposite side stays in deep shadow. The color accent makes the product feel alive against the darkness.`,
      `LIGHT BEAM REVEAL. Techniques: FLOATING PARTICLES + DRAMATIC SIDE LIGHT + DARK GRADIENT. Dark gradient fading to pure black at edges. A strong beam of light from one side catches floating particles — dust, mist, fine droplets — creating visible god-rays around the product. The product is half-lit, half in shadow. Theatrical, cinematic, mysterious.`,
      `OBSIDIAN MIST. Techniques: WET BLACK OBSIDIAN + CONDENSATION MIST + SPLIT LIGHTING. Product on wet black obsidian surface with fine mist or condensation clinging to it. Cool-warm split lighting — cold blue from the left, warm amber from the right — creates chromatic tension across the product surface. The wet obsidian reflects both colors. Moody, luxurious, editorial.`,
    ],
  },

  style_outdoor: {
    jewellery: [
      `GARDEN STONE. The jewellery arranged on a weathered stone surface in a lush garden. Dappled sunlight through leaves creates dancing light patterns on the gems. A single green leaf or flower petal nearby for scale and color contrast.`,
      `MORNING DEW. The jewellery on a dark slate surface in early morning light. The background is a soft blur of garden greens. Warm golden backlight creates a rim glow on the metalwork. Peaceful, natural luxury.`,
    ],
    default: [
      `GOLDEN HOUR. Techniques: BACKLIGHT RIM GLOW + NATURAL SURFACE + DEPTH LAYERING. Product OUTDOORS on weathered wood surface. Golden hour sun LOW behind creating a warm golden rim on every edge. Lush green foliage visible in soft bokeh background. 1-2 natural props (leaves, wildflowers) as foreground blur. Fresh, alive, authentic.`,
      `FOREST FLOOR. Techniques: MOSS-COVERED STONE + DAPPLED LIGHT + FERN FOREGROUND. Product on a moss-covered stone in a forest setting. Dappled light filtering through the canopy creates dancing patches of warm light on the product. Unfurling fern fronds enter the frame as foreground blur. Deep green tones, earthy and organic. The product feels discovered, natural, precious.`,
      `BEACH WARMTH. Techniques: SANDY SURFACE + SUNSET RIM LIGHT + OCEAN BOKEH. Product on a sandy beach surface with natural shell fragments and smooth pebbles nearby. Warm sunset light from behind creates a golden-pink rim on every edge. The ocean dissolves into soft blue-teal bokeh in the background. Warm, free, aspirational.`,
      `GARDEN TERRACE. Techniques: STONE TERRACE + MORNING DEW + DIFFUSED OVERCAST. Product on a garden terrace stone surface, surrounded by small herb pots and morning dew drops catching soft light. Overcast sky creates beautifully even, diffused illumination — no harsh shadows. Climbing roses or jasmine in the background blur. Serene, fresh, natural.`,
      `MOUNTAIN VISTA. Techniques: TRAIL ROCK SURFACE + PANORAMIC BLUR + GOLDEN SIDE LIGHT. Product perched on a flat rock along a mountain trail. A panoramic mountain landscape dissolves into soft blue-gold bokeh behind. Warm golden side light from low sun angle. Tiny wildflowers growing from rock crevices add scale and life. Adventurous, expansive, elevated.`,
    ],
  },

  style_festive: {
    default: [
      `DIWALI CELEBRATION. Techniques: BRASS THALI + LIT DIYAS + GOLDEN BOKEH. Product on embroidered silk atop a brass thali. Lit diyas flanking the product as primary warm light sources creating golden pools. Scattered marigold petals catching the warm glow. Golden fairy light bokeh at 3+ different depths behind. Celebration, warmth, tradition.`,
      `RANGOLI SPLENDOR. Techniques: RANGOLI PATTERN + SILK DRAPE + OVERHEAD DIYA GLOW. Product placed on a richly colored rangoli pattern surface, with a flowing silk fabric draping softly at one edge. Warm overhead glow from multiple diyas positioned at varying heights. Scattered flower petals — marigold and rose — creating organic color accents. Vibrant, joyful, deeply cultural.`,
      `ROYAL OFFERING. Techniques: ORNATE GOLD TRAY + WARM DIYA GLOW. Product presented on an ornate gold-embossed tray on rich red velvet. A single lit diya beside the product creates a warm golden pool of light. Scattered marigold petals at the base. Golden bokeh behind. Opulent, auspicious, gift-worthy.`,
      `TEMPLE GLOW. Techniques: EMBROIDERED SILK + BRASS LAMP + MARIGOLD GARLAND. Product on heavily embroidered silk with gold zari work. A traditional brass lamp (samai/vilakku) providing warm directional glow from one side. A floating marigold garland draped in an arc around the product. Warm golden atmosphere with incense smoke wisps catching the lamp light. Sacred, reverent, beautiful.`,
      `HERITAGE WARMTH. Techniques: CARVED WOOD SURFACE + STRING LIGHT BOKEH. Product on a carved wooden tray. Warm string lights in the background create a constellation of golden bokeh orbs. One brass bell beside the product for scale. Saffron-gold warmth suffusing the scene. Nostalgic, celebratory.`,
    ],
  },

  style_clean_white: {
    default: [
      `ABSOLUTE PURITY. Techniques: SEAMLESS WHITE INFINITY + MIRROR REFLECTION + PRECISION LIGHTING. Apple-product-page level purity. Seamless white background with zero visible edges or seams. Product sits on white acrylic with a crisp mirror reflection of its underside fading to white. One overhead strip softbox creating a single clean specular highlight line across the product. A subtle gradient shadow beneath grounds the product. Nothing else — the product and its flawless reflection only. Premium, trustworthy, obsessively detail-focused.`,
    ],
  },

  style_studio: {
    food: [
      `TEAL ENERGY. Techniques: DEEP TEAL BACKDROP + MID-AIR INGREDIENT FREEZE + HARD SIDE LIGHT. Deep teal seamless paper creating cool contrast against warm food tones. Product's raw ingredients scattered and frozen mid-air around it — spice particles, crushed nuts, herb leaves suspended in the hard side light from 45° left. Dramatic shadows cast on the teal surface. The cool backdrop makes warm food colors POP with maximum visual energy. NO people, NO hands.`,
      `MUSTARD DRAMA. Techniques: MUSTARD YELLOW BACKDROP + SHADOW PLAY + PRODUCT REFLECTION. Rich mustard yellow seamless paper. Product sits on a thin dark acrylic strip creating a subtle reflection below. Hard key light from above-right casting a long, dramatic shadow of the product across the yellow surface — the shadow becomes a compositional anchor. Clean, bold, graphic. The warm-on-warm creates a monochromatic richness.`,
      `BLUSH ELEGANCE. Techniques: DUSTY ROSE BACKDROP + SINGLE COMPLEMENTARY PROP + SOFT DIRECTIONAL LIGHT. Dusty rose/blush seamless paper creating a soft, premium atmosphere. Product placed with one single complementary prop — a ceramic plate, a linen napkin fold, or a wooden cutting board edge. Soft directional light from the left with gentle shadow transition. Elegant, refined, appetizing without aggression.`,
      `FOREST BURST. Techniques: FOREST GREEN BACKDROP + POWDER/SPICE EXPLOSION + DUAL RIM LIGHTS. Deep forest green seamless paper. Product at center with a dramatic explosion of its powder, spice, or granular ingredients erupting outward — frozen mid-burst. Dual rim lights from behind-left and behind-right catch every suspended particle against the dark green. The green backdrop adds earthy richness. Bold, dynamic, natural.`,
      `TERRACOTTA HARVEST. Techniques: WARM TERRACOTTA BACKDROP + RAW INGREDIENT ARRANGEMENT + GOLDEN KEY LIGHT. Warm terracotta/clay-colored seamless paper. Product surrounded by a careful arrangement of its raw ingredients at the base — whole spices, fresh herbs, citrus halves, grain clusters. Golden key light from front-left at 3800K warming the entire scene. Earthy, abundant, artisanal.`,
    ],
    jewellery: [
      `NAVY SPOTLIGHT. Techniques: DEEP NAVY BACKDROP + HARD SPOTLIGHT + VELVET CUSHION. Deep navy blue seamless backdrop. Product resting on a small dark velvet cushion. Single hard spotlight from above-left creating intense sparkle points on every gemstone facet and metallic surface. Deep navy makes gold and silver jewelry glow with warmth. The velvet absorbs light around the piece, making it the sole bright element. NO person, NO hands.`,
      `BURGUNDY BRASS. Techniques: RICH BURGUNDY BACKDROP + BRASS ACCENT DISH + WARM SIDE LIGHT. Rich burgundy/wine-colored seamless paper. Product placed on a small brass accent dish or tray. Warm side light from the right creating a golden wash across the metal. The red-gold color harmony feels regal and traditional. Subtle shadow play on the burgundy surface. Luxurious, timeless, desire-inducing.`,
      `EMERALD SILK. Techniques: EMERALD GREEN BACKDROP + SILK RIBBON DRAPE + SPECULAR HIGHLIGHTS. Deep emerald green seamless paper. Product draped over a flowing silk ribbon in champagne or ivory, creating an elegant cascade. Multiple specular highlights on gemstone facets from a hard point light source. The emerald backdrop makes diamonds and colored gems refract dramatically. Opulent, jewel-toned, editorial.`,
      `CHARCOAL GEOMETRY. Techniques: CHARCOAL GREY BACKDROP + GEOMETRIC MARBLE PROP + COOL ACCENT LIGHT. Dark charcoal grey seamless paper. Product placed on a small geometric marble prop — a hexagonal slab or angled block. Cool-toned accent light from behind creating a subtle blue rim on the jewelry edges. Modern, architectural, sophisticated. The neutral backdrop lets the jewelry's own color dominate.`,
      `ROYAL PURPLE. Techniques: ROYAL PURPLE BACKDROP + GOLD LEAF ACCENT + DRAMATIC SPOTLIGHT. Royal purple seamless paper. A few scattered pieces of gold leaf near the product base catching light. Single dramatic spotlight from above creating a focused cone of light on the jewelry. The purple-gold combination feels imperial and precious. Deep shadow falloff at the edges. NO person, NO hands.`,
    ],
    skincare: [
      `SAGE BOTANICAL. Techniques: SAGE GREEN BACKDROP + FRESH BOTANICAL INGREDIENTS + DEWY DROPLETS. Sage green seamless paper. Product surrounded by its fresh botanical ingredients — herb sprigs, flower heads, leaf cuttings — all misted with water droplets that catch the studio light. The green backdrop reinforces the natural, clean ingredient story. Soft directional light from the left. Fresh, trustworthy, ingredient-forward.`,
      `LAVENDER MARBLE. Techniques: SOFT LAVENDER BACKDROP + MARBLE SURFACE PIECE + SERUM TEXTURE SWATCH. Soft lavender seamless paper. Product sitting on a small marble slab or disc. A swatch of the product's texture (serum, cream, gel) smeared on the marble surface showing consistency and translucency. Clean clinical feel with a touch of luxury. Soft even lighting with gentle shadow. Refined, scientific, beautiful.`,
      `PEACH CITRUS. Techniques: WARM PEACH BACKDROP + CITRUS SLICES + GOLDEN SIDE LIGHT. Warm peach seamless paper. Product flanked by fresh-cut citrus slices — orange, lemon, grapefruit — their cross-sections revealing vibrant interiors. Golden side light from the right at 3800K warming the entire scene. The peach-citrus harmony communicates Vitamin C, brightness, glow. Energizing, radiant, fresh.`,
      `MINT SPLASH. Techniques: COOL MINT BACKDROP + WATER SPLASH ELEMENT + CLINICAL LIGHT. Cool mint/aqua seamless paper. A splash or pour of water frozen mid-motion near the product, catching clean 5600K studio light. The water communicates hydration and purity. Clinical, clean lighting with minimal shadow. The cool tones reinforce a science-backed, refreshing promise. Pure, hydrating, modern.`,
      `BLUSH PETALS. Techniques: BLUSH PINK BACKDROP + ROSE PETALS SCATTERED + SOFT DIFFUSED LIGHT. Blush pink seamless paper. Delicate rose petals scattered around the product base in a natural, wind-blown pattern. Soft diffused light from a large octabox creating gentle, even illumination with barely-there shadows. Romantic, gentle, self-care indulgence. The pink reinforces femininity and tenderness.`,
    ],
    candle: [
      `NAVY FLAME. Techniques: DEEP NAVY BACKDROP + LIT FLAME AS PRIMARY LIGHT + SMOKE WISPS. Deep navy seamless paper. The candle IS LIT — its flame serves as the primary warm light source, creating a pool of amber glow on the navy surface. Thin smoke wisps curl upward, caught by a subtle rim light. The navy darkness makes the flame glow feel intimate and powerful. Atmospheric, meditative, warm.`,
      `BURGUNDY COZY. Techniques: WARM BURGUNDY BACKDROP + KNIT TEXTURE PROP + AMBER GLOW. Warm burgundy seamless paper. Product beside a folded cozy knit texture piece (scarf or small blanket section). Warm amber studio light from one side simulating candlelight glow. The red tones create a cocoon of warmth. The viewer feels hygge — that Danish coziness. Intimate, warm, comforting.`,
      `FOREST BOTANICAL. Techniques: FOREST GREEN BACKDROP + DRIED BOTANICALS + WARM RIM LIGHT. Forest green seamless paper. Dried botanical elements at the product base — eucalyptus sprigs, lavender bundles, dried citrus rounds — matching the candle's scent profile. Warm rim light from behind creating a golden edge on the candle and botanicals. The green backdrop grounds the scene in nature. Earthy, aromatic, grounding.`,
      `CHARCOAL MIRROR. Techniques: CHARCOAL BACKDROP + MIRROR REFLECTION BELOW + FLAME GLOW. Dark charcoal seamless paper. Product on a dark reflective surface creating a mirror image below. The lit flame's glow is the dominant warm light, its reflection doubling in the mirror surface. Minimal, dramatic, the flame and its reflection creating visual symmetry. Sophisticated, modern, moody.`,
      `MAUVE CERAMIC. Techniques: DUSTY MAUVE BACKDROP + CERAMIC DISH ACCENT + GOLDEN LIGHT POOL. Dusty mauve seamless paper. Product resting in or beside a handmade ceramic dish in a complementary earth tone. Soft golden light from one side creating a warm pool around the candle. The mauve adds a sophisticated, muted femininity. Artisanal, calm, beautiful.`,
    ],
    garment: [
      `TEAL FLOW. Techniques: DEEP TEAL BACKDROP + FABRIC MID-FLOW + DRAMATIC SHADOW. Deep teal seamless paper. The garment displayed with its fabric edge caught mid-flow as if a gentle breeze just passed — creating dynamic movement. The teal creates maximum complementary contrast against warm embroidery tones (gold, red, orange). A dramatic shadow of the garment cast on the teal surface adds a second compositional element. Bold, elegant, dynamic.`,
      `TERRACOTTA STYLED. Techniques: WARM TERRACOTTA BACKDROP + COMPLEMENTARY ACCESSORY + HARD KEY LIGHT. Warm terracotta seamless paper. The garment displayed with one complementary accessory — a pair of jhumka earrings, mojari shoes, or a clutch — placed at the base. Hard key light from 45° left creating clean, defined shadows on the warm surface. The terracotta warmth enhances rich fabric colors. Styled, intentional, campaign-ready.`,
      `SAGE TEXTURE. Techniques: SAGE GREEN BACKDROP + TEXTURE-REVEALING SIDE LIGHT + DETAIL FOCUS. Sage green seamless paper. Strong side light from the right specifically angled to reveal fabric texture — weave pattern, embroidery relief, thread detail, print depth. The sage green provides a calm, sophisticated neutral that lets the garment's texture be the hero. Close enough framing to see individual threads catching light.`,
      `ROSE MINIMAL. Techniques: DUSTY ROSE BACKDROP + MINIMAL STYLING + SOFT DIRECTIONAL LIGHT. Dusty rose seamless paper. The garment displayed cleanly with zero props — the fabric itself is the entire story. Soft directional studio light from front-left creating gentle shadow transitions that reveal the garment's drape and silhouette. The rose backdrop adds warmth without competing. Minimal, feminine, elegant.`,
      `NAVY METALLIC. Techniques: NAVY BACKDROP + METALLIC ACCESSORY ACCENT + DRAMATIC RIM LIGHTING. Deep navy seamless paper. The garment accented with a metallic accessory — gold belt, silver brooch, or brass buttons catching a hard rim light. The navy backdrop makes metallic elements sparkle dramatically. Rim light from behind separates the garment from the dark background. Bold, editorial, high-fashion energy.`,
    ],
    electronics: [
      `MATTE BLACK NEON. Techniques: MATTE BLACK BACKDROP + NEON BLUE ACCENT RIM LIGHT + REFLECTIVE SURFACE. Matte black seamless paper. Product on a dark reflective surface showing a subtle mirror image below. A neon blue accent rim light from behind-right creates a striking electric blue edge on the product. The futuristic glow against total darkness makes the product look like it belongs in 2030. Sleek, powerful, cutting-edge.`,
      `CHARCOAL FOG. Techniques: DEEP CHARCOAL BACKDROP + COOL CYAN EDGE GLOW + BASE FOG. Deep charcoal seamless paper. Product elevated slightly with cool cyan LED edge glow wrapping around its silhouette from behind. Low-lying fog rolling across the base, caught in the cyan light. The product emerges from the mist like technology materializing. Mysterious, premium, futuristic.`,
      `NAVY SCREEN. Techniques: DARK NAVY BACKDROP + PURPLE ACCENT LIGHTING + PRODUCT SCREEN GLOW. Dark navy seamless paper. If the product has a screen, its glow illuminates the immediate surroundings. Purple accent light from one side creates a violet wash on the product edges. The navy-purple color story feels premium tech. For non-screen products, the purple accent IS the glow source. Immersive, tech-forward, cinematic.`,
      `CONCRETE SPLIT. Techniques: CONCRETE GREY BACKDROP + WARM-COOL SPLIT LIGHTING + MINIMAL STYLING. Concrete grey seamless paper with visible texture. Warm light from the left, cool light from the right — split lighting creating chromatic contrast across the product surface. Zero props — the product and the light are the entire composition. Industrial, honest, design-focused.`,
      `VOID RGB. Techniques: PURE BLACK BACKDROP + RGB COLORED RIM LIGHTS + FLOATING PARTICLES. Pure black seamless paper. Three colored rim lights — red, green, blue — positioned at different angles creating an RGB color separation effect on the product edges. Fine floating particles caught in the colored beams. The product looks like a hero reveal in a gaming trailer. Bold, vibrant, electrifying.`,
    ],
    bag: [
      `TERRACOTTA TRAVEL. Techniques: WARM TERRACOTTA BACKDROP + TRAVEL ACCESSORIES + GOLDEN KEY LIGHT. Warm terracotta seamless paper. The bag with travel accessories casually peeking out — a passport corner, sunglasses arm, a map fold. Golden key light from front-left at 3800K creating warm shadows on the terracotta surface. The warm tones evoke adventure and wanderlust. Aspirational, curated, journey-ready.`,
      `SAGE LEATHER. Techniques: SAGE GREEN BACKDROP + LEATHER TEXTURE HIGHLIGHT + WARM SIDE LIGHT. Sage green seamless paper. Strong warm side light from the right specifically angled to reveal the bag's leather grain, stitch detail, and surface patina. The sage green provides an earthy, sophisticated contrast. The bag's craftsmanship is the hero — every stitch visible. Artisanal, quality-focused, tactile.`,
      `NAVY HARDWARE. Techniques: NAVY BACKDROP + METALLIC HARDWARE SPARKLE + HARD DIRECTIONAL LIGHT. Deep navy seamless paper. Hard directional light from above-left creating intense specular highlights on every metallic element — zippers, buckles, clasps, rivets, chain links. The navy darkness makes the metal glow like jewelry. The bag looks expensive, the hardware looks precious. Premium, detail-obsessed, luxurious.`,
      `PINK EDITORIAL. Techniques: DUSTY PINK BACKDROP + FASHION MAGAZINE PROP + STUDIO RIM LIGHT. Dusty pink seamless paper. The bag placed beside an open fashion magazine (blurred pages) and a pair of sunglasses as styling props. Studio rim light from behind creating edge separation. The pink backdrop creates a feminine, editorial fashion shoot feel. Stylish, curated, magazine-worthy.`,
      `CHARCOAL SHADOW. Techniques: CHARCOAL BACKDROP + DRAMATIC SHADOW PLAY + SINGLE OVERHEAD SPOT. Dark charcoal seamless paper. Single overhead spot creating a focused cone of light on the bag with a dramatic, elongated shadow stretching across the dark surface. Minimal styling — the bag and its shadow are the entire composition. The shadow adds visual weight and drama. Architectural, bold, statement-making.`,
    ],
    default: [
      `TEAL CAMPAIGN. Techniques: DEEP TEAL BACKDROP + COMPLEMENTARY PROP + HARD KEY LIGHT. Deep teal seamless paper creating maximum contrast with the product. One complementary prop at the base telling the product's story. Hard key light from 45° left creating a dramatic shadow cast on the teal surface. The cool teal makes warm product tones pop. Bold, professional, campaign-ready.`,
      `TERRACOTTA WARMTH. Techniques: WARM TERRACOTTA BACKDROP + NATURAL TEXTURE ACCENT + GOLDEN SIDE LIGHT. Warm terracotta/clay seamless paper. A natural texture accent near the base — a linen fold, a wooden element, a ceramic piece. Golden side light from the right at 3800K creating warm dimensional shadows. The earthy tones communicate authenticity and craft. Warm, grounded, artisanal.`,
      `SAGE STUDIO. Techniques: DUSTY SAGE BACKDROP + SINGLE CONTEXTUAL PROP + SOFT DIRECTIONAL LIGHT. Dusty sage green seamless paper. One single contextual prop that relates to the product's use or story. Soft directional studio light from front-left creating gentle, clean shadows. The muted green provides a calm, sophisticated canvas. Refined, intentional, modern.`,
      `NAVY ACCENT. Techniques: RICH NAVY BACKDROP + METALLIC ACCENT ELEMENT + DUAL STUDIO LIGHTING. Rich navy seamless paper. A small metallic accent element — brass dish, copper tray, gold-toned object — beside the product. Dual studio lighting: warm key from left, cool fill from right creating chromatic depth. The navy-metallic combination feels premium and editorial. Elevated, luxurious, polished.`,
      `BLUSH SHADOW. Techniques: WARM BLUSH BACKDROP + MINIMAL STYLING + DRAMATIC SHADOW PLAY. Warm blush/salmon seamless paper. Zero props — the product stands alone. Hard studio light creating a dramatic shadow of the product stretching across the blush surface. The shadow becomes the primary compositional element. The warmth of the blush adds approachability to the drama. Clean, bold, graphic.`,
    ],
  },

  style_minimal: {
    jewellery: [
      `GALLERY PEDESTAL. The jewellery centered on a white marble cube pedestal against a pale grey wall. Single hard overhead light creates a perfect circular pool of illumination. The shadow of the jewellery on the marble is as precise as the jewellery itself.`,
      `NEGATIVE SPACE STUDY. The jewellery placed at the bottom-right intersection of a rule-of-thirds grid. 70% of the frame is smooth dove grey. One directional light from the left. The emptiness amplifies the preciousness of the object.`,
    ],
    default: [
      `ARCHITECTURAL STILLNESS. Techniques: SINGLE DIRECTIONAL LIGHT + DRAMATIC SHADOW + NEGATIVE SPACE. One hard light source from 60-80° creating a long, geometric shadow that IS the primary compositional element — the shadow is as important as the product itself. Product on raw concrete or honed stone. 60-70% of the frame is intentional empty space creating visual tension. Rule-of-thirds placement at the intersection. NO props, NO people, NO hands. The interplay of form, shadow, and void creates an architectural meditation. Zen, sophisticated, gallery-worthy.`,
      `LEVITATION STUDY. Product floats in infinite white void with only a soft contact shadow beneath. Dead center placement. The emptiness IS the composition. Zero props, zero surface texture.`,
      `COLOR FIELD. Product on a single muted-color surface (warm grey, pale sage, or dusty blush). Hard overhead light creates a tight illumination pool with sharp shadow edges. Product at bottom-third, 65% empty color field above.`,
      `MACRO ABSTRACTION. Extreme close-up where the product fills 90% of frame. Focus on one surface detail — texture, material finish — with everything else in soft blur. Product becomes an abstract landscape of material and light.`,
      `DIAGONAL TENSION. Product on diagonal axis. Hard side light creates a clean light-dark split across the surface. One half illuminated, one half in shadow. 55% negative space on the light side.`,
    ],
  },

  style_with_model: {
    food: [
      `MID-BITE CRAVING — PERSON IS MANDATORY. Freeze the EXACT ACTION MOMENT of consuming this food. Chips/snacks: person mid-crunch, chip between teeth, eyes squeezed shut in flavor ecstasy, crumbs falling from fingers. Cookies/sweets: person caught mid-bite, a crescent bitten out, melted chocolate on fingertips, tongue savoring. Drinks/beverages: person HOLDING the sealed product (cap ON) near face level, tilting it toward lips with eager anticipation, fingers wrapped tight around the cold surface. If the product has a cap or lid in the input photo, it MUST remain attached — do NOT show the product open, mid-sip, or uncapped. Spices/cooking ingredients: person mid-stir at a sizzling pan, tasting from a wooden spoon with raised eyebrows, steam curling around their face. Protein bars/health food: person mid-unwrap at the gym bench, tearing the wrapper with teeth, post-workout flush on face. The product AND its packaging must be clearly visible. Props that match the product's ingredients scattered on the surface nearby. NOT a posed smile — a REAL frozen action. Warm light, shallow DOF, contextual environment matching how the food is consumed.`,
    ],
    skincare: [
      `MID-APPLICATION GLOW — PERSON IS MANDATORY. Freeze the EXACT ACTION of applying THIS product. Serum: person mid-squeeze of the dropper, golden drops falling toward fingertips, other hand touching dewy cheek, caught between steps. Face cream: fingertips mid-dab on cheekbone, product jar open nearby, a visible smear trail showing the motion of application. Face wash: person mid-lather at the sink, foam between palms being worked up, water droplets on mirror. Sunscreen: person mid-squeeze onto forearm, outdoors with hat and sunglasses pushed up. Lip product: person mid-swipe across lips in a compact mirror, one eye checking the application. Hair oil: person mid-massage at the scalp, fingers threaded through hair, oil bottle balanced on the counter. The product container MUST be prominently visible — either in hand or placed nearby on the vanity with ingredient-matching props (rose petals for rose products, aloe leaf for aloe products). Soft bathroom/vanity light. The viewer thinks "I want that glow."`,
    ],
    jewellery: [
      `GETTING-READY MOMENT — PERSON IS MANDATORY. Freeze the intimate ACTION of putting on or admiring this jewelry. Necklace: Indian woman mid-clasp behind her neck, looking into a vanity mirror, catching the first glimpse of it on — fingers still at the clasp, slight smile of satisfaction. Earrings: person mid-thread through earlobe, head tilted, one hand holding hair back, the other guiding the earring in — mirror reflecting the moment. Ring: person mid-slide onto finger, hand held up to catch the light, admiring it with parted lips. Bracelet/bangles: person mid-stack on wrist, pushing one bangle past knuckles, the others already jingling. Anklet: person leaning to fasten at ankle, dupatta draped, seated on a cushion. The jewelry MUST be the brightest, sharpest element — hard accent light creating sparkle on gems. Velvet fabric or jewelry box nearby as a prop. Soft key light on skin. Warm skin tones. Confidence, desire, beauty.`,
    ],
    electronics: [
      `CAUGHT IN ACTIVE USE — PERSON IS MANDATORY. Freeze the person MID-ACTION with this device. Headphones/earbuds: person mid-head-bob with eyes closed, one hand adjusting the earbud, mouth slightly open humming along, caught in a groove. Phone: person mid-swipe showing something exciting to a friend, both leaning in, screen glow on faces. Speaker: person mid-dance-move in their living room, arms up, speaker on the shelf behind with visible sound vibration. Fitness tracker/watch: person mid-sprint, glancing at wrist mid-stride, sweat flying, caught in explosive motion. Laptop: person mid-type leaning forward with focused intensity, coffee cup mid-lift in other hand. Power bank: person mid-plug at an airport gate, phone charging, looking up at the departure board. Keyboard/mouse: person mid-clutch-play, leaning into the screen, fingers hovering over keys. The product enabling a genuine ACTION MOMENT — not posing, DOING. Warm-cool light contrast, shallow DOF.`,
    ],
    garment: [
      `CAUGHT IN MOTION — PERSON IS MANDATORY. Freeze the person MID-MOVEMENT in this garment — fabric must be visibly in motion. Casual wear: person mid-stride on a street, one foot forward, hair caught by wind, turning to laugh at someone off-camera, coffee cup in hand. Ethnic wear (kurti/saree/lehenga): person mid-twirl in a courtyard, dupatta flying outward in an arc, fabric caught in a beautiful spiral, bangles mid-jingle on raised wrists. Formal wear: person mid-button of a cuff while striding through a lobby, jacket flaring with the movement, confident head-turn. Gym/activewear: person mid-jump or mid-lunge, fabric stretching with the body, sweat droplets frozen mid-flight. Every shot MUST show fabric in motion — a ripple, a flutter, a stretch, a drape caught by movement. Blurred lifestyle background. The garment is the hero because it moves beautifully. Confidence and dynamism.`,
    ],
    candle: [
      `LIGHTING THE FLAME — PERSON IS MANDATORY. Freeze the EXACT MOMENT of the ritual with this candle. Person mid-strike of a match, the flame just catching the wick, eyes focused on the tiny fire, a curl of first smoke rising. Or: person mid-lean to blow out the candle, cheeks puffed, wax pool glowing amber, smoke about to billow. Or: person mid-pour of wine into a glass beside the lit candle, the flame's reflection dancing in the glass. The candle flame IS the warm ambient light source. Scent-matching props nearby — dried lavender, cinnamon sticks, orange peel, eucalyptus — whatever matches THIS candle's fragrance. Person looks present, intentional, savoring. The viewer wants this exact ritual.`,
    ],
    bag: [
      `CAUGHT IN TRANSIT — PERSON IS MANDATORY. Freeze the person MID-ACTION with this bag, not just carrying it. Backpack: person mid-swing of the bag onto one shoulder, turning toward a campus building, one strap caught mid-air. Handbag: person mid-rummage inside the bag at a market stall, pulling out a wallet, other hand pointing at something to buy. Travel bag: person mid-pull through an airport terminal, boarding pass between teeth, phone in other hand checking gates. Laptop bag: person mid-exit from a cab, one foot on the curb, bag strap across chest, coffee balanced in hand. Clutch: person mid-laugh at an evening event, clutch tucked under arm, champagne glass raised mid-toast. The bag is integrated into a REAL action, not just slung on a shoulder. Motion, energy, aspiration.`,
    ],
    default: [
      `PERSON ACTIVELY USING THIS PRODUCT IS MANDATORY — AN IMAGE WITHOUT A PERSON MID-ACTION IS A FAILURE FOR THIS STYLE.

Freeze the EXACT MOMENT of using this product — not holding it, not posing with it, but CAUGHT IN THE ACT:
- Perfume/fragrance: person mid-spray on wrist, mist frozen in air, eyes closing as the first note hits, dresser mirror reflecting the bottle
- Dumbbells/gym equipment: person mid-rep, muscles engaged, sweat frozen mid-drip, exhale visible, gym environment
- Water bottle: person mid-gulp after a run, head tilted back, water droplets on chin, chest heaving
- Notebook/stationery: person mid-sketch, pen pressed to page creating a visible line, brow furrowed in concentration, cafe latte untouched
- Kitchenware: person mid-flip of food in a pan, ingredients airborne, steam billowing, apron splattered
- Toys: child mid-build or mid-play, tongue out in concentration, pieces scattered, creation taking shape
- Tools: person mid-use, sawdust flying, grip tight, protective gear on, workshop environment
- Home decor: person mid-place on a shelf, stepping back with head tilted, one hand on hip judging the arrangement
- Sunglasses: person mid-slide onto face, one arm still extended, golden hour light catching the lens

Every scene must show a FROZEN ACTION MOMENT — the split second of doing, not the static pose of having done. Include 2-3 props that relate to the product's use case. The person's expression must match the ACTION (effort, concentration, delight, satisfaction). The product MUST be clearly visible and recognizable. Candid asymmetric expression. Shallow DOF. The person provides context and aspiration.`,
    ],
    beverage_cold: [
      `ENERGY CRACK — PERSON IS MANDATORY. A confident young person grips the COLD can firmly, caught mid-crack of opening it — the tab pulled back with a satisfying pop, eyes bright and alert, expression radiating energy and readiness. The can surface is beaded with condensation. NOT a serene savoring pose — this person is CHARGED UP and ready to go. Gym bag or outdoor background in shallow DOF. The can label faces camera.`,
      `POST-WORKOUT REFRESH — PERSON IS MANDATORY. A person in workout clothes, slightly sweaty and flushed, tilts the COLD can toward them with a wide refreshed grin — eyes open and energized, not closed and meditative. Condensation on the can surface, gym or outdoor context behind in soft focus. The energy is HIGH not calm — this is the reward that recharges, not the drink that relaxes. Can label clearly visible.`,
      `FRIENDS AND CANS — PERSON IS MANDATORY. One young person holds the COLD can casually at chest height with a side-profile laugh — genuinely mid-conversation, caught candid, expression electric with amusement and vitality. Outdoor urban setting. The can surface shows condensation catching afternoon light. Energetic, social, alive. NOT a café moment — this is outside, in motion, in life.`,
    ],
  },
};
*/

// ---------------------------------------------------------------------------
// Photography Specs — identical to V3
// ---------------------------------------------------------------------------

const PHOTOGRAPHY_SPECS: Record<string, string> = {
  style_clean_white: `PHOTOGRAPHY: Seamless white acrylic, mirror reflection of product underside. Key — 120cm octabox 45° front-left. Fill — white V-flat opposite 2:1. Accent — overhead strip softbox. 5600K daylight. Hasselblad X2D 100C, 90mm f/3.2, ISO 64.`,
  style_studio: `PHOTOGRAPHY: Colored seamless paper backdrop (choose complement to product). Three-point studio setup. Key — softbox 45° front-left. Fill — reflector 3:1. Rim light for edge separation. 5500K daylight. Hasselblad X2D 100C, 90mm f/3.2, ISO 64.`,
  style_gradient: `PHOTOGRAPHY: Polished black acrylic with mirror reflection. Two strip softbox rim lights behind-left and behind-right. Minimal fill 8:1+. Deep intentional shadows. Eye level to slightly below. Sony A7 IV, 50mm f/1.2, ISO 400.`,
  style_lifestyle: `PHOTOGRAPHY: Natural window light from one side, 3200-4500K, 3:1-4:1 ratio. Shallow DOF f/2.0-2.8. Canon EOS R5, 85mm f/1.4L, ISO 100. 25-40° above, rule-of-thirds.`,
  style_outdoor: `PHOTOGRAPHY: Golden hour backlight PRIMARY — 3000-3500K sun low behind product creating golden rim. Open shade fill. 4:1 ratio. DOF f/1.4-2.0 MANDATORY. Fujifilm X-T5, 56mm f/1.2, Classic Chrome.`,
  style_festive: `PHOTOGRAPHY: Primary warm diya glow 2700-3000K. Multiple warm point sources at varying distances creating layered golden bokeh. 3:1 ratio. 25-40° above. Canon EOS R5, 85mm f/1.4L, ISO 400.`,
  style_minimal: `PHOTOGRAPHY: Single strong directional source 60-80° from camera creating LONG dramatic shadow. 5000K neutral. 4:1-5:1 ratio. Product 30-40% of frame, rest is intentional negative space. Hasselblad X2D 100C, 90mm f/3.2, ISO 64.`,
  style_with_model: `PHOTOGRAPHY: Key light 45° front-left, 5000-5600K. Product and person MUST have matching shadows. Shallow DOF f/2.0-2.8 with blurred contextual background. Canon EOS R5, 85mm f/1.4L, ISO 100.

MODEL: Indian/South Asian person, candid expression caught mid-action. Natural skin (visible pores, subtle blemishes, slightly asymmetric smile). Hair with soft wispy edges and flyaway strands. ONE person only. Clothing: solid neutral colors, no competing logos.

ANATOMY (CRITICAL): Exactly 2 arms, 2 legs, 2 feet, 2 hands. Each hand has exactly 5 fingers. When seated or in complex poses, every limb must be CLEARLY distinguishable — no ambiguous merged legs or phantom limbs. Natural body proportions throughout.

GRIP: Match product size/weight — pinch for flat items, wrap for bottles, cup for jars. NEVER pose for camera.`,
};

// ---------------------------------------------------------------------------
// Style Mandate Helper — identical to V3
// ---------------------------------------------------------------------------

function getStyleMandate(style: string): string {
  const mandates: Record<string, string> = {
    style_festive: `INDIAN FESTIVE — FESTIVAL-AWARE CELEBRATION

Current month: ${new Date().toLocaleString('en-US', { month: 'long' })}

Select the festival context that BEST matches THIS product and the current season:

- DIWALI (Oct-Nov): Lit diyas, rangoli, marigolds, gold+saffron palette. For gifts, candles, sweets, home decor.
- HOLI (March): Colored powders (gulal), playful energy, bright colors against white. For colorful/playful products.
- NAVRATRI (Sep-Oct): Dandiya sticks, garba dress fabric, nine vibrant colors. For fashion/garments.
- EID (varies): Crescent moon, brass lanterns, dates, green+white+gold. For perfume, fashion, food.
- CHRISTMAS (Dec): Pine branches, red+green+gold ornaments, gift boxes, fairy lights. For gifts, food.
- RAKSHA BANDHAN (Aug): Decorative rakhi, brass thali, sweets. For sibling gifts.
- ONAM (Aug-Sep): Pookalam flowers, banana leaf, Kerala brass lamp. For South Indian products.
- PONGAL (Jan): Sugarcane, kolam pattern, harvest pots. For food/harvest products.
- GENERIC FESTIVE: When no specific festival fits. Warm golden light, celebration elements, brass accents.

CRITICAL RULES:
- Do NOT default to Diwali for everything. Each festival has COMPLETELY different visual elements.
- Do NOT mix festivals — no Diwali diyas with Holi colors or Eid props with Christmas trees.
- Match the festival to the product's natural occasion. A garment → Navratri fashion. A candle → Diwali lights. A food product → feast/harvest context.
- Warm golden lighting (2700-3500K) dominates. Festival elements are supporting cast — the product is ALWAYS the hero.
- NO modern/gym/office settings. Props should be relevant to the product and follow best advertising practices for the product category.

Anti-patterns:
- Diyas are ONLY for Diwali/Hindu festivals
- Marigolds are ONLY for Diwali/Pooja contexts
- Do NOT use "red silk + brass thali" for everything`,
    style_gradient: `DARK LUXURY — PRODUCT-SPECIFIC DARK TREATMENT

Select the dark luxury sub-style that BEST matches THIS product:

- NOIR EDITORIAL: For luxury/premium items (perfume, watches, bags). Hard shadow from extreme angle, half the product consumed by shadow, film noir mystery. Dark stone or concrete surface.
- SPOTLIGHT ISOLATION: For precious small objects (jewellery, rings, collectibles). Single tight overhead spotlight, absolute void outside the cone. Product floats in its own theater.
- WET OBSIDIAN: For cold beverages, skincare bottles, glass containers. Polished reflective black surface, condensation beads, mirror reflection below.
- SMOKE AND EMBER: For candles, incense, spices, hot beverages. Rising smoke/steam caught in warm amber underlighting. Dark marble surface.
- NEON ACCENT: For electronics, tech accessories, gaming gear, energy drinks. Matte black with single colored rim light (cyan, blue, or brand-color-matched).
- INGREDIENT EXPLOSION: For food/snacks with visible ingredients. Frozen burst of ingredients outward from product, dual rim lights, polished black acrylic reflection.
- CHROMATIC SPLIT: For fashion, garments, dual-nature products. Two contrasting colored lights from opposite sides creating split lighting.

CRITICAL: Each product type gets a DIFFERENT dark treatment. A candle is NOT lit the same as a perfume. A protein bar is NOT displayed like jewellery. Select the sub-style that creates the most compelling dark ad for THIS specific product.
NO bright/outdoor/festive settings. Props should be relevant to the product and follow best advertising practices for the product category.

Anti-patterns:
- Do NOT put every product on the same polished black acrylic with rim lighting
- Do NOT use mist/fog as the default — match dynamic element to the product
- Do NOT use the same surface for all products

CRITICAL CREATIVE RULES FOR DARK LUXURY:
1. The product must be CLEARLY VISIBLE — use strong rim light, edge light, or spotlight to separate it from darkness. The product should GLOW.
2. Dark luxury is NOT "product on black background" — it's a CINEMATIC SCENE with depth, atmosphere, and visual energy.
3. Include at least ONE element that creates DEPTH: a reflection below, smoke behind, particles in light, a gradient surface, textured material.
4. The lighting should tell a STORY — dramatic hard light from one direction creates mystery. Dual rim lights create premium editorial feel. Spotlight creates reverence.
5. The background should have SUBTLE variation — not flat black. Use deep navy, dark charcoal, or gradient transitions. Pure flat black looks cheap.
6. Color accent is POWERFUL in darkness — a single warm amber accent, or a cool cyan edge, or the product's own colors catching light creates scroll-stopping contrast.
7. The hero moment for dark luxury is the INTERPLAY between light and shadow on the product surface — how light catches the material, reveals texture, creates specular highlights.`,
    style_outdoor: 'NATURAL OUTDOOR: Golden-hour natural light, organic textures (wood, stone, leaves), real outdoor environment. NO studio/indoor settings. Props should be relevant to the product and follow best advertising practices for the product category.',
    style_lifestyle: 'LIFESTYLE SETTING: Warm home/cafe/workspace environment, natural light, lived-in feel with contextual props. Aspirational but relatable. Props should be relevant to the product and follow best advertising practices for the product category.',
    style_studio: `COLORED STUDIO: Clean colored backdrop — NEVER white or grey. Choose a SPECIFIC, BOLD color:
- For warm-toned products (gold, red, orange, brown): use cool backdrops (teal, navy, sage green, slate blue)
- For cool-toned products (blue, silver, white, green): use warm backdrops (terracotta, dusty rose, warm sand, burnt sienna)
- For neutral products: use bold saturated colors (deep teal, rich burgundy, emerald, royal purple)
State the EXACT color name in your creativeBrief. Professional studio lighting, product-focused.
PROPS RULE: Props are ALLOWED but ONLY if directly derived from the product — its ingredients, flavors, materials, or primary use-case. Examples: a chips bag with its flavor ingredients (chili peppers, lime slices, scattered chips), skincare with its key botanical ingredient (rose petals, aloe leaves), a coffee product with coffee beans. If nothing relevant can be derived from the product, use ZERO props. A plain water bottle = no props. A gold necklace = soft velvet fabric only. Props must enhance the product story, not distract from it.`,
    style_autmn_special: `AUTMN SPECIAL — PUSH BEYOND ALL LIMITS.
This is NOT a standard product photo. This is an AWARD-WINNING advertising campaign image.

Think like the world's most daring creative director:
- UNEXPECTED angles and compositions (not eye-level, not centered)
- DRAMATIC lighting that creates mood and emotion (not flat studio light)
- BOLD color choices that make the product EXPLODE off the screen
- ONE dynamic element that creates visual ENERGY (frozen splash, floating particles, dramatic shadow)
- The kind of image that wins Cannes Lions advertising awards

DO NOT default to "product on a table with nice lighting." That is BORING.
DO NOT create anything that looks like a standard lifestyle or outdoor shot.

Think: What would make a creative director at Ogilvy or Wieden+Kennedy say "THAT is brilliant"?

Examples of bold thinking:
- A soda bottle with an explosion of citrus and ice crystals against a pure black void with dramatic rim lighting
- A necklace draped over volcanic rock at sunset, waves crashing in background
- A skincare bottle floating in a pool of its own product, catching light like liquid gold
- A protein bar on the edge of a skyscraper ledge, city lights bokeh behind it

Be BRAVE. Be ORIGINAL. Be EXTRAORDINARY.`,
    style_clean_white: 'CLEAN WHITE: Pure white background, soft even lighting, product floating or on minimal surface. E-commerce style. ZERO props — only the product on pure white. No objects, no decorations, no ingredients scattered around the product. Just the product and its shadow.',
    style_minimal: 'MINIMAL & CLEAN: Muted neutral tones, very few props, lots of negative space, calm and elegant composition.',
    style_with_model: `WITH MODEL — A PERSON AND THE PRODUCT TOGETHER

Show a person naturally interacting with this product in a way that makes someone want to buy it.

PRINCIPLES (not rules — use your creative judgment):
- The product must be clearly visible and recognizable — it is the REASON this ad exists
- A person must be visible with their face showing — not just hands or feet
- The interaction should feel NATURAL and AUTHENTIC — mid-action, not posed
- Think about what makes the BEST possible ad for THIS specific product with a person in it
- Sometimes the person USING the product is the ad. Sometimes the person's LIFESTYLE with the product is the ad. You decide which approach creates a more compelling image for THIS product.
- The person should represent the product's target audience

Show a face. Show the product. Make it look like a professional advertisement. You are a world-class creative director — figure out the best composition.`,
  };
  return mandates[style] ?? 'Follow the selected style closely.';
}

// ---------------------------------------------------------------------------
// Few-shot creative concept examples — identical to V3
// ---------------------------------------------------------------------------

const FEW_SHOT_EXAMPLES = `
## EXAMPLES OF SCROLL-STOPPING CREATIVE CONCEPTS

Example 1 — Masala Chips Pack (style_gradient — INGREDIENT EXPLOSION):
{
  "heroMoment": "The explosive burst of spice and crunch when you rip open a fresh pack",
  "dynamicElements": ["chips and spice particles EXPLODING outward from the pack in a halo", "red chili powder cloud suspended mid-air", "one chip frozen mid-flight showing seasoning crystals catching rim light", "crushed peanuts and curry leaves scattered at the base"],
  "emotionalTrigger": "craving",
  "storyScene": "Pitch black background. The masala chips pack stands on polished black acrylic, its surface reflecting below. An EXPLOSION of chips, chili powder, curry leaves, and peanut fragments erupts outward from the opened top — each chip frozen mid-flight, each spice particle caught in the dual rim lights. Red chili powder forms a dramatic cloud around the pack. The label is sharply lit and legible.",
  "creativeBrief": "Editorial product advertisement. Against total darkness, the masala chips pack stands center-frame on wet black acrylic, its mirror reflection visible below. Two strip softbox rim lights from behind-left and behind-right create razor-sharp glowing edges on the metallic packaging. From the torn-open top, an explosion of chips, red chili powder, crushed peanuts, and curry leaves erupts outward in a frozen burst — each element suspended mid-air, lit by the rim lights. Individual chili powder particles form a red-orange cloud around the upper half of the pack. One large chip is frozen at the peak of its arc, its seasoning crystals catching individual specks of light. At the base, scattered curry leaves and peanut fragments rest on the wet black surface among the reflection. Hard key light from front-left at 45° illuminates the pack label. The acrylic surface shows authentic wet sheen. Subtle film grain. Square format, 1:1 aspect ratio."
}

Example 2 — Energy Drink Can (style_gradient — SPLASH + ICE):
{
  "heroMoment": "The adrenaline rush of ice-cold energy exploding in your hand",
  "dynamicElements": ["massive water and ice splash erupting from behind the can", "ice chunks and shards frozen mid-explosion at the base", "condensation droplets beading on the can surface", "low-lying cold mist rolling across the dark surface", "colored accent rim light matching the can's flavor color"],
  "emotionalTrigger": "energy",
  "storyScene": "Pure black void. The energy can sits on wet black obsidian. A violent explosion of water, crushed ice, and ice shards erupts from behind and around the can, frozen at its peak. The can is covered in beaded condensation. Cold mist rolls at the base. Dual rim lights from behind — one matching the can's brand color (green, orange, or blue), the other cool white — create a chromatic glow on every water droplet.",
  "creativeBrief": "Editorial product advertisement. Against pure black, the energy can stands on polished black obsidian with its reflection visible below. Behind the can, a massive crown-shaped splash of water and crushed ice erupts upward and outward, frozen at 1/8000s — individual droplets razor-sharp against the darkness. Two strip softbox rim lights: one in the can's brand accent color, one cool white, create dual-colored edges on every surface. Ice chunks and shards scatter at the base, some caught mid-bounce. The can surface is covered in beaded condensation, each droplet acting as a tiny lens. Low-lying cold mist rolls across the obsidian surface. The can label is sharply legible, illuminated by a subtle warm key from front-left. The wet surface reflects the chaos of the splash. Subtle vignetting at edges. Square format, 1:1 aspect ratio."
}

Example 3 — Diamond Necklace (style_festive — DIYA GLOW):
{
  "heroMoment": "The auspicious radiance of precious jewelry lit by sacred flames",
  "dynamicElements": ["lit diyas creating warm pools of golden light from multiple points", "each gemstone refracting a different color of firelight", "scattered marigold petals catching the warm glow", "fine kumkum dust particles floating in the diya light"],
  "emotionalTrigger": "desire",
  "storyScene": "A brass thali on red velvet. The diamond necklace is arranged in a horseshoe arc, flanked by two lit brass diyas whose flames create the primary warm lighting. Marigold petals scattered around. Gold coins at the edges. Each diamond catches the diya firelight at a different angle, creating multiple sparkle points. Fine kumkum particles float in the warm air. Golden fairy light bokeh at three depths behind. NO person, NO hands.",
  "creativeBrief": "Editorial product advertisement. On deep red velvet draped over a brass thali, the diamond necklace is arranged in an elegant arc. Two lit brass diyas flank the piece — their 2700K flames are the primary light source, creating warm golden pools that illuminate the gems. Each diamond facet catches the flickering firelight at a unique angle — some producing white fire, others warm amber. Matching earrings placed symmetrically below. Scattered marigold petals and gold coins at the edges catch individual specks of firelight. Fine kumkum dust particles are visible in the warm air. Behind, golden fairy light bokeh circles at three different depths create layered warmth. The red velvet shows its pile texture. Subtle film grain. NO person, NO hands, NO body parts. Square format, 1:1 aspect ratio."
}

Example 4 — Face Serum Bottle (style_lifestyle — TEXTURE + BOTANICAL):
{
  "heroMoment": "The glowing, dewy-skin promise of a perfect morning skincare ritual",
  "dynamicElements": ["serum drop caught mid-fall from the dropper, backlit like liquid gold", "fresh-cut citrus and botanical ingredients arranged around with visible dew", "product swatch smeared on a glass surface showing translucent gel texture"],
  "emotionalTrigger": "freshness",
  "storyScene": "A marble bathroom vanity in soft morning light. The serum bottle stands with its dropper lifted, a single golden drop caught mid-fall, backlit. Around the base: a halved orange, fresh aloe leaf, rosemary sprig — all misted with water droplets looking fresh-picked. A smear of the serum on the marble surface catches light, showing its gel consistency. Warm directional light from a window on the left.",
  "creativeBrief": "Editorial product advertisement. On a white marble vanity surface, the face serum bottle stands slightly left of center. The glass dropper is lifted above the bottle — a single luminous drop of golden serum is caught mid-fall, backlit by soft 4000K window light from the left that makes it glow like liquid amber. Around the bottle base: a halved blood orange, a fresh-cut aloe leaf showing its gel interior, and a rosemary sprig — all misted with fine water droplets that catch individual specks of light. On the marble surface near the bottle, a small swatch of serum is smeared, showing its translucent gel texture. The marble shows natural veining. A small white ceramic dish and folded linen towel provide context. Shot on Canon EOS R5, 85mm f/1.4, shallow DOF with the bathroom blurred into soft warm tones. Square format, 1:1 aspect ratio."
}

Example 5 — Kurti/Ethnic Dress (style_studio — FABRIC MOTION + COLOR):
{
  "heroMoment": "The flowing elegance of fabric that makes you feel beautiful",
  "dynamicElements": ["fabric edge caught mid-flow as if a gentle breeze just passed", "deep teal backdrop chosen for maximum complementary contrast against warm gold/red embroidery", "dramatic shadow of the garment cast on the colored surface", "embroidery thread catching specular highlights"],
  "emotionalTrigger": "confidence",
  "storyScene": "A deep teal seamless paper backdrop. Deep teal was chosen because the kurti's warm embroidery (gold/red) creates maximum complementary contrast against cool teal. The embroidered kurti is displayed on an invisible form, its fabric edge caught mid-ripple as if touched by wind. The garment's embroidery details catch the hard key light. A dramatic shadow of the garment falls on the teal surface, creating a second compositional element. One small prop at the base: a pair of jhumka earrings.",
  "creativeBrief": "Editorial product advertisement. Against a rich deep teal seamless paper backdrop — chosen specifically because the kurti's warm gold and red embroidery creates maximum complementary contrast against the cool teal. The embroidered kurti is displayed showing its full silhouette. The fabric's bottom edge is caught mid-ripple, creating dynamic movement. Hard key light from 45° front-left at 5500K creates a dramatic shadow of the garment on the teal surface — the shadow becomes a compositional element, stretching to the right. Fill light from a reflector at 3:1 ratio preserves embroidery detail in the shadows. Each gold embroidery thread catches specular highlights, creating a constellation of tiny light points across the fabric. At the base, a pair of brass jhumka earrings provides scale and cultural context. The teal-gold contrast is the creative strategy — warm product on cool backdrop for maximum visual impact. Shot on Hasselblad X2D 100C, 90mm f/3.2 for razor-sharp textile detail. Square format, 1:1 aspect ratio."
}

Example 6 — Ceramic Vase (style_minimal — ARCHITECTURAL SHADOW):
{
  "heroMoment": "The meditative beauty of a single object and its shadow in perfect balance",
  "dynamicElements": ["long geometric shadow stretching across raw concrete surface", "60% intentional negative space creating visual tension", "single hard light source from 70° creating sharp shadow edges"],
  "emotionalTrigger": "serenity",
  "storyScene": "A raw honed concrete surface. The ceramic vase is placed at the right-third intersection, occupying only 35% of the frame. A single hard light from 70° left creates a long, dramatic shadow stretching diagonally across the empty concrete — the shadow is as important as the object itself. No props. No decoration. The vast empty space and the shadow create an architectural meditation.",
  "creativeBrief": "Editorial product advertisement. On a raw honed concrete surface with subtle aggregate visible, the ceramic vase sits at the right-third intersection point. A single hard directional light source from 70° left at 5000K neutral creates a long, razor-sharp geometric shadow that stretches diagonally across the concrete to the bottom-left corner — the shadow occupies more visual space than the product itself and IS the primary compositional element. 60-65% of the frame is intentional empty concrete, creating deliberate tension between object and void. The vase's curved form is rendered in clean side-lit dimension — highlight on the left face, gradual shadow transition to the right. The concrete shows micro-texture and natural variation. No props, no color accents, no distractions. The interplay of form, shadow, and negative space creates gallery-worthy stillness. Subtle film grain at full resolution. Shot on Hasselblad X2D 100C, 90mm f/3.2, ISO 64. Square format, 1:1 aspect ratio."
}

Example 7 — Eau de Parfum Bottle (style_with_model — PERSON USING PRODUCT):
{
  "heroMoment": "The intoxicating confidence of a final spritz before stepping out for the evening",
  "dynamicElements": ["mist of perfume frozen mid-spray catching the warm light", "person's eyes closed savoring the fragrance", "dresser mirror reflecting the scene from a second angle"],
  "emotionalTrigger": "confidence",
  "storyScene": "An Indian man in a fitted charcoal shirt stands at a bedroom dresser. He holds the perfume bottle in his right hand, spraying it on his left wrist — the fine mist is frozen mid-spray, catching warm side-light. His eyes are closed, chin slightly lifted, savoring the scent. The perfume bottle label is clearly visible. Behind him, a dresser mirror reflects the bottle from another angle. Warm evening light from a lamp.",
  "creativeBrief": "Editorial product advertisement. An Indian man in a charcoal linen shirt at a bedroom dresser, spraying the Eau de Parfum on his left wrist. Fine perfume mist frozen mid-spray catches warm 3200K lamp light from the right. His eyes are closed, chin slightly raised, savoring the fragrance. The bottle label faces camera, clearly legible. Dresser mirror behind reflects the scene. Warm amber tones throughout. Shot on Canon EOS R5, 85mm f/1.4, shallow DOF blurring the bedroom. Square format, 1:1 aspect ratio."
}

Example 8 — Wireless Earbuds Case (style_gradient — NEON ACCENT):
{
  "heroMoment": "The futuristic power of technology that feels like it's from another era",
  "dynamicElements": ["neon cyan accent rim light creating electric blue edges against total darkness", "low-lying fog rolling across the reflective black surface", "product's LED indicator glowing as a secondary light source", "floating dust particles caught in the neon light beam"],
  "emotionalTrigger": "power",
  "storyScene": "Pure black void. The earbuds case sits on polished black obsidian with its mirror reflection below. A neon cyan rim light from behind-right wraps every edge in electric blue. Low fog rolls at the base, caught in the glow. The case's LED indicator pulses as a secondary warm light point. Fine particles float in the cyan beam. The product looks like it costs 10x its price.",
  "creativeBrief": "Editorial product advertisement. Against pure black, the wireless earbuds charging case sits center-frame on polished black obsidian, its full mirror reflection visible below in the dark surface. A neon cyan accent rim light from behind-right at 6500K creates razor-sharp electric blue edges along every contour of the case — the glow wraps around the curved surfaces creating a futuristic luminous outline. From behind-left, a subtle cool white strip softbox provides secondary edge definition. Low-lying fog rolls across the obsidian surface at the base, the fog itself catching and diffusing the cyan light into a soft ground-level glow. The case's small LED status indicator glows warm amber, creating a tiny secondary light source that reflects in the obsidian below. Fine dust particles float in the cyan light beam, visible as tiny bright points against the void. The case surface shows authentic material texture — matte plastic with subtle sheen where the light catches. The obsidian surface has a wet, mirror-like quality. Subtle vignetting at edges pulls focus to center. Shot on Sony A7 IV, 50mm f/1.2, ISO 400. Square format, 1:1 aspect ratio."
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildV4Prompt(
  imageCount: number,
  style?: string,
  voiceInstructions?: string,
): string {
  const styleKey = style ?? 'style_lifestyle';
  const isMultiImage = imageCount > 1;

  const photoSpec = PHOTOGRAPHY_SPECS[styleKey] ?? PHOTOGRAPHY_SPECS['style_lifestyle']!;

  let prompt = `You are an elite advertising creative director AND expert product photographer. Your job is to analyze this product and conceive a COMPELLING advertisement concept — not just a nice photo, but an image that makes someone STOP SCROLLING and WANT this product.

You are given ${imageCount} photo${imageCount > 1 ? 's' : ''} of THE SAME product${isMultiImage ? ' from different angles' : ''}. Analyze ALL photos together to build a COMPLETE and UNIFIED understanding of this product.

Your response MUST be valid JSON only — no markdown, no explanation, no code fences.

== MANDATORY STYLE: ${styleKey} ==
Every creative field you return — heroMoment, storyScene, creativeBrief, dynamicElements — MUST match this style.
${getStyleMandate(styleKey)}
Do NOT override this style based on product type. The user chose this style explicitly.

`;

  if (isMultiImage) {
    prompt += `== MULTI-ANGLE TASKS ==

### Task A: Choose the best primary image
Examine all ${imageCount} images and identify which one is the BEST primary photo.

CRITICAL: The primary image MUST show the FRONT face of the product — the side with the brand name, logo, and product name prominently displayed. This is the face that appears on store shelves facing customers.

STRICT PRIORITY ORDER — work top to bottom:
1. FRONT/DISPLAY FACE (HIGHEST PRIORITY): Pick the image showing the FRONT of the product — the branded face, logo side, display label, the side that faces customers in a store. A nutrition facts panel, ingredient list, barcode, manufacturing date, regulatory text, or back label is ALWAYS the BACK — never select it as primary.
2. MOST BRANDING VISIBLE: Among front-facing images, prefer the one with the most visible brand name, logo, key text.
3. BEST LIGHTING: Among equally-branded images, prefer sharper, better-lit.
4. LEAST CLUTTER: Final tiebreaker — less background clutter.

FALLBACK RULE: If NO image clearly shows the front face (all images show backs, sides, or ingredient lists), choose the image that shows the MOST brand name or logo text visible. A partially visible brand name is always better than a fully visible ingredient list. NEVER select an image that primarily shows nutrition facts, ingredient lists, barcodes, manufacturing dates, or regulatory text as the primary image.

Return "primaryImageIndex" as a 0-indexed integer (0 = first image, 1 = second image, etc.).
Return "primaryImageReason" explaining briefly why this image was chosen.

### Task B: Per-angle quality assessment
For each of the ${imageCount} images (indexed 0 to ${imageCount - 1}), assess:
- "index": 0-indexed image number
- "quality": "excellent" | "good" | "usable" | "poor"
- "bestFor": what this angle reveals — e.g., "front label visibility", "shape and profile", "ingredient list"

### Task C: Reference image ranking
Rank the NON-primary images by how much unique, additive value they provide to the creative brief.
- "index": image index (not the primary)
- "valueScore": 0-10 (10 = high unique value)
- "uniqueInfo": what specific new information this angle provides

### Task D: Cross-angle insights
"crossAngleInsights": Summarize what ADDITIONAL information each non-primary angle reveals compared to the primary. E.g., "Back angle (image 2) reveals a full ingredient list and '100% natural' certification badge."

### Task E: Complete branding inventory from ALL angles
Extract EVERY piece of text visible across ALL angles into "brandingInventory":
- "text": the exact text visible
- "type": "brand_name" | "tagline" | "ingredient" | "certification" | "weight" | "barcode" | "other"
- "prominence": "dominant" (large, brand-hero text) | "secondary" (supporting) | "small_print" (fine print, regulatory)

`;
  } else {
    prompt += `Since only one image is provided:
- "primaryImageIndex": always 0
- "primaryImageReason": brief note on the image quality
- "angleQualities": single entry for index 0
- "crossAngleInsights": "Single image provided — no cross-angle synthesis possible."
- "referenceImageRanking": empty array []
- "brandingInventory": extract all text visible in this single image

`;
  }

  prompt += `== ANALYSIS TASKS ==

## STEP 1: Input Quality Assessment
- Is this photo usable? Reject only if: no product visible, extremely blurry (<100px), corrupted.
- Accept messy backgrounds, poor lighting, bad angles — we fix everything.
- "hasGlare": true if visible specular reflections or flash hotspots on product
- "inputAngleQuality": "good" | "suboptimal" | "unusable" (assess the PRIMARY image)
- "usable": false ONLY if NO product is visible in ANY of the images, or ALL images are severely corrupted.
- "rejectionReason": explanation if usable is false, otherwise null.

## STEP 2: Product Identification (be EXTREMELY specific)
Full brand name, product type, variant, size. NOT "speaker" but "Anker SoundCore 2 Portable Bluetooth Speaker, black mesh front, ANKER logo on face." Synthesize details visible across ALL angles.
- "productName": Full, specific product name including brand, variant, and format.
- "brandName": Brand name or null if unbranded.
- "productType": The type of product (e.g., "face wash", "earrings", "kurti").
- "specificDescription": 2-3 sentences describing the product in detail as seen across ALL angles.
- "productComponents": List EVERY visible physical sub-component across ALL photos — caps, lids, straws, cables, stands, boxes, tags, applicators. Be exhaustive.
- "visibleText": ALL text visible across ALL angles — brand names, taglines, ingredients, certifications, barcodes.
- "isColdBeverage": true if the product is ANY beverage served cold or at room temperature — energy drink cans, soda, cola, sparkling water, juice, water bottles, beer, sports drinks, iced tea, cold coffee cans, kombucha. False for non-beverages and hot beverages. When in doubt, set true.
- "isTransparent": true if the product is transparent or semi-transparent (glass bottles, clear plastic, glass candle holders, acrylic). False for all opaque products.

## STEP 2.5: Physical Characteristics
- "productPhysicalSize": "tiny" (palm-sized) | "small" (hand-sized) | "medium" (forearm-sized) | "large" (bigger)
- "productDimensionality": "flat_2d" (cards, stickers, pouches) | "shallow_3d" (plates, slabs, thin boxes) | "deep_3d" (bottles, cans, boxes with depth)
- "recommendedCanvasFill": 0.3–0.95 (tiny+flat=0.85, large=0.60)
- "dominantColors": all colors visible across all angles
- "material": primary material(s) the product is made from
- "shape": geometric shape description
- "keyVisualElements": all notable visual elements across ALL angles
- "productCategory": "food" | "jewellery" | "garment" | "skincare" | "candle" | "bag" | "home_goods" | "electronics" | "handicraft" | "other"

## STEP 3: Branding Detection
- "hasBranding": true if ANY brand text/logo/mark visible in ANY image
- "brandingConfidence": 0.0–1.0 — when uncertain, err HIGH — better to preserve than destroy
- "brandElements": list every distinct brand element found across ALL angles

## STEP 4: Full Product Analysis
- "targetAudience": who buys this product (demographics, lifestyle, aspirations)
- "priceSegment": "budget" | "mid_range" | "premium" | "luxury"
- "desiredEmotion": the single strongest emotion this product should evoke
- "adBestPractices": 1-2 sentences on what makes ads for this product category effective

## STEP 5: CREATIVE CONCEPT (THIS IS THE MOST IMPORTANT STEP)

You are now the creative director. Your job is to design an advertisement that makes people WANT this product.

### 5a: Hero Moment
What single EMOTIONAL MOMENT should this ad capture? Not "product on a nice background" but a specific human moment that triggers desire. Examples: "the first sip of ice-cold lemonade on a hot day", "the satisfaction of biting into a warm cookie", "the quiet confidence of clasping on a precious necklace."

### 5b: Dynamic Elements
What specific MOTION, TEXTURE, or ACTION elements make this ad come alive?

- VARIETY IN DYNAMIC ELEMENTS: Do NOT default to "mist" or "fog" for every style. Each style should have its own signature dynamic elements:
  - Clean White: subtle reflection/shadow ONLY — no mist, no fog, no particles
  - Studio: light play on colored surface, product shadow — no mist
  - Gradient/Dark Luxury: splashes, particles, rim-light flares — mist is OK here
  - Lifestyle: steam from coffee, crumbs, spilled ingredients — contextual to the product's USE
  - Outdoor: wind-blown elements, natural light flares, pollen — no artificial mist
  - Festive: diya smoke, floating petals, sparkles — no cold mist
  - Minimal: shadow ONLY — absolutely nothing else in the scene
  - With Model: person's natural environment — no artificial atmospheric effects

The style is FIXED as ${styleKey}. You MUST use ONLY elements that fit this style.

## CREATIVE CONCEPT — PROFESSIONAL AD CREATIVE DIRECTION

You are a world-class advertising creative director. Design the PERFECT advertisement for THIS specific product. Follow this professional decision framework:

### STEP A: Identify the product at the MOST SPECIFIC level
Not "food" but "packaged dark chocolate bar, premium, 70% cocoa"
Not "jewellery" but "kundan bridal necklace set, heavy work, traditional"
Not "skincare" but "vitamin C face serum, glass dropper bottle, orange liquid"

### STEP B: Determine the HERO MOMENT
The hero moment is the single most compelling frozen instant for THIS product:
- Honey → thick golden thread mid-pour catching backlight
- Chocolate → broken piece revealing filling, crumbs scattered
- Face serum → one golden drop mid-fall from dropper
- Bridal necklace → laid out on red silk beside lit diyas
- Craft beer → condensation beads catching golden hour light
- Candle → first flame catching, wisp of smoke rising
- Protein bar → half-unwrapped showing texture inside
- Soda → aggressive condensation, ice crystals clinging
- Chips → bag torn open, chips spilling out mid-crunch

Formula: Product + Peak Emotional State + ONE Dynamic Element

### STEP C: Select the EMOTIONAL TRIGGER
Match the PRIMARY emotion to the product:
- Craving → food, beverages, chocolate (visceral, pre-rational)
- Desire → jewellery, luxury goods, fashion (aspirational)
- Comfort → candles, home decor, night cream (safety, warmth)
- Confidence → skincare, garments, bags (self-improvement)
- Energy → energy drinks, activewear, electronics (power, dynamism)
- Freshness → sunscreen, face wash, mint products (renewal)
- Nostalgia → traditional sweets, heritage crafts, Ayurvedic (roots, authenticity)
- Sophistication → premium tea, artisanal products, leather (taste, refinement)
- Joy → party snacks, festive items, gifts (celebration)
- Warmth → chai, winter wear, handmade items (belonging, home)

### STEP D: Determine the REAL USAGE CONTEXT
Think about WHEN and WHERE this product is ACTUALLY used:

TIME OF DAY → determines lighting:
- Morning products → soft window light (4500-5500K)
- Evening products → warm lamp light (2800-3200K)
- Night products → intimate, low-key lighting

LOCATION → determines surface and background:
- Kitchen counter, bathroom vanity, gym bench, office desk
- Outdoor terrace, park, poolside, café table
- Bedroom nightstand, vanity table, dining table

SOCIAL CONTEXT:
- Alone (self-care, morning ritual)
- With partner (gifting, dinner)
- With friends (party, outing)
- With family (festival, meal)

### STEP E: Match ENVIRONMENT to PRICE SEGMENT
The scene must match the product's price point:

Budget (under Rs 200): Simple wood, colorful, busy but warm. Bright, energetic light.
Mid-range (Rs 200-1000): Natural wood, ceramic. Curated, 2-3 props. Warm, directional light.
Premium (Rs 1000-5000): Marble, brass, dark wood. Clean, 1-2 props. Controlled, dramatic light.
Luxury (Rs 5000+): Black acrylic, velvet, mirror. Zero props. Hard spotlight.

### STEP F: Select PROPS using the 3-Ring System
Ring 1 (touching product): Items physically present during use. Serum → dropper, cotton pad. Chai → steel glass, saucer. Earrings → jewelry box, small mirror.
Ring 2 (in scene): Context builders. Serum → flowers, towel. Chai → newspaper, window light. Earrings → perfume bottle, hairbrush.
Ring 3 (background, out of focus): Atmosphere. Blurred shelves, window, warm interior bokeh.

Prop count by segment: Budget 2-3, Mid 3-5, Premium 1-2, Luxury 0-1.
RULE: Props must NEVER upstage the product. The product is always brightest and sharpest.

### STEP G: LIGHTING direction
- Front-lit → safe, shows all details (e-commerce)
- Side-lit (45°) → texture and dimension (food, skincare, fabric)
- Backlit → rim glow and drama (beverages, transparent products)
- Top-lit → stable impressions (flat-lay food, jewelry top-down)

### STEP H: Apply STYLE modifiers
The user's selected style modifies the visual treatment:
- Autmn Special → YOU decide the best approach. Be bold, unexpected, scroll-stopping.
- Lifestyle → real-life setting where the product is ACTUALLY used
- Outdoor → genuine outdoor setting with natural light and elements
- Studio → colored backdrop, minimal props, clean and controlled
- Clean White → pure white, zero props, product and shadow only
- With Model → person NATURALLY interacting with the product mid-action

### STEP I: SCROLL-STOPPING elements
Include ONE unexpected element that makes someone stop scrolling:
- A mid-pour splash frozen in time
- Steam rising in dramatic light
- An ingredient floating weightlessly
- A fabric mid-flutter
- Condensation dripping at the perfect moment
- A flame reflecting in a surface

### STEP J: INDIAN MARKET awareness
- Warm tones dominate Indian visual culture (gold, amber, saffron)
- Festive elements (diyas, marigolds, rangoli) when appropriate
- Authentic settings > sterile perfection (slightly imperfect = trustworthy)
- Traditional products need heritage elements (brass, silk, wood)
- Bold compositions work better on WhatsApp/Instagram mobile screens

### CRITICAL: YOUR CREATIVE BRIEF MUST BE UNIQUE TO THIS PRODUCT
If someone sends a diet soda → design a poolside/BBQ/rooftop scene
If someone sends homemade pickle → design a dining table with roti scene
If someone sends a protein bar → design a gym/hiking scene
If someone sends bridal jewellery → design a wedding prep scene
If someone sends a candle → design a cozy evening scene with the flame as light source

NEVER use the same scene for different products. NEVER default to generic settings.
Every product has ONE perfect scene. Find it.

FOR style_with_model — A PERSON AND THE PRODUCT TOGETHER:
Show a person naturally interacting with this product in a way that makes someone want to buy it. A person must be visible with their face showing — not just hands or feet. The product must be clearly visible and recognizable. The interaction should feel natural and authentic — mid-action, not posed. Sometimes the person USING the product is the ad. Sometimes the person's LIFESTYLE with the product is the ad. You decide which approach creates a more compelling image for THIS specific product. You are a world-class creative director — figure out the best composition.

Every product has its OWN ideal scene. DO NOT recycle scenes between products.
For the style "${styleKey}", design the scene that makes THIS product's target customer stop scrolling.

### 5c: Emotional Trigger
What should the viewer FEEL? One of: craving, desire, energy, comfort, luxury, freshness, joy, confidence, warmth, power, serenity, excitement, nostalgia, sophistication, playfulness, wonder

### 5d: Story Scene
Describe what is HAPPENING in this image in 2-3 sentences. Not camera specs — the SCENE. What objects are where? What action is frozen? What's the setting?

### 5e: Creative Brief
Write a 60-100 word PRECISE scene description. Every word must earn its place. Describe the surface, the single most important prop, the light direction, and the product placement.

IMPORTANT: The product must look like a PHOTOGRAPHED physical object — NOT a 3D render. Include material cues: "packaging catches key light with specular highlights", "slight dimensional bulging from contents", "visible crinkle texture on foil/plastic", "glass surface shows reflections". The product should look premium and beautiful but REAL.

${photoSpec}

${FEW_SHOT_EXAMPLES}

### 5f: Scene Prompt (40-70 words)
A concise creative ad scene description for image generation. Focus on the STORY and DYNAMIC ELEMENTS, not camera specs.

### 5g: Background-Only Prompt (40-70 words)
An EMPTY scene matching the style with NO product. "no products, no objects in center, clear negative space."

## COLD BEVERAGE RULES (apply ONLY when isColdBeverage is true):
- NEVER add steam, smoke, heat haze, or any heat-implying atmospheric effect near or around the product
- The can or bottle MUST appear COLD and CHILLED — show condensation droplets, frost, ice cubes, cold mist at the base, or frost rings on the surface beneath the can
- Do NOT place the product in a café or any setting associated with hot beverages
- Emotional trigger MUST be "energy", "freshness", "excitement", or "power" — NEVER "warmth", "comfort", or "serenity"

## RULES FOR THE CREATIVE BRIEF:

- PRODUCT-RELEVANT PROPS: The scene MUST include 2-3 props that directly relate to the product's ingredients, flavor, use case, or category.
  EXCEPTION — style_clean_white: ZERO props. Only the product on pure white.
  EXCEPTION — style_studio: Props ONLY if directly derived from the product (ingredients, flavors, materials). If nothing relevant exists, use ZERO props.

- LIGHTING LANGUAGE: Describe light as a PHYSICAL PRESENCE: "warm golden light spills across from the left", "a single beam cuts through darkness catching every edge". The image generator renders light better when described poetically, not technically.

- BRAND COLOR HARMONY: Identify the product's dominant brand colors. The scene's palette should COMPLEMENT these colors. The product should VISUALLY POP against the scene — use complementary colors for contrast.

- DYNAMIC ELEMENTS must be PRODUCT-SPECIFIC, not generic:
  * Beverage → splashes of the actual liquid color, ice cubes, condensation, the drink being poured
  * Food → ingredients floating/scattered, crumbs, steam
  * Skincare → product texture swirl, dewy droplets, flower petals matching the scent
  * Perfume → mist cloud, fragrance notes as visual elements
  * Electronics → light trails, digital particles, connectivity waves
  * Jewellery → light refractions, sparkle points, soft fabric flow
  * Candles → warm smoke wisps, melted wax drips, flame glow on surroundings
  DO NOT use generic mist/fog. Every dynamic element must connect to what the product IS.

- FORBIDDEN DYNAMIC ELEMENTS BY CATEGORY:
  * Jewellery: NO water, splashes, liquid, or moisture. Use ONLY: light refractions, sparkle points, soft fabric flow, warm glow.
  * Electronics: NO water or liquid. Use ONLY: light trails, digital particles, subtle glow effects.
  * Garments: NO water or liquid. Use ONLY: fabric motion, wind, floating threads, natural movement.
  * Candles: NO water. Use ONLY: smoke wisps, warm glow, flame reflections.
  * Bags: NO water. Use ONLY: motion blur, fabric texture, natural light.
  * Skincare: Water/dew is OK only if the product is water-based. Otherwise use: flower petals, product texture, soft glow.
  * Food/Beverage: Water, ice, splashes, condensation are all OK and encouraged.

## STEP 6: PRODUCT USAGE CONTEXT (CRITICAL FOR AD ACCURACY)

For FOOD/BEVERAGE products:
- "servingTemperature": "hot" | "cold" | "room_temperature" | "frozen" | "not_applicable"
- "consumptionMethod": HOW is it physically consumed? "eaten by hand from wrapper" vs "drunk from can"
- "typicalSetting": WHERE is this product typically consumed?
- "servingVessel": What container is it served in? Protein bar = "none, eaten from wrapper". Soup = "bowl".
- "utensils": What do you use to eat/drink it? Protein bar = "hands only". Steak = "fork and knife".
- "usageOccasion": When/why is it consumed? "post-workout snack", "morning energy boost"
- "productState": "sealed" (packaged products that should remain closed) | "open" (products shown in use) | "not_applicable" (products without packaging)

For NON-FOOD products:
- "servingTemperature": "not_applicable"
- "servingVessel": "not_applicable"
- "utensils": "not_applicable"
- "consumptionMethod": how is it used? "worn around neck", "applied to face with fingertips"
- "typicalSetting": where is it used? "vanity table getting ready", "gym locker room"
- "usageOccasion": "wedding preparation", "daily morning skincare routine"

CRITICAL MISTAKES THIS PREVENTS:
- A protein bar on a china plate with fork and knife (it's eaten from the wrapper by hand)
- Steam rising from an energy drink or ice cream (both are cold/room temperature)
- A gym protein bar in a formal restaurant setting

## STEP 7: INDIAN MARKET INTELLIGENCE (CRITICAL — prevents cultural mistakes)

### FOOD & BEVERAGE RULES:
- CHAI: Serve in kulhad (clay cup) or cutting chai glass. NEVER in a Western coffee mug. Steam is REQUIRED.
- FILTER COFFEE: Serve in davara-tumbler (South Indian steel set). NOT in a paper cup or mug.
- LASSI: Serve in tall steel glass or earthen glass. NOT in a cocktail glass.
- MITHAI/SWEETS (ladoo, barfi, halwa): Serve on brass or steel thali. NEVER on a Western ceramic plate with fork. Scatter marigold petals, not roses. Show diyas, not candles.
- PACKAGED SNACKS (chips, biscuits, protein bars): Eaten BY HAND from the wrapper/packet. NEVER on a plate with cutlery. Setting: gym, office, on-the-go. NOT formal dining.
- SPICES/MASALAS: These are INGREDIENTS, not food to eat. Show with whole spices scattered, mortar-pestle, kitchen setting. NEVER plated as a meal.
- PICKLES/CHUTNEYS: Show in jar with pairing food nearby (papad, bread, rice). Rustic, homemade aesthetic.
- HONEY: Room temperature. The honey-drip from a wooden dipper is the classic shot.

### JEWELLERY RULES:
- NECKLACES: Must be on a velvet bust/stand, on a neck, or draped on silk fabric. NEVER lying flat on a desk.
- TEMPLE/TRADITIONAL jewellery: Indian setting (silk, diyas, brass). NEVER Western luxury (champagne, roses).
- BANGLES: Always shown in SETS (never single). On a bangle stand or wrist with mehendi.
- EARRINGS: Always shown as a PAIR. On an earring stand or worn.
- NO water/condensation on jewellery EVER.

### GARMENT RULES:
- SAREES: MUST be draped/on mannequin. NEVER shown folded flat. Pallu and border must be visible.
- KURTIS: On body or hanger, showing the cut and fit.
- JUTTIS/KOLHAPURIS: Rustic Indian setting. NOT Western shoe store.

### SKINCARE RULES:
- AYURVEDIC products: Rustic, natural setting (herbs, clay, wood). NOT clinical/sterile.
- Modern serums: Clean bathroom/vanity setting.
- HAIR OIL: Warm Indian home setting. Traditional champi context.

### HOME GOODS RULES:
- CANDLES: MUST be shown LIT. Flame is the product's hero element. Indoor evening setting.
- DEITY FIGURINES: Absolute reverence. Pooja room/altar ONLY. NEVER near food/beverages or in casual settings.
- CUPS/MUGS: Show WITH beverage inside. Kulhad = chai only. Mug = coffee.
- WALL ART: On a wall in a room. NEVER flat on a table.

### UNIVERSAL ANTI-PATTERNS (NEVER DO THESE):
1. Fork and knife with Indian food that is eaten by hand
2. Steam on room-temperature food (protein bars, biscuits, packaged snacks)
3. Ice/condensation on non-cold products
4. Chai in a coffee mug
5. Single bangle (always sets), single earring (always pairs)
6. Saree shown folded flat
7. Unlit candle
8. Deity items in casual/disrespectful settings
9. Homemade/artisanal products in sterile clinical settings
10. Water/moisture on jewellery, electronics, or paper products

CRITICAL CONSTRAINT FOR CREATIVE BRIEF: The creative brief must NEVER describe the product differently from how it appears in the input photo. Do not invent details, simplify the product, or change its design. The brief should describe the SCENE and ENVIRONMENT around the product, not redesign the product itself.
- CONDENSATION/WATER DROPLETS: Only add condensation or water droplets if the product is a BEVERAGE CONTAINER or FOOD/DRINK product. For ALL other categories, the product surface must remain DRY.
- EXACTLY ONE product in the image — NEVER duplicate or clone
- Product is the HERO — fills the recommended canvas percentage
- Product MUST obey gravity
- Product matches original photo EXACTLY — same shape, colors, text, logos
- The image is EDGE TO EDGE — NO borders, frames, picture-frame effects, or decorative edges
- Do NOT add ANY text, watermarks, labels, or attribution text ANYWHERE
- No illustrated or cartoon elements — everything is photorealistic
- Include natural photographic imperfections: "subtle film grain at full resolution", "dust motes in rim light", "slight vignetting at edges"
- Frame as describing a photograph that ALREADY EXISTS
- End with: "Square format, 1:1 aspect ratio."
- CRITICAL PERSON RULE:
  - If style is "style_with_model": MUST include exactly ONE Indian/South Asian person. Show a person naturally interacting with this product — their face must be visible, not just hands or feet. The product must be clearly visible and recognizable. The interaction should feel authentic and mid-action, not posed. Describe their age, gender, expression, clothing, skin tone. Realistic features: visible pores, asymmetric candid smile, flyaway hair strands. You decide the best composition for THIS specific product.
  - For ALL other styles: ZERO people, ZERO hands, ZERO body parts, ZERO mannequins.

`;

  if (voiceInstructions && voiceInstructions.trim().length > 0) {
    const sanitized = voiceInstructions
      .trim()
      .slice(0, 500)
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\n{3,}/g, '\n\n');
    prompt += `## USER'S CREATIVE DIRECTION
"${sanitized}"

Integrate this into your creative concept for the chosen style. IMPORTANT RULES:
- PRODUCT INTEGRITY IS SACRED: Color, setting, and mood instructions apply ONLY to the SCENE and ENVIRONMENT — NEVER to the product itself. The product's every physical attribute (colors, materials, strap color, case finish, fabric shade, label design, packaging color) must remain EXACTLY as in the input photo. Only modify the product's appearance if the user EXPLICITLY names a specific product part to change.
- If the user mentions a COLOR (e.g., "red background"), use that color as the DOMINANT TONE woven throughout the scene in lighting, props, surfaces, atmosphere. Do NOT make a flat solid-color background. Create a rich, styled scene where that color PERMEATES the environment naturally.
- If the user mentions a SETTING (e.g., "garden", "kitchen", "beach"), design the scene IN that setting while maintaining the chosen style's photography approach.
- If the user mentions a MOOD or EFFECT (e.g., "dramatic", "festive", "luxury"), amplify that feeling through lighting, composition, and props.
- INDIAN FESTIVAL INTELLIGENCE: Different Indian festivals have VERY DIFFERENT visual identities. Do NOT mix them:
  * DIWALI: Oil lamps (diyas), string lights, firecrackers, rangoli, sparklers, indoor glittering settings
  * CHHATH PUJA: River/ghat setting at sunset or sunrise, bamboo soop, sugarcane stalks, thekua sweets, fruits, brass vessels with offerings, banana leaves. NO diyas, NO string lights. The setting is ALWAYS at a riverbank.
  * HOLI: Colored powders (gulal), water colors, pichkari (water guns), white clothes splashed with color, playful energy
  * NAVRATRI/DURGA PUJA: Red and gold colors, dandiya sticks, traditional garba dress
  * MAKAR SANKRANTI: Kites, sesame-jaggery sweets (tilgul), open sky settings
  * EID: Crescent moon, dates, biryani, traditional Islamic patterns, green and white colors
  * CHRISTMAS: Decorated tree, red-green-gold colors, stars, gifts, winter elements
  If the user mentions a specific festival, use ONLY that festival's visual elements.

`;
  }

  prompt += `Return this EXACT JSON structure (no extra fields, no markdown):
{
  "usable": boolean,
  "rejectionReason": string | null,
  "primaryImageIndex": number,
  "primaryImageReason": string,
  "productName": string,
  "brandName": string | null,
  "productType": string,
  "specificDescription": string,
  "productCategory": "food" | "jewellery" | "garment" | "skincare" | "candle" | "bag" | "home_goods" | "electronics" | "handicraft" | "other",
  "dominantColors": string[],
  "material": string,
  "shape": string,
  "keyVisualElements": string[],
  "productComponents": string[],
  "visibleText": string[],
  "productPhysicalSize": "tiny" | "small" | "medium" | "large",
  "productDimensionality": "flat_2d" | "shallow_3d" | "deep_3d",
  "recommendedCanvasFill": number,
  "isTransparent": boolean,
  "isColdBeverage": boolean,
  "hasBranding": boolean,
  "brandingConfidence": number,
  "brandElements": string[],
  "brandingInventory": [
    { "text": string, "type": "brand_name" | "tagline" | "ingredient" | "certification" | "weight" | "barcode" | "other", "prominence": "dominant" | "secondary" | "small_print" }
  ],
  "referenceImageRanking": [
    { "index": number, "valueScore": number, "uniqueInfo": string }
  ],
  "crossAngleInsights": string,
  "angleQualities": [
    { "index": number, "quality": "excellent" | "good" | "usable" | "poor", "bestFor": string }
  ],
  "servingTemperature": "hot" | "cold" | "room_temperature" | "frozen" | "not_applicable",
  "consumptionMethod": string,
  "typicalSetting": string,
  "servingVessel": string,
  "utensils": string,
  "usageOccasion": string,
  "productState": string,
  "targetAudience": string,
  "priceSegment": "budget" | "mid_range" | "premium" | "luxury",
  "desiredEmotion": string,
  "heroMoment": string,
  "emotionalTrigger": "craving" | "desire" | "energy" | "comfort" | "luxury" | "freshness" | "joy" | "confidence" | "warmth" | "power" | "serenity" | "excitement" | "nostalgia" | "sophistication" | "playfulness" | "wonder",
  "storyScene": string,
  "creativeBrief": string,
  "dynamicElements": string[],
  "scenePrompt": string,
  "backgroundOnlyPrompt": string,
  "hasGlare": boolean,
  "inputAngleQuality": "good" | "suboptimal" | "unusable",
  "adBestPractices": string
}`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Fallback profile builder from V3 result
// ---------------------------------------------------------------------------

function buildFallbackFromV3(
  v3Result: Awaited<ReturnType<typeof analyzeAndPlanV3>>,
): ProductProfileV4 {
  return ProductProfileV4Schema.parse({
    usable: v3Result.usable,
    rejectionReason: v3Result.rejectionReason,
    primaryImageIndex: 0,
    primaryImageReason: 'Fallback to V3 single-image analysis — V4 Gemini call failed.',
    productName: v3Result.analysis.productName,
    brandName: v3Result.analysis.brandName,
    productType: v3Result.analysis.productType,
    specificDescription: v3Result.analysis.specificDescription,
    productCategory: v3Result.productCategory,
    dominantColors: v3Result.analysis.dominantColors,
    material: v3Result.analysis.material,
    shape: v3Result.analysis.shape,
    keyVisualElements: v3Result.analysis.keyVisualElements,
    productComponents: v3Result.analysis.productComponents,
    visibleText: v3Result.analysis.visibleText,
    productPhysicalSize: v3Result.productPhysicalSize,
    productDimensionality: v3Result.productDimensionality,
    recommendedCanvasFill: v3Result.recommendedCanvasFill,
    isTransparent: v3Result.isTransparent,
    isColdBeverage: v3Result.isColdBeverage,
    hasBranding: v3Result.hasBranding,
    brandingConfidence: v3Result.brandingConfidence,
    brandElements: v3Result.brandElements,
    brandingInventory: [],
    referenceImageRanking: [],
    crossAngleInsights: 'Single image analyzed via V3 fallback — no cross-angle synthesis possible.',
    angleQualities: [{
      index: 0,
      quality: v3Result.inputAngleQuality === 'good'
        ? 'excellent'
        : v3Result.inputAngleQuality === 'suboptimal'
          ? 'usable'
          : 'poor',
      bestFor: 'primary product view',
    }],
    servingTemperature: v3Result.analysis.servingTemperature,
    consumptionMethod: v3Result.analysis.consumptionMethod,
    typicalSetting: v3Result.analysis.typicalSetting,
    servingVessel: v3Result.analysis.servingVessel,
    utensils: v3Result.analysis.utensils,
    usageOccasion: v3Result.analysis.usageOccasion,
    productState: v3Result.analysis.productState,
    targetAudience: v3Result.analysis.targetAudience,
    priceSegment: v3Result.analysis.priceSegment,
    desiredEmotion: v3Result.analysis.desiredEmotion,
    heroMoment: v3Result.heroMoment,
    emotionalTrigger: v3Result.emotionalTrigger,
    storyScene: v3Result.storyScene,
    creativeBrief: v3Result.creativeBrief,
    dynamicElements: v3Result.dynamicElements,
    scenePrompt: v3Result.scenePrompt,
    backgroundOnlyPrompt: v3Result.backgroundOnlyPrompt,
    hasGlare: v3Result.hasGlare,
    inputAngleQuality: v3Result.inputAngleQuality,
    adBestPractices: v3Result.analysis.adBestPractices,
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function analyzeProductV4(
  imageBuffers: Buffer[],
  voiceInstructions?: string,
  style?: string,
): Promise<ProductProfileV4> {
  if (imageBuffers.length === 0) {
    throw new Error('analyzeProductV4: at least one image buffer is required');
  }

  const startMs = Date.now();
  const imageCount = imageBuffers.length;

  const clampPrimaryIndex = (profile: ProductProfileV4): ProductProfileV4 => {
    if (profile.primaryImageIndex >= imageCount) {
      return { ...profile, primaryImageIndex: 0 };
    }
    return profile;
  };

  // -------------------------------------------------------------------
  // Fast path: single image — use V4 prompt (still asks all creative
  // fields) but with simplified multi-angle sections
  // -------------------------------------------------------------------

  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  const prompt = buildV4Prompt(imageCount, style, voiceInstructions);

  // Build parts: all images first, then the text prompt
  const imageParts = imageBuffers.map(buf => ({
    inlineData: {
      mimeType: detectMime(buf),
      data: buf.toString('base64'),
    },
  }));

  const TIMEOUT_MS = imageBuffers.length >= 3 ? 60_000 : 30_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`analyzeProductV4 timed out after ${TIMEOUT_MS / 1000}s`)),
      TIMEOUT_MS,
    ),
  );

  let rawText: string;
  try {
    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              ...imageParts,
              { text: prompt },
            ],
          },
        ],
      }),
      timeoutPromise,
    ]);
    rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch (err) {
    // Graceful fallback: use V3 single-image analyzer on first image
    console.error(JSON.stringify({
      event: 'v4_gemini_failed',
      imageCount,
      error: err instanceof Error ? err.message : String(err),
      fallback: 'analyzeAndPlanV3 on first image',
    }));
    const v3 = await analyzeAndPlanV3(imageBuffers[0]!, voiceInstructions, style);
    return clampPrimaryIndex(buildFallbackFromV3(v3));
  }

  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(JSON.stringify({
      event: 'v4_parse_failed',
      imageCount,
      rawPreview: rawText.slice(0, 300),
      fallback: 'analyzeAndPlanV3 on first image',
    }));
    const v3 = await analyzeAndPlanV3(imageBuffers[0]!, voiceInstructions, style);
    return clampPrimaryIndex(buildFallbackFromV3(v3));
  }

  const result = ProductProfileV4Schema.safeParse(parsed);
  if (!result.success) {
    console.error(JSON.stringify({
      event: 'v4_schema_failed',
      imageCount,
      error: result.error.message,
      fallback: 'analyzeAndPlanV3 on first image',
    }));
    const v3 = await analyzeAndPlanV3(imageBuffers[0]!, voiceInstructions, style);
    return clampPrimaryIndex(buildFallbackFromV3(v3));
  }

  const profile = clampPrimaryIndex(result.data);

  console.info(JSON.stringify({
    event: 'v4_analyze_complete',
    imageCount,
    primaryImageIndex: profile.primaryImageIndex,
    productName: profile.productName,
    category: profile.productCategory,
    hasBranding: profile.hasBranding,
    brandingConfidence: profile.brandingConfidence,
    brandingInventoryCount: profile.brandingInventory.length,
    referenceImageCount: profile.referenceImageRanking.length,
    crossAngleInsights: profile.crossAngleInsights.slice(0, 120),
    heroMoment: profile.heroMoment.slice(0, 80),
    emotionalTrigger: profile.emotionalTrigger,
    dynamicElementCount: profile.dynamicElements.length,
    creativeBriefPreview: profile.creativeBrief.slice(0, 100),
    usable: profile.usable,
    style: style ?? 'default',
    durationMs: Date.now() - startMs,
  }));

  return profile;
}
