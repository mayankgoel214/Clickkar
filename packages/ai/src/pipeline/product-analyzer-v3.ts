import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

// Re-export the base types from V2 for shared schema fields
export type { ProductAnalysis } from './product-analyzer.js';

// ---------------------------------------------------------------------------
// V3 Schema — extends V2 with creative concept fields
// ---------------------------------------------------------------------------

const ProductAnalysisSchema = z.object({
  productName: z.string(),
  brandName: z.string().nullable(),
  productType: z.string(),
  specificDescription: z.string(),
  dominantColors: z.union([z.array(z.string()), z.string()]).transform(v => Array.isArray(v) ? v : [v]),
  material: z.string(),
  shape: z.string(),
  keyVisualElements: z.union([z.array(z.string()), z.string()]).transform(v => Array.isArray(v) ? v : [v]),
  productComponents: z.union([z.array(z.string()), z.string()]).transform(v => Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v]).catch([]).describe('List of all visible physical sub-components: caps, lids, straws, cables, stands, boxes, tags, applicators'),
  visibleText: z.union([z.array(z.string()), z.string()]).transform(v => Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v]),
  targetAudience: z.string(),
  priceSegment: z.string().transform(v => {
    const valid = ['budget', 'mid_range', 'premium', 'luxury'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'mid_range';
  }),
  salesChannel: z.string(),
  desiredEmotion: z.string(),
  recommendedScene: z.object({
    surface: z.string(),
    background: z.string(),
    lighting: z.string(),
    colorPalette: z.string(),
    props: z.union([z.array(z.string()), z.string()]).transform(v => Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v]),
    mood: z.string(),
    photographyStyle: z.string(),
  }),
  category: z.string().transform(v => {
    const valid = ['food', 'jewellery', 'garment', 'skincare', 'candle', 'bag', 'home_goods', 'electronics', 'handicraft', 'other'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'other';
  }),
  adBestPractices: z.string(),
});

const AnalyzeAndPlanV3Schema = z.object({
  // Input QA (same as V2)
  usable: z.boolean(),
  rejectionReason: z.string().nullable(),
  productCategory: z.string().transform(v => {
    const valid = ['food', 'jewellery', 'garment', 'skincare', 'candle', 'bag', 'home_goods', 'electronics', 'handicraft', 'other'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'other';
  }),

  // Branding detection (same as V2)
  hasBranding: z.boolean(),
  brandingConfidence: z.number().catch(0.5).transform(v => Math.max(0, Math.min(1, v))),
  brandElements: z.union([z.array(z.string()), z.string()]).transform(v => Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v]),

  // Input quality (same as V2)
  hasGlare: z.boolean(),
  inputAngleQuality: z.string().transform(v => {
    const valid = ['good', 'suboptimal', 'unusable'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'good';
  }),

  // Physical characteristics (same as V2)
  productPhysicalSize: z.string().transform(v => {
    const valid = ['tiny', 'small', 'medium', 'large'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'medium';
  }),
  productDimensionality: z.string().transform(v => {
    const valid = ['flat_2d', 'shallow_3d', 'deep_3d'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'shallow_3d';
  }),
  recommendedCanvasFill: z.number().catch(0.65).transform(v => Math.max(0.3, Math.min(0.95, v))),

  // Product analysis (same as V2)
  analysis: ProductAnalysisSchema,

  // V2 prompts (kept for compatibility)
  scenePrompt: z.string(),
  backgroundOnlyPrompt: z.string(),

  // --- V3 CREATIVE CONCEPT FIELDS (NEW) ---

  isColdBeverage: z.boolean().catch(false),

  heroMoment: z.string(),
  dynamicElements: z.union([z.array(z.string()), z.string()]).transform(v => Array.isArray(v) ? v : [v]),
  emotionalTrigger: z.string().transform(v => {
    const valid = ['craving', 'desire', 'energy', 'comfort', 'luxury', 'freshness', 'joy', 'confidence', 'warmth', 'power', 'serenity', 'excitement', 'nostalgia', 'sophistication', 'playfulness', 'wonder'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'desire';
  }),
  storyScene: z.string(),
  creativeBrief: z.string(),
});

export type AnalyzeAndPlanV3Result = z.infer<typeof AnalyzeAndPlanV3Schema>;

// ---------------------------------------------------------------------------
// Style Narrative Pools — multiple alternative narratives per style + category
// Each call randomly selects ONE narrative per category for creative variety.
// Format: EMOTION first → TECHNIQUES to combine → SPECIFIC elements
// ---------------------------------------------------------------------------

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
      `WORKSPACE CURATED. Techniques: DESK SCENE + NATURAL WINDOW LIGHT + LIFESTYLE CONTEXT. Product on a curated workspace desk beside a steaming coffee cup, a leather notebook, and a potted succulent. Natural window light from the side, 4000K. Shallow DOF blurring the monitor and wall art behind. Productive, aspirational energy.`,
      `MORNING COUNTER. Techniques: KITCHEN/BATHROOM CONTEXT + MORNING LIGHT + CASUAL PLACEMENT. Product placed casually on a marble kitchen counter or bathroom shelf beside contextual items (toothbrush holder, fruit bowl, soap dish). Soft morning light streaming from a window. The scene feels lived-in, real, relatable.`,
      `CAFE TABLE. Techniques: WARM AMBIANCE + BACKGROUND BOKEH + INTIMATE FRAMING. Product on a round cafe table, a latte with art beside it, warm pendant lamp overhead. The cafe interior dissolves into creamy warm bokeh behind — other patrons, shelves, hanging plants all softened. Intimate, inviting atmosphere.`,
      `BEDSIDE STYLING. Techniques: NIGHTSTAND SCENE + EVENING LAMP + COZY DEPTH. Product on a styled bedroom nightstand beside a stack of books, a small plant, and reading glasses. Warm evening lamp glow from behind the product creating a rim of amber light. Soft linen textures. The viewer wants this exact quiet evening.`,
    ],
    beverage_cold: [
      `GYM COUNTER ENERGY. Techniques: HARSH GYM FLUORESCENT LIGHT + WORKOUT PROPS + CONDENSATION CLOSE-UP. The cold can sits on a gym counter on top of a folded gym towel, beside wireless earbuds and a chalk-dusted weight clip. Harsh overhead fluorescent creates cool-white rim highlights on the beaded condensation. Blurred barbells and cable machines in background bokeh. Cold, refreshing, high-energy — the reward after the grind.`,
      `SKATE RAMP EDGE. Techniques: AFTERNOON BACKLIGHT + URBAN CONCRETE + MOTION BLUR BACKGROUND. The can rests on the concrete edge of a skate ramp, catching afternoon sun from behind that creates a glowing rim on every condensation droplet. The blurred shapes of skaters mid-trick fill the background. Worn grip tape and chalk on the concrete below. Raw urban energy — cold, charged, alive.`,
      `ROOFTOP CITY VIEW. Techniques: GOLDEN HOUR BACKLIGHT + CITY BOKEH + COLD SWEAT DETAIL. The chilled can stands on a rooftop ledge with a warm golden hour sun behind it, creating a halo of light around the can. City skyline dissolves into golden bokeh behind. Frost rings on the ledge surface from where the cold can rested moments ago. Aspirational, energetic, urban freedom.`,
    ],
  },

  style_gradient: {
    food: [
      `SINFUL INDULGENCE. Techniques: INGREDIENT EXPLOSION + DARK REFLECTIVE SURFACE + DUAL RIM LIGHTING. Pitch black background. Product on polished black acrylic creating a mirror reflection below. Raw ingredients EXPLODING outward from the product — nuts, chocolate shards, fruit slices, spice particles frozen mid-air in the rim light. Two strip softbox rim lights from behind-left and behind-right creating razor-sharp glowing edges. Dust particles and powder caught floating in the light beams.`,
      `FROZEN POUR. Techniques: LIQUID SPLASH + HARD OVERHEAD SPOTLIGHT + DARK VOID. Dark void background. A liquid pour — milk, honey, chocolate sauce — frozen mid-cascade over the product from directly above. Single hard spotlight from overhead catches every droplet in crystalline detail. The liquid crown splash is the hero element. Wet surface below with authentic splash scatter.`,
      `SMOKE AND HEAT. Techniques: BLACK MARBLE + RISING STEAM + AMBER UNDERLIGHTING. Product on black marble surface. Steam or smoke rising from behind and around the product, caught in warm amber accent light coming from below and behind. The steam creates depth layers against the darkness. Surface shows authentic condensation. Moody, sultry, indulgent.`,
      `LEVITATION BEAM. Techniques: SPOTLIGHT CONE + SUSPENDED INGREDIENTS + DUST PARTICLES. Dark gradient background. Product at center with its key ingredients levitating in a tight cone of hard spotlight — frozen mid-air as if gravity paused. Fine dust particles caught in the beam creating visible light rays. Everything outside the cone is pitch black. Dramatic, theatrical, otherworldly.`,
      `WET OBSIDIAN. Techniques: WET BLACK SURFACE + CONDENSATION + COOL RIM LIGHT. Product on wet black obsidian surface, beaded with condensation droplets — each one a tiny lens reflecting the product. Single cool blue-white rim light from behind creating a sharp edge glow. The wet surface reflects the product in a dark, distorted mirror. Cold, refreshing, premium.`,
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
      `ROYAL OFFERING. Techniques: ORNATE GOLD TRAY + KUMKUM ACCENTS + LAYERED DIYAS. Product presented on an ornate gold-embossed tray with small kumkum and turmeric accents in brass bowls beside it. Multiple diyas at different depths create a cascade of warm golden light — foreground diyas slightly blurred, background diyas as bokeh orbs. Rich red velvet surface underneath. Opulent, auspicious, gift-worthy.`,
      `TEMPLE GLOW. Techniques: EMBROIDERED SILK + BRASS LAMP + MARIGOLD GARLAND. Product on heavily embroidered silk with gold zari work. A traditional brass lamp (samai/vilakku) providing warm directional glow from one side. A floating marigold garland draped in an arc around the product. Warm golden atmosphere with incense smoke wisps catching the lamp light. Sacred, reverent, beautiful.`,
      `HERITAGE WARMTH. Techniques: CARVED WOOD SURFACE + BRASSWARE PROPS + STRING LIGHTS. Product on a carved wooden surface (old chest or carved tray) with small brassware items — bells, small deity figures, betel nut box — arranged around it. Warm string lights woven through the background create a constellation of golden orbs. Saffron-gold warmth suffusing the entire scene. Nostalgic, celebratory, rich with heritage.`,
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
    default: [
      `ARCHITECTURAL STILLNESS. Techniques: SINGLE DIRECTIONAL LIGHT + DRAMATIC SHADOW + NEGATIVE SPACE. One hard light source from 60-80° creating a long, geometric shadow that IS the primary compositional element — the shadow is as important as the product itself. Product on raw concrete or honed stone. 60-70% of the frame is intentional empty space creating visual tension. Rule-of-thirds placement at the intersection. NO props, NO people, NO hands. The interplay of form, shadow, and void creates an architectural meditation. Zen, sophisticated, gallery-worthy.`,
    ],
  },

  style_with_model: {
    food: [
      `CAUGHT IN THE ACT OF ENJOYING — PERSON IS MANDATORY. Think about HOW this specific food is eaten and show THAT moment. Chips/snacks: person reaching into the bag, one chip near mouth, satisfied crunch expression. Cookies/sweets: person biting into one, eyes closed in satisfaction, crumbs on fingers. Drinks/beverages: person HOLDING the sealed product (cap ON) near face level, showing anticipation. If the product has a cap or lid in the input photo, it MUST remain attached — do NOT show the product open, mid-sip, or uncapped. Spices/cooking ingredients: person cooking, tasting from a spoon, steam rising. Protein bars/health food: person in gym clothes, post-workout, unwrapping it. The product AND its packaging must be clearly visible. NOT a posed smile — a REAL moment of enjoyment. Warm light, shallow DOF, contextual environment matching how the food is consumed.`,
    ],
    skincare: [
      `BEAUTY RITUAL IN ACTION — PERSON IS MANDATORY. Show the EXACT moment of using THIS specific product. Serum: person applying drops to face with the dropper, dewy skin glowing. Face cream: fingertips scooping from the jar, mid-application on cheek. Face wash: person at sink, foam on face, eyes closed. Sunscreen: person applying on arm/face before going outside. Lip product: person applying in front of mirror. Hair oil: person working it through hair. The product container MUST be prominently visible — either in hand or placed nearby on the vanity. Soft bathroom/vanity light. The viewer thinks "I want that glow."`,
    ],
    jewellery: [
      `ADORNED ELEGANCE — PERSON IS MANDATORY. Show the intimate moment of WEARING this jewelry. Necklace: Indian woman touching it at collarbone, looking down admiringly, tight crop collarbone-to-chin. Earrings: side profile or 3/4 view, tucking hair behind ear to reveal the earring. Ring: hand resting on a surface, ring catching light, or adjusting it. Bracelet/bangles: wrist visible while pouring chai or arranging flowers. The jewelry MUST be the brightest, sharpest element — hard accent light creating sparkle on gems. Soft key light on skin. Warm skin tones. Confidence, desire, beauty.`,
    ],
    electronics: [
      `IN THE ZONE — PERSON IS MANDATORY. Show the person ACTIVELY USING this specific device in its natural context. Headphones/earbuds: person with eyes closed, lost in music, slight head bob. Phone: person scrolling with a soft smile, screen glow on face. Speaker: person in living room, dancing or swaying to music. Fitness tracker/watch: person mid-workout, glancing at wrist. Laptop: person typing intently at a café, coffee nearby. Power bank: person charging phone at airport, waiting. Keyboard/mouse: person gaming or working, focused expression. The product enabling a genuine MOMENT. Warm-cool light contrast, shallow DOF.`,
    ],
    garment: [
      `WEARING IT AND LIVING IN IT — PERSON IS MANDATORY. Show the person in this garment caught in a REAL MOMENT of their life — not a fashion pose. Casual wear: person laughing with friends, walking on street, grabbing coffee. Ethnic wear (kurti/saree/lehenga): person adjusting dupatta, walking through a doorway, touching jewelry. Formal wear: person adjusting cuff, walking confidently, at a restaurant. Gym/activewear: person mid-exercise, stretching, running. Fabric catching natural movement — a slight breeze, a turn, a step. Blurred lifestyle background. Confidence and ease.`,
    ],
    candle: [
      `COZY MOMENT — PERSON IS MANDATORY. Show an Indian person in a cozy evening moment WITH the lit candle. Person curled up reading a book on the couch, candle glowing on the side table. Or person meditating with eyes closed, candle in foreground blur. Or person taking a relaxing bath, candle on the tub edge. The candle flame creates the warm ambient glow. Person looks peaceful, content, present. The viewer wants this exact evening.`,
    ],
    bag: [
      `ON THE MOVE — PERSON IS MANDATORY. Show the person CARRYING this bag in a real-life context. Backpack: person walking through a campus or hiking trail, looking over shoulder. Handbag: person walking in a market or café, bag on shoulder, reaching for something. Travel bag: person at airport, pulling it, with boarding pass visible. Laptop bag: person entering an office, bag slung over shoulder, coffee in hand. Clutch: person at an evening event, holding it while laughing. The bag is the style statement. Motion, energy, aspiration.`,
    ],
    default: [
      `PERSON USING THIS PRODUCT IS MANDATORY — AN IMAGE WITHOUT A PERSON IS A FAILURE FOR THIS STYLE.

Think creatively about HOW this specific product is used in real life, and show THAT exact moment:
- Perfume/fragrance: person spraying on wrist or neck, eyes closed savoring the scent, dresser/mirror behind
- Dumbbells/gym equipment: person mid-exercise with the equipment, sweat, gym environment
- Water bottle: person drinking after a run, wiping sweat
- Notebook/stationery: person writing, café setting, pen in hand
- Kitchenware: person cooking with it, steam rising, ingredients around
- Toys: child playing with it, joy on face, living room floor
- Tools: person using the tool, workshop environment
- Home decor: person arranging it on a shelf, stepping back to admire
- Sunglasses: person wearing them outdoors, golden hour light

The scene must match WHERE and HOW the product is naturally used. The person's expression must match the EMOTION of using it (satisfaction, focus, joy, confidence, relaxation). The product MUST be clearly visible and recognizable. Candid asymmetric expression. Shallow DOF. The person provides context and aspiration.`,
    ],
    beverage_cold: [
      `ENERGY CRACK — PERSON IS MANDATORY. A confident young person grips the COLD can firmly, caught mid-crack of opening it — the tab pulled back with a satisfying pop, eyes bright and alert, expression radiating energy and readiness. The can surface is beaded with condensation. NOT a serene savoring pose — this person is CHARGED UP and ready to go. Gym bag or outdoor background in shallow DOF. The can label faces camera.`,
      `POST-WORKOUT REFRESH — PERSON IS MANDATORY. A person in workout clothes, slightly sweaty and flushed, tilts the COLD can toward them with a wide refreshed grin — eyes open and energized, not closed and meditative. Condensation on the can surface, gym or outdoor context behind in soft focus. The energy is HIGH not calm — this is the reward that recharges, not the drink that relaxes. Can label clearly visible.`,
      `FRIENDS AND CANS — PERSON IS MANDATORY. One young person holds the COLD can casually at chest height with a side-profile laugh — genuinely mid-conversation, caught candid, expression electric with amusement and vitality. Outdoor urban setting. The can surface shows condensation catching afternoon light. Energetic, social, alive. NOT a café moment — this is outside, in motion, in life.`,
    ],
  },
};

// ---------------------------------------------------------------------------
// Style briefs — kept from V2 for photography specs (secondary to narrative)
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
// Few-shot creative concept examples
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
// Style Mandate Helper
// ---------------------------------------------------------------------------

function getStyleMandate(style: string): string {
  const mandates: Record<string, string> = {
    style_festive: 'FESTIVE/DIWALI SCENE: Warm diya glow (2700-3000K), cultural props (brass thali, marigold petals, rangoli), golden bokeh, rich jewel tones. Scene must feel like an Indian celebration/festival. NO modern/gym/office settings.',
    style_gradient: 'DARK LUXURY: Deep black or dark gradient background, dramatic rim lighting, reflective surface, minimal props. Moody, premium, cinematic feel. NO bright/outdoor/festive settings.',
    style_outdoor: 'NATURAL OUTDOOR: Golden-hour natural light, organic textures (wood, stone, leaves), real outdoor environment. NO studio/indoor settings.',
    style_lifestyle: 'LIFESTYLE SETTING: Warm home/cafe/workspace environment, natural light, lived-in feel with contextual props. Aspirational but relatable.',
    style_studio: `COLORED STUDIO: Clean colored backdrop — NEVER white or grey. Choose a SPECIFIC, BOLD color:
- For warm-toned products (gold, red, orange, brown): use cool backdrops (teal, navy, sage green, slate blue)
- For cool-toned products (blue, silver, white, green): use warm backdrops (terracotta, dusty rose, warm sand, burnt sienna)
- For neutral products: use bold saturated colors (deep teal, rich burgundy, emerald, royal purple)
State the EXACT color name in your creativeBrief. Professional studio lighting, product-focused.`,
    style_clean_white: 'CLEAN WHITE: Pure white background, soft even lighting, product floating or on minimal surface. E-commerce style.',
    style_minimal: 'MINIMAL & CLEAN: Muted neutral tones, very few props, lots of negative space, calm and elegant composition.',
    style_with_model: 'WITH HUMAN MODEL: An Indian person naturally interacting with the product. Lifestyle context appropriate to the product category.',
  };
  return mandates[style] ?? 'Follow the selected style closely.';
}

// ---------------------------------------------------------------------------
// V3 Prompt Builder
// ---------------------------------------------------------------------------

function buildV3Prompt(style?: string, voiceInstructions?: string): string {
  const styleKey = style ?? 'style_lifestyle';

  // Get the narrative pool for this style — randomly select ONE narrative per category
  const narrativeMap = STYLE_NARRATIVE_POOLS[styleKey] ?? STYLE_NARRATIVE_POOLS['style_lifestyle']!;
  const narrativeEntries = Object.entries(narrativeMap)
    .map(([cat, narratives]) => {
      const selected = narratives[Math.floor(Math.random() * narratives.length)]!;
      return `- IF ${cat.toUpperCase()}: ${selected}`;
    })
    .join('\n');

  const photoSpec = PHOTOGRAPHY_SPECS[styleKey] ?? PHOTOGRAPHY_SPECS['style_lifestyle']!;

  let prompt = `You are an elite advertising creative director AND product photographer. Your job is to conceive a COMPELLING advertisement concept — not just a nice photo, but an image that makes someone STOP SCROLLING and WANT this product.

Your response MUST be valid JSON only — no markdown, no explanation.

== MANDATORY STYLE: ${styleKey} ==
Every field you return — heroMoment, storyScene, creativeBrief, dynamicElements — MUST match this style.
${getStyleMandate(styleKey)}
Do NOT override this style based on product type. The user chose this style explicitly.

## STEP 1: Input Quality Assessment
- Is this photo usable? Reject only if: no product visible, extremely blurry (<100px), corrupted
- Accept messy backgrounds, poor lighting, bad angles — we fix everything
- "hasGlare": true if visible specular reflections or flash hotspots on product
- "inputAngleQuality": "good"/"suboptimal"/"unusable"

## STEP 2: Product Identification (be EXTREMELY specific)
Full brand name, product type, variant, size. NOT "speaker" but "Anker SoundCore 2 Portable Bluetooth Speaker, black mesh front, ANKER logo on face."
- productComponents: List EVERY visible physical sub-component of the product (cap, lid, straw, cable, stand, box, tag, applicator, tube, wrapper). Be exhaustive — if you can see it, list it.
- "isColdBeverage": Set to true if the product is ANY beverage that is served cold or at room temperature — this includes energy drink cans, soda cans, cola, sparkling water, juice bottles, water bottles, beer cans/bottles, sports drinks, iced tea, cold coffee cans, kombucha. Set to false for all non-beverages and for hot beverages (coffee sachets, tea bags, instant mixes meant to be made hot). When in doubt about whether it is a cold beverage, set to true.

## STEP 2.5: Physical Characteristics
- "productPhysicalSize": "tiny" (palm-sized) | "small" (hand-sized) | "medium" (forearm-sized) | "large" (bigger)
- "productDimensionality": "flat_2d" | "shallow_3d" | "deep_3d"
- "recommendedCanvasFill": 0.3-0.95 (tiny+flat=0.85, large=0.60)

## STEP 3: Branding Detection
- "hasBranding": true if ANY brand text/logo/mark visible
- "brandingConfidence": 0.0-1.0 (when uncertain, err HIGH — better to preserve than destroy)
- "brandElements": list every visible brand element

## STEP 4: Full Product Analysis
Deep analysis: colors, materials, textures, target audience, price segment, scene, ad best practices.

## STEP 5: CREATIVE CONCEPT (THIS IS THE MOST IMPORTANT STEP)

You are now the creative director. Your job is to design an advertisement that makes people WANT this product.

### 5a: Hero Moment
What single EMOTIONAL MOMENT should this ad capture? Not "product on a nice background" but a specific human moment that triggers desire. Examples: "the first sip of ice-cold lemonade on a hot day", "the satisfaction of biting into a warm cookie", "the quiet confidence of clasping on a precious necklace."

### 5b: Dynamic Elements
What specific MOTION, TEXTURE, or ACTION elements make this ad come alive? These are the details that separate a boring product photo from a COMPELLING advertisement. Examples: water splashes, crumbs scattered, steam rising, condensation droplets, ingredients mid-fall, fabric draping, sparkle on gems, smoke wisps, liquid pouring.

- VARIETY IN DYNAMIC ELEMENTS: Do NOT default to "mist" or "fog" for every style. Each style should have its own signature dynamic elements:
  - Clean White: subtle reflection/shadow ONLY — no mist, no fog, no particles
  - Studio: light play on colored surface, product shadow — no mist
  - Gradient/Dark Luxury: splashes, particles, rim-light flares — mist is OK here
  - Lifestyle: steam from coffee, crumbs, spilled ingredients — contextual to the product's USE
  - Outdoor: wind-blown elements, natural light flares, pollen — no artificial mist
  - Festive: diya smoke, floating petals, sparkles — no cold mist
  - Minimal: shadow ONLY — absolutely nothing else in the scene
  - With Model: person's natural environment — no artificial atmospheric effects

The style is FIXED as ${styleKey}. You MUST use ONLY these elements — do NOT invent a different setting or context.
IMPORTANT: If the product is a cold beverage (isColdBeverage = true), you MUST use the BEVERAGE_COLD narrative instead of the DEFAULT narrative:
${narrativeEntries}

### 5c: Emotional Trigger
What should the viewer FEEL? One of: craving, desire, energy, comfort, luxury, freshness, joy, confidence, warmth, power, serenity, excitement, nostalgia, sophistication, playfulness, wonder

### 5d: Story Scene
Describe what is HAPPENING in this image in 2-3 sentences. Not camera specs — the SCENE. What objects are where? What action is frozen? What's the setting?

### 5e: Creative Brief
Write a 120-180 word VIVID scene description for the AI image generator. Start with "Editorial product advertisement." then describe the physical scene: surface, product position, dynamic elements, lighting direction and color temperature, lens/DOF. Be SPECIFIC about what is WHERE — not flowery prose. This goes directly to the image generator.

IMPORTANT: The product must look like a PHOTOGRAPHED physical object — NOT a 3D render. Include material cues in the brief: "packaging catches key light with specular highlights", "slight dimensional bulging from contents", "visible crinkle texture on foil/plastic", "glass surface shows reflections", "metal has natural sheen". The product should look premium and beautiful but REAL — like a high-end photoshoot, not a CGI illustration.

${photoSpec}

${FEW_SHOT_EXAMPLES}

### 5f: Scene Prompt (40-70 words)
A concise creative ad scene description for image generation. Focus on the STORY and DYNAMIC ELEMENTS, not camera specs.

### 5g: Background-Only Prompt (40-70 words)
An EMPTY scene matching the style with NO product. "no products, no objects in center, clear negative space."

## COLD BEVERAGE RULES (apply ONLY when isColdBeverage is true):
If this product is a cold beverage (isColdBeverage = true), ALL of the following are MANDATORY in every generated field (heroMoment, dynamicElements, storyScene, creativeBrief):
- NEVER add steam, smoke, heat haze, or any heat-implying atmospheric effect near or around the product
- The can or bottle MUST appear COLD and CHILLED — show condensation droplets, frost, ice cubes, cold mist at the base, or frost rings on the surface beneath the can
- Do NOT place the product in a café, coffee shop, or any setting associated with hot beverages
- Do NOT use props that suggest hot beverages (coffee cups, teapots, chai glasses, mugs of steaming liquid)
- For style_with_model: the model's expression and pose MUST convey ENERGY and VITALITY — wide alert eyes, dynamic posture, energized expression. NOT serene, meditative, or savoring-like-tea. Think: "just cracked open, ready to go" not "slowly sipping warm tea"
- For style_lifestyle and style_gradient: use cold-environment props (ice, condensation, gym gear, outdoor urban settings, earbuds, towels, workout accessories) instead of warm home/café props
- The emotional trigger MUST be "energy", "freshness", "excitement", or "power" — NEVER "warmth", "comfort", or "serenity"

## RULES FOR THE CREATIVE BRIEF:
CRITICAL CONSTRAINT FOR CREATIVE BRIEF: The creative brief must NEVER describe the product differently from how it appears in the input photo. Do not invent details, simplify the product, or change its design. The brief should describe the SCENE and ENVIRONMENT around the product, not redesign the product itself. Every physical detail of the product (shape, color, material, components, text) must remain exactly as photographed.
- CONDENSATION/WATER DROPLETS: Only add condensation, water droplets, or dewy surfaces if the product is a BEVERAGE CONTAINER (bottle, tumbler, can, glass) or a FOOD/DRINK product. For ALL other product categories (jewellery, electronics, candles, bags, garments, skincare, home decor), the product surface must remain DRY. Do not add water droplets to products that would never be wet in real life.
- EXACTLY ONE product in the image — NEVER duplicate or clone
- Product is the HERO — fills the recommended canvas percentage
- Product MUST obey gravity (lies flat, leans, or stands on base)
- Product matches original photo EXACTLY — same shape, colors, text, logos
- The image is EDGE TO EDGE — NO borders, frames, picture-frame effects, or decorative edges anywhere
- Do NOT add ANY text, watermarks, labels, attribution text, "AI Generated" text, or copyright notices ANYWHERE
- No illustrated or cartoon elements — everything is photorealistic
- Include natural photographic imperfections: "subtle film grain at full resolution", "dust motes in rim light", "slight vignetting at edges", "surfaces show micro-texture and real-world wear"
- Frame as describing a photograph that ALREADY EXISTS
- End with: "Square format, 1:1 aspect ratio."
- CRITICAL PERSON RULE:
  - If style is "style_with_model": You MUST include exactly ONE Indian person actively interacting with the product. This is MANDATORY — the creative brief, story scene, and hero moment MUST describe a person using/wearing/holding the product. Describe their age, gender, expression, clothing, skin tone, and how they interact with the product. Realistic features: visible pores, asymmetric candid smile, flyaway hair strands. Grip matches product size/weight.
  - For ALL other styles (style_studio, style_gradient, style_lifestyle, style_outdoor, style_festive, style_clean_white, style_minimal): ZERO people, ZERO hands, ZERO body parts, ZERO mannequins. The product sits on a surface or in an environment — NEVER on a person.

`;

  if (voiceInstructions && voiceInstructions.trim().length > 0) {
    const sanitizedInstructions = voiceInstructions
      .trim()
      .slice(0, 500)
      .replace(/[\x00-\x1F\x7F]/g, '') // strip control characters
      .replace(/\n{3,}/g, '\n\n'); // collapse excessive newlines
    prompt += `\nUser's additional instructions (incorporate into concept): ${sanitizedInstructions}\n\n`;
  }

  prompt += `Return this exact JSON structure:
{
  "usable": boolean,
  "rejectionReason": string | null,
  "productCategory": "food" | "jewellery" | "garment" | "skincare" | "candle" | "bag" | "home_goods" | "electronics" | "handicraft" | "other",
  "hasBranding": boolean,
  "brandingConfidence": number,
  "brandElements": string[],
  "hasGlare": boolean,
  "inputAngleQuality": "good" | "suboptimal" | "unusable",
  "productPhysicalSize": "tiny" | "small" | "medium" | "large",
  "productDimensionality": "flat_2d" | "shallow_3d" | "deep_3d",
  "recommendedCanvasFill": number,
  "analysis": {
    "productName": string,
    "brandName": string | null,
    "productType": string,
    "specificDescription": string,
    "dominantColors": string[],
    "material": string,
    "shape": string,
    "keyVisualElements": string[],
    "productComponents": string[],
    "visibleText": string[],
    "targetAudience": string,
    "priceSegment": "budget" | "mid_range" | "premium" | "luxury",
    "salesChannel": string,
    "desiredEmotion": string,
    "recommendedScene": {
      "surface": string,
      "background": string,
      "lighting": string,
      "colorPalette": string,
      "props": string[],
      "mood": string,
      "photographyStyle": string
    },
    "category": "food" | "jewellery" | "garment" | "skincare" | "candle" | "bag" | "home_goods" | "electronics" | "handicraft" | "other",
    "adBestPractices": string
  },
  "isColdBeverage": boolean,
  "scenePrompt": string,
  "backgroundOnlyPrompt": string,
  "heroMoment": string,
  "dynamicElements": string[],
  "emotionalTrigger": "craving" | "desire" | "energy" | "comfort" | "luxury" | "freshness" | "joy" | "confidence" | "warmth" | "power" | "serenity" | "excitement" | "nostalgia" | "sophistication" | "playfulness" | "wonder",
  "storyScene": string,
  "creativeBrief": string
}`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// V3 Consolidated Analysis
// ---------------------------------------------------------------------------

export async function analyzeAndPlanV3(
  imageBuffer: Buffer,
  voiceInstructions?: string,
  style?: string
): Promise<AnalyzeAndPlanV3Result> {
  const startMs = Date.now();

  const genai = new GoogleGenAI({
    apiKey: process.env['GOOGLE_AI_API_KEY'] ?? process.env['GOOGLE_GENAI_API_KEY'] ?? '',
  });

  const base64Image = imageBuffer.toString('base64');
  const mimeType = detectMime(imageBuffer);

  const prompt = buildV3Prompt(style, voiceInstructions);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('analyzeAndPlanV3 timed out after 60s')), 60_000)
  );
  const response = await Promise.race([
    genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Image } },
            { text: prompt },
          ],
        },
      ],
    }),
    timeoutPromise,
  ]);

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON for analyzeAndPlanV3: ${rawText.slice(0, 300)}`);
  }

  const result = AnalyzeAndPlanV3Schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`analyzeAndPlanV3 schema validation failed: ${result.error.message}`);
  }

  console.info(JSON.stringify({
    event: 'v3_analyze_and_plan_complete',
    usable: result.data.usable,
    productName: result.data.analysis.productName,
    category: result.data.productCategory,
    hasBranding: result.data.hasBranding,
    brandingConfidence: result.data.brandingConfidence,
    heroMoment: result.data.heroMoment.slice(0, 80),
    emotionalTrigger: result.data.emotionalTrigger,
    dynamicElementCount: result.data.dynamicElements.length,
    storyScenePreview: result.data.storyScene.slice(0, 100),
    creativeBriefPreview: result.data.creativeBrief.slice(0, 100),
    style: style ?? 'default',
    durationMs: Date.now() - startMs,
  }));

  return result.data;
}
