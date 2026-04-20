import { GoogleGenAI } from '@google/genai';
import { getProviderKey } from '@autmn/keypool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
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

export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;

// Consolidated output — single Gemini call returns everything
const AnalyzeAndPlanSchema = z.object({
  // Input QA
  usable: z.boolean(),
  rejectionReason: z.string().nullable(),
  productCategory: z.string().transform(v => {
    const valid = ['food', 'jewellery', 'garment', 'skincare', 'candle', 'bag', 'home_goods', 'electronics', 'handicraft', 'other'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'other';
  }),

  // Branding detection
  hasBranding: z.boolean(),
  brandingConfidence: z.number().catch(0.5).transform(v => Math.max(0, Math.min(1, v))),
  brandElements: z.union([z.array(z.string()), z.string()]).transform(v => Array.isArray(v) ? v : v === 'none' || v === '' ? [] : [v]),

  // Input quality
  hasGlare: z.boolean(),
  inputAngleQuality: z.string().transform(v => {
    const valid = ['good', 'suboptimal', 'unusable'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'good';
  }),

  // Physical characteristics (pipeline routing)
  productPhysicalSize: z.string().transform(v => {
    const valid = ['tiny', 'small', 'medium', 'large'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'medium';
  }),
  productDimensionality: z.string().transform(v => {
    const valid = ['flat_2d', 'shallow_3d', 'deep_3d'] as const;
    return valid.includes(v as any) ? v as typeof valid[number] : 'shallow_3d';
  }),
  recommendedCanvasFill: z.number().catch(0.65).transform(v => Math.max(0.3, Math.min(0.95, v))),

  // Product analysis
  analysis: ProductAnalysisSchema,

  // Creative prompts
  scenePrompt: z.string(),
  backgroundOnlyPrompt: z.string(),
  creativeBrief: z.string(),
});

export type AnalyzeAndPlanResult = z.infer<typeof AnalyzeAndPlanSchema>;

// ---------------------------------------------------------------------------
// Consolidated prompt — replaces 3 separate Gemini calls
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Style-specific technical briefs — exact photographic specifications
// ---------------------------------------------------------------------------

const STYLE_BRIEFS: Record<string, string> = {
  style_clean_white: `STYLE: PREMIUM STUDIO WHITE — E-Commerce Hero Shot

CONCEPT: Apple-product-page level studio photography. The product must look like it was shot in a $10,000/day studio. Clean but NOT boring — the lighting IS the creativity.

SURFACE: Seamless white acrylic panel with subtle mirror-like REFLECTION of the product's underside visible. Product appears to hover 2-3mm above — a thin gradient shadow separates product from its reflection. Surface has a gentle sheen, NOT matte paper.

BACKGROUND: Pure white (#FFFFFF) blown out 1.5 stops. Seamless infinity sweep — no visible horizon line.

LIGHTING: Key — large 120cm octabox at 45° front-left, feathered for gradient illumination. Fill — white V-flat opposite at 2:1 ratio. Accent — overhead strip softbox creating a specular highlight line along product top edge. 5600K daylight balanced. Glass/metallic products show controlled reflections with visible light source shapes.

SHADOW: Soft gradient contact shadow beneath product, fading to transparent within 15% of product height. NO hard drop shadow. Grounds the product while maintaining floating premium feel.

PROPS: ABSOLUTELY NONE. Product only.

CATEGORY-SPECIFIC ANGLE:
- IF food/beverage bottle → 3/4 hero angle (15-20° above, 30° rotated) showing label and cap. Label MUST be readable.
- IF jewellery → Flat lay overhead OR 15° angle for rings/watches.
- IF garment → Flat lay perfectly styled, sleeves folded with intention, overhead 90°.
- IF skincare/cosmetics → 3/4 hero angle showing label and cap.
- IF electronics → Eye-level to 10° above, showing primary interface/screen.
- IF bag/wallet → 3/4 angle showing front face and side depth.
- DEFAULT → 3/4 hero angle (20° above, 25° rotated).

MOOD: Premium, trustworthy, detail-obsessed. Makes a Rs 200 product look Rs 2000.

PHYSICS: Product MUST obey gravity. It lies flat, leans against a surface, or stands on a flat base. NEVER balanced on its tip or at impossible angles. Cylindrical products (pens, tubes, bottles without flat bases) MUST lie on their side.

NEVER: Add any props or colored backgrounds. Never use matte paper — always reflective acrylic. Never blow out label text with harsh specular hotspots. Never add text or watermarks.`,

  style_studio: `STYLE: COLORED STUDIO — Professional Campaign Shot

CONCEPT: Professional studio photography with a COLORED seamless paper backdrop. NOT white — a deliberate color choice that complements the product. Think high-end brand campaign with intentional art direction.

SURFACE: Product rests naturally on the seamless paper sweep where it curves from floor to wall. Subtle contact shadow grounds the product. Surface has a matte or satin finish.

BACKGROUND: Seamless colored paper or painted backdrop. Choose a color that creates CONTRAST with the product:
- Dark products (black, navy) → warm muted tones (dusty rose, sage green, warm sand, terracotta)
- Light/white products → rich deep tones (navy, forest green, burgundy, charcoal)
- Colorful products → complementary or neutral muted tones (warm grey, cream, slate)
The background should be a single unified color with subtle lighting variation — slightly brighter in center, darker at edges. Seamless infinity sweep — no visible horizon line.

LIGHTING: Three-point studio setup. Key — large softbox 45° front-left for even illumination. Fill — reflector card opposite at 3:1 ratio. Rim/hair light from behind for edge separation. 5500K daylight balanced. Clean, professional, studio strobe quality.

SHADOW: Clean contact shadow on the backdrop surface. Natural and grounded. Shadow should be soft and directional, following the key light.

PROPS: ABSOLUTELY NONE. Product only against the colored backdrop.

CATEGORY-SPECIFIC ANGLE:
- IF food/beverage → 3/4 hero angle (15-20° above, 30° rotated) showing label.
- IF jewellery → Flat lay or 15° angle on contrasting colored surface.
- IF garment → Flat lay, sleeves folded with intention, overhead 90°.
- IF skincare/cosmetics → 3/4 hero angle showing label and packaging.
- IF electronics → Eye-level to 10° above, showing primary interface.
- DEFAULT → 3/4 hero angle (20° above, 25° rotated).

MOOD: Confident, editorial, art-directed. The color backdrop makes the product POP.

PHYSICS: Product MUST obey gravity. It lies flat, leans against a surface, or stands on a flat base. NEVER balanced on its tip or at impossible angles. Cylindrical products (pens, tubes, bottles without flat bases) MUST lie on their side.

NEVER: Use white backgrounds (that's clean_white style). Never use busy patterns. Never add props. Never make the backdrop color clash with the product. Never blow out label text.`,

  style_gradient: `STYLE: DRAMATIC DARK — Luxury Campaign

CONCEPT: Perfume ad meets premium liquor campaign. Cinematic, high-contrast, the product GLOWS against darkness. Think Tom Ford, Hennessy, Bang & Olufsen advertising.

SURFACE: Polished black acrylic or wet obsidian showing a SHARP mirror reflection of the product beneath it. A few precisely placed water droplets or gold dust particles on the surface catch the rim light.

BACKGROUND: Deep black-to-charcoal radial gradient, darkest at edges. No visible detail. Subtle atmospheric haze or fine dust particles visible ONLY where rim light cuts through behind the product.

LIGHTING: Two strip softbox rim lights from behind-left and behind-right creating GLOWING edges on product silhouette. Minimal fill — 8:1+ contrast ratio. Deep intentional shadows. Subtle warm key from front-left reveals just enough product detail.

CATEGORY-SPECIFIC TREATMENTS:
- IF food/beverage → Warm amber rim lights (3200K). Condensation droplets on bottle surface catching light. Subtle steam or cold mist rising. Surface: wet black stone. Mood: indulgent, late-night.
- IF electronics → Cool blue-white rim lights (7000K). Matte black surface, no reflection. Thin blue LED accent in background. Mood: futuristic, powerful.
- IF jewellery → Single dramatic spotlight from above-right creating cone of light. Dark velvet surface. Micro-sparkle on gemstones. Scattered gold dust. Mood: desire, exclusivity.
- IF skincare/cosmetics → Warm-cool split lighting (3200K key, 6500K rim). Glossy black surface with perfect reflection. One or two product drops artfully placed catching light. Mood: elegant, luxury.
- IF candle → Product LIT with flame glow illuminating wax and label. Rim lights supplementing. Warm glow pool on dark surface. Mood: intimate, atmospheric.
- DEFAULT → Dual-temperature rim lights (warm left 3200K, cool right 6500K) creating chromatic drama on product edges.

ANGLE: Eye level to SLIGHTLY BELOW (-5 to 5°) — hero power angle. Product LOOMS.

PROPS: Almost none. ONLY: water droplets, gold dust particles, subtle smoke wisps, light flare artifacts. Sparse, caught in rim light.

MOOD: Product costs 10x its actual price. Exclusive, powerful, cinematic, desirable.

PHYSICS: Product MUST obey gravity. It lies flat, leans against a surface, or stands on a flat base. NEVER balanced on its tip or at impossible angles. Cylindrical products (pens, tubes, bottles without flat bases) MUST lie on their side.

NEVER: Use flat gray backgrounds — must have DRAMA from rim lighting. Never add lifestyle props. Never show visible table edge. Never let product disappear into darkness — rim light must separate it clearly.`,

  style_lifestyle: `STYLE: LIFESTYLE STORY — Instagram-Worthy Scene

CONCEPT: A curated lifestyle MOMENT that makes someone stop scrolling. Every scene tells a STORY — not just product on a table but a moment frozen in time. Think top-tier lifestyle influencer content.

LIGHTING: Natural window light from one side, warm 3200-4500K, directional with visible light-shadow play. 3:1-4:1 ratio. Shallow depth of field f/2.0-2.8 — background dreamy, product SHARP.

ANGLE: 25-40° above, off-center rule-of-thirds. Product in lower-third or center focal point.

CATEGORY-SPECIFIC SCENES (choose based on product):

IF food/beverage → KITCHEN STORY: Product on wooden cutting board or marble countertop. Fresh ingredients nearby (herbs, citrus, spices). Hand-thrown ceramic bowl partially visible. Warm morning light. Linen napkin casually draped. Feels like mid-cooking with a secret ingredient.

IF skincare/cosmetics → MORNING RITUAL: Product on white marble vanity or bathroom shelf. Soft morning light through frosted window. One fresh white flower in ceramic vase. Folded cotton towel. Feels like calm Sunday self-care.

IF electronics → PRODUCTIVE WORKSPACE: Product on clean minimal desk. Warm desk lamp. Healthy green plant in ceramic pot. Half-full coffee cup. Open notebook edge visible. Afternoon golden light. Feels creative and productive.

IF jewellery → VANITY MOMENT: Product on soft fabric or ceramic dish on a vanity. Soft feminine lighting. Small vase with dried flowers. Silk scarf nearby. Feels like getting ready for a special evening.

IF candle → COZY EVENING: Product on side table. Soft knit blanket nearby. Open book face-down. Window showing rain/twilight. Candle IS lit. Ceramic mug of tea. Feels like the perfect evening in.

IF bag/wallet → TRAVEL STORY: Styled flat lay on linen. Passport peeking out. Sunglasses. Coffee cup. Feels like start of an adventure.

IF home_goods → IN ITS HABITAT: Product in the room it belongs in. Complementary items from same aesthetic blurred nearby. Feels like a real home.

IF garment → STYLED FLAT LAY: Product on light linen or wood. 1-2 complementary accessories. Small plant or coffee at edge. Overhead 60-80°. Feels curated.

DEFAULT → Product on natural wood/marble. Blurred warm interior behind. 2-3 contextual props smaller than product. Warm, aspirational.

PROPS: 2-4 contextual items. ALL smaller than product. Supporting characters — product is star.

MOOD: Aspirational, warm, "I want this in my life." Storytelling over styling.

PHYSICS: Product MUST obey gravity. It lies flat, leans against a surface, or stands on a flat base. NEVER balanced on its tip or at impossible angles. Cylindrical products (pens, tubes, bottles without flat bases) MUST lie on their side.

NEVER: Use same generic wood-table-with-coffee for every category. Never make props larger than product. Never use cold/clinical lighting. Never include competing branded products as props.`,

  style_festive: `STYLE: INDIAN FESTIVE — Diwali Gifting Energy

CONCEPT: This product is THE gift everyone wants this festive season. Not just "props around a product" — a complete festive NARRATIVE. Makes someone immediately think "I need to buy this for someone."

SURFACE: Dark wood with embroidered silk runner (maroon/emerald with gold zari border), polished brass thali, or rich velvet (deep red/royal blue).

BACKGROUND: Warm rich bokeh of REAL lit diyas and fairy lights — golden circular bokeh at multiple depths. Layered, atmospheric. Hints of decorated room — rangoli edge or silk drape blurred.

LIGHTING: Primary warm glow from multiple diya flames (2700-3000K). Secondary soft fill for product details. Multiple warm point sources at varying distances creating LAYERED golden bokeh. 3:1 ratio.

COLOR PALETTE: Gold, deep maroon, saffron, emerald, royal purple. Rich jewel tones. Metallic accents. NO pastels, NO cool tones.

CATEGORY-SPECIFIC SCENES:

IF food/beverage → GIFT HAMPER: Product as centerpiece. Small bowls of dry fruits, mithai pieces on brass leaf plate, decorative potli bag. Gold ribbon. Scattered marigold petals. Feels like opening a premium Diwali hamper.

IF skincare/cosmetics → FESTIVE BEAUTY: Product on decorated brass thali with kumkum. Rangoli nearby. Fresh marigold garland. Gold-wrapped items. Feels like Diwali beauty ritual.

IF electronics → DIWALI GIFT REVEAL: Product emerging from gold/red tissue paper, satin ribbon. Sparkler light trails. Fairy lights framing. Gift tag. Feels like unwrapping the best gift.

IF jewellery → AUSPICIOUS MOMENT: Product on red velvet on brass thali. Gold coins scattered. Lit diyas flanking. Feels like Dhanteras — auspicious and precious.

IF candle → DIWALI NIGHT: Product surrounded by lit diyas in pattern. Rangoli visible. Marigold garland. Candle LIT joining diya flames. Fairy light bokeh overhead.

DEFAULT → Product on decorated silk. 2-3 lit diyas. Marigold flowers. Golden bokeh. Festive abundance.

ANGLE: 25-40° above. Shows surface arrangement and depth.

MOOD: Celebration, generosity, warmth, tradition. "Buy this as a gift RIGHT NOW."

PHYSICS: Product MUST obey gravity. It lies flat on the surface, leans against a prop, or rests naturally. NEVER balanced on its tip or standing at impossible angles. Cylindrical products (pens, tubes, bottles) MUST lie on their side or lean against a cushion/prop.

NEVER: Scatter diyas randomly without narrative. Never use cool/blue lighting. Never make it look religious (puja) — keep it GIFTING focused. Never use plastic flowers. Never make background flat warm orange — must have depth and bokeh layers.`,

  style_outdoor: `STYLE: OUTDOOR NATURAL — Fresh and Alive

CONCEPT: Farm-to-table, organic brand energy. Golden hour is NON-NEGOTIABLE — warm backlight makes everything alive. Think Whole Foods meets National Geographic lighting.

SURFACE: Weathered reclaimed wood, raw stone slab, moss-covered rock, or woven basket — depending on category. Visible natural texture. Surface slightly damp with morning dew for freshness.

BACKGROUND: HEAVILY blurred (f/1.4-2.0) natural environment. Lush green foliage, garden, meadow. LARGE beautiful circular bokeh from backlit leaves. 90% blur — just color and light shapes. Golden light flares and sun streaks permitted.

LIGHTING: Golden hour backlight is PRIMARY — warm 3000-3500K sun low behind product creating golden RIM LIGHT on edges. Open shade from front for fill. 4:1 backlight-to-fill ratio. Dappled light through leaves welcome.

CATEGORY-SPECIFIC SCENES:

IF food/beverage → FARM-TO-TABLE: Rustic wood surface. Fresh herbs and relevant produce nearby (tomatoes, lemons, berries). Linen napkin. Dew on herbs. Feels like garden harvest.

IF skincare/cosmetics → BOTANICAL GARDEN: Product on smooth stone surrounded by actual botanical ingredients (aloe, turmeric, lavender, flower petals). Dewy leaves. Greenhouse blurred behind. Feels like product grew from this garden.

IF candle → GOLDEN PATIO: Product on outdoor teak table. Wine glass nearby. Sunset sky bokeh. Candle lit. Climbing plants blurred behind. Perfect patio evening.

IF electronics → ADVENTURE: Product on natural rock. Vista blurred behind (mountains, lake). Water bottle or carabiner nearby. Golden hour. Weekend adventure vibes.

IF jewellery → NATURAL ELEGANCE: Product on smooth river stone or driftwood. One wildflower. Extreme shallow depth. Morning dew. Precious and natural.

DEFAULT → Weathered wood or stone. Lush green bokeh. Golden hour rim. 1-2 natural props. Fresh and alive.

ANGLE: Eye level to slightly below (-5 to 15°) for maximum golden hour backlight and bokeh.

DEPTH OF FIELD: f/1.4-2.0 is MANDATORY. Only product sharp. Background is beautiful color wash. Large circular bokeh balls.

MOOD: Fresh, alive, natural, healthy, authentic.

PHYSICS: Product MUST obey gravity. It lies flat on the surface or leans against a natural prop (rock, branch). NEVER balanced on its tip or floating. Cylindrical products (pens, tubes, bottles) MUST lie on their side.

NEVER: Use noon harsh sun — ONLY golden hour or open shade. Never make background sharp. Never use artificial greenery. Never place product directly on grass. Never use flat overcast lighting. Never include people.`,

  style_minimal: `STYLE: MINIMAL — Museum-Quality Still Life

CONCEPT: MUJI meets Apple. Intentional emptiness with mathematical precision. NEGATIVE SPACE is a design element. SHADOW is a design element. Sophisticated restraint.

SURFACE: White Carrara marble with subtle grey veining, poured concrete with fine pores, pale blonde oak, or light grey terrazzo. Subtle texture visible — interest without competing. Bottom 30-40% of frame.

BACKGROUND: Extremely soft monochromatic gradient. White-to-warm-grey. Almost featureless but NOT dead flat — atmospheric depth. No visible wall/floor junction.

LIGHTING: Single strong directional source from one side (60-80° from camera), creating a LONG dramatic shadow extending across surface. Shadow IS the compositional element. 5000K neutral. 4:1-5:1 ratio. Late-afternoon-sun quality.

SHADOW: KEY DESIGN ELEMENT. Long directional shadow at an angle. Warm-toned (not cold grey). Reveals surface texture as it passes. Occupies significant frame area as secondary compositional element.

NEGATIVE SPACE: Product occupies 30-40% of frame. Remaining 60-70% is intentional emptiness. Product on rule-of-thirds, NOT centered. Empty space creates tension and draws eye.

CATEGORY-SPECIFIC TREATMENTS:

IF skincare/cosmetics → White marble. ONE green leaf (monstera/eucalyptus) casting its own shadow. Single drop of product texture on marble. Green as sole accent.

IF food/beverage → Concrete or terrazzo. ONE single ingredient (one chili pepper, three coffee beans, one herb sprig) at deliberate distance. Visual dialogue across negative space.

IF electronics → Matte pale surface or light wood. NO props — let the product and its shadow be the only elements. Clean lines, pure negative space.

IF jewellery → White or cream stone. No props at all. Dramatic shadow IS the only element. Shadow reveals jewelry form and creates abstract shapes.

IF candle → Concrete or white oak. Unlit. Single match or matchbox at deliberate distance. Long candle shadow creates dramatic line.

DEFAULT → Concrete or marble. Maximum ONE accent. Long dramatic shadow. Generous negative space.

ANGLE: 15-30° above. Shows surface and shadow without becoming flat lay.

ACCENT COLOR: Monochromatic (greys, whites, naturals) with ONE accent drawn from product. If product is blue, blue is the only color.

MOOD: Zen, sophisticated, intentional, architectural, museum-quality.

PHYSICS: Product MUST obey gravity. It lies flat on the surface or leans against the prop. NEVER balanced on its tip or at impossible angles. Cylindrical products (pens, tubes, bottles) MUST lie on their side.

NEVER: Add more than ONE prop. Never center the product — rule-of-thirds or golden ratio. Never use flat overhead lighting — dramatic shadow is essential. Never add lifestyle props. Never make shadow a generic blob — clean directional design element.`,

  style_with_model: `STYLE: WITH HUMAN MODEL
The product must be shown being ACTIVELY USED by a real-looking person — NOT just held up.

MODEL SELECTION (you decide based on the product):
- Cosmetics/skincare/jewelry → Young Indian woman (20s-30s), elegant
- Men's accessories/gadgets/electronics → Indian man (25-35), confident
- Food/beverage → Varies by product personality — could be either gender
- Clothing → Person matching the garment's target audience and size
- General/home goods → Friendly Indian person, gender matching product audience

MODEL REQUIREMENTS:
- Indian/South Asian features, natural skin tone
- CANDID expression — caught in the ACT of using the product, not posing for camera
- Person shown from chest up or waist up (not full body unless clothing/shoes)
- Clean, simple clothing (solid neutral colors — no competing patterns or logos)

CATEGORY-SPECIFIC INTERACTIONS (CRITICAL — choose based on product type):
- Gum/candy/mints: Person pulling out a stick/piece, or chewing with eyes closed in satisfaction, or offering one to someone off-camera. Show the open pack.
- Packaged snacks/cookies/chips: Person mid-bite with a satisfied expression, one piece in hand near mouth, pack visible in other hand or on table nearby.
- Beverages/drinks: Person mid-sip or just lowered the drink with a refreshed expression, condensation visible on bottle/can.
- Skincare/cosmetics: Person applying product to face/hands, or admiring their skin in soft light after application. Product jar/tube prominently visible.
- Jewelry/accessories: Person touching/adjusting the piece, or looking down at it admiringly. Close-up framing.
- Electronics/gadgets: Person actively using it — listening to headphones with closed eyes, typing on laptop, scrolling phone.
- Bags/wallets: Person reaching into it or slinging it over shoulder, in motion.
- Home goods/candles: Person arranging it in their space, or relaxing nearby (candle lit, aromatic).
- DEFAULT (anything else): Person in the middle of using or experiencing the product naturally.

NEVER just "hold product up to camera and smile." That is a stock photo, not an ad. Show a MOMENT of genuine product interaction.

PRODUCT SIZE AND FRAMING:
- Product must occupy at least 25-35% of the image area — it is the HERO, person is context
- Frame the shot so the product is at the VISUAL CENTER or lower-third focal point
- Product face/label MUST be clearly readable and well-lit
- If the product is small (gum, lip balm, earbuds), shoot CLOSER — chest-up with product near face level
- The viewer's eye should go: product FIRST, then person

SCENE:
- Background: Soft blurred contextual background matching the product's use case (cafe for gum, bathroom for skincare, outdoors for drinks), shallow depth of field f/2.0-2.8
- Lighting: SAME directional light on both person AND product — key light 45° front-left, warm 5000-5600K. Product and person must have MATCHING shadows and highlights.
- Color palette: Warm, inviting, matches product's brand energy
- Props: ABSOLUTELY NONE except what's natural for the interaction.

GRIP AND HAND REALISM (CRITICAL):
- Flat packets/sachets/gum: Pinch between thumb and 2-3 fingers, like holding a card. NOT a fist grip.
- Bottles/cans: Natural wrap-around grip, thumb on one side, fingers curved around.
- Small items (lip balm, earbuds): Delicate pinch between thumb and forefinger.
- Jars/containers: Cupped in palm or held from underneath.
- Large items: Two hands if needed, natural weight distribution.
- The grip must match the product's actual SIZE and WEIGHT — don't grip a light gum pack like a heavy bottle.

PHOTOREALISM REQUIREMENTS (anti-AI tells):
- TEETH: Slightly imperfect — real teeth have subtle size variation, minor overlap, natural off-white color. NOT perfect uniform white veneers.
- SKIN: Visible pores on nose and cheeks, subtle blemishes, natural skin texture variation. Neck and jawline MUST have same detail as face — no smooth plastic neck.
- HAIR: Soft wispy edges at hairline and temples. Individual flyaway strands visible. NOT a sharp clean hairline cutout.
- STUBBLE (if male): Patchy and irregular, heavier on chin/jawline, lighter on cheeks. NOT uniform distribution.
- EYES: Natural iris color variation, visible blood vessels in whites, realistic catchlight matching the scene's light direction. NOT glowing or dead.
- EXPRESSION: Asymmetric — real smiles are slightly lopsided. One eye slightly more squinted than the other. NOT perfectly symmetric.
- ANATOMY: Every hand must have EXACTLY 5 fingers. Natural human proportions. No extra limbs.

SINGLE PERSON ONLY. One model, not multiple. One product instance, not duplicated.`,
};

const DEFAULT_STYLE_BRIEF = STYLE_BRIEFS['style_lifestyle']!;

const ANALYZE_AND_PLAN_PROMPT = `You are an expert product photographer and advertising creative director. Analyze this product image and return a complete plan for creating a professional advertisement.

Your response MUST be valid JSON only — no markdown, no explanation.

## STEP 1: Input Quality Assessment
- Is this photo usable? Reject only if: no product visible, extremely blurry, too dark, too small, or corrupted
- Accept messy backgrounds and poor lighting — we will fix them
- "hasGlare": true if the product surface has visible specular reflections, glare hotspots, or flash reflections
- "inputAngleQuality": "good" if the viewing angle is suitable for advertising, "suboptimal" if a different angle would be better (e.g., flat top-down when a 3/4 view would sell better), "unusable" if the product is barely visible from this angle

## STEP 2: Product Identification (be EXTREMELY specific)
- Full brand name, product type, variant, size
- Example: NOT "speaker" but "Anker SoundCore 2 Portable Bluetooth Speaker, black mesh front, ANKER logo on face"

## STEP 2.5: Product Physical Characteristics (CRITICAL for pipeline routing)
- "productPhysicalSize": Estimate the real-world size of this product:
  - "tiny": fits in palm (gum pack, lip balm, earbuds case, sachet, small candy bar)
  - "small": hand-sized (soap bar, phone case, small bottle, cosmetics tube, wallet)
  - "medium": forearm-sized (water bottle, shoe, book, headphones, small appliance)
  - "large": bigger (laptop, bag, clock, large appliance, clothing laid flat)
- "productDimensionality": How 3D is this product?
  - "flat_2d": thin/flat like a card, packet, sachet, gum pack, envelope, phone case
  - "shallow_3d": some depth but mostly flat (soap bar, small box, book, wallet)
  - "deep_3d": clearly 3D with volume (bottle, jar, shoe, headphones, appliance, bag)
- "recommendedCanvasFill": What fraction of a 1024x1024 canvas should the product fill?
  - tiny + flat_2d: 0.85 (product must dominate, leave minimal background)
  - small + flat_2d/shallow_3d: 0.80
  - medium: 0.70
  - large: 0.60
  - Adjust based on aspect ratio: very thin/long products need more fill to be visible

## STEP 3: Branding Detection (CRITICAL)
- "hasBranding": true if ANY brand text, logo, or distinctive brand mark is visible
- "brandingConfidence": 0.0 to 1.0 — how confident are you about the branding detection? 1.0 = obvious large logo/text. 0.5 = small or partially obscured. 0.0 = no branding at all. When uncertain (embossed text, tiny logos, partial visibility), err on the side of HIGHER confidence (we'd rather preserve than destroy branding).
- "brandElements": list every visible brand element
- A plain black speaker with no text = false. A speaker with "ANKER" = true. A Pepsi can = true. Handmade jewelry = false.

## STEP 4: Full Product Analysis
Deep analysis: colors, materials, textures, target audience, price segment, recommended scene, ad best practices for this product type.

## STEP 5: Scene Prompt Generation (STYLE-AWARE)

`;

// ---------------------------------------------------------------------------
// Build the full prompt with style context
// ---------------------------------------------------------------------------

function buildFullPrompt(style?: string, voiceInstructions?: string): string {
  const styleBrief = (style && STYLE_BRIEFS[style]) ? STYLE_BRIEFS[style] : DEFAULT_STYLE_BRIEF;

  let prompt = ANALYZE_AND_PLAN_PROMPT;

  prompt += `The user has selected this photography style:\n\n${styleBrief}\n\n`;

  prompt += `Generate TWO prompts that STRICTLY follow the style specification above:

**scenePrompt** (40-70 words): A creative ad scene in the specified style WITH the product as hero.
- Follow the style's surface, lighting, props, background, and mood EXACTLY
- Product is the ONLY main subject — NO other products, bottles, glasses, cups
- Props must match the style specification (none for studio, contextual for lifestyle, etc.)
- Everything PHOTOREALISTIC — shot on 85mm f/2.8 lens
- NEVER use words like "8k", "quality", "HD", "resolution" — AI renders these as visible text
- ONLY include dynamic elements (scattered props, floating ingredients) if the style specification ALLOWS them. If the style says "no props" or "no floating elements", do NOT add any.

**backgroundOnlyPrompt** (40-70 words): An EMPTY scene matching the style with NO product.
- Same surface, lighting, background, and mood as scenePrompt
- Clear empty space in center where product will be composited
- Must include "no products, no objects in center, clear negative space"

**creativeBrief** (200-400 words): A single flowing narrative paragraph describing the final photograph as if you are briefing an elite advertising photographer. This will be sent DIRECTLY to an AI image generator along with the original product photo.

Write in PROSE, not bullet points. Use precise photographic language: focal length (85mm, 50mm), aperture (f/1.4, f/2.8), color temperature in Kelvin (3200K, 5600K), light ratios (3:1, 5:1). Describe from background to foreground, building the scene layer by layer.

Example of EXCELLENT narrative style:
"Through the soft circular bokeh of rain-kissed foliage, warm 3200K golden-hour light streams from behind-right, backlighting a weathered reclaimed-wood surface beaded with morning dew. Shot on 85mm f/2.0, the lens compresses the lush green background into a dreamy wash of light and shadow. In the lower third of the frame, the matte black fineliner pen lies diagonally across the wood grain, its barrel catching a thin rim of golden backlight along the top edge. A single fallen leaf rests 3cm away, its veins translucent in the backlight. The product fills 60% of the frame — dominant, tactile, alive with texture."

RULES:
- EXACTLY ONE product in the image — NEVER duplicate, clone, or add miniature/alternate versions. ONE copy only.
- The product is the HERO — it fills the recommended canvas percentage and dominates the frame
- Product MUST obey gravity: lies flat, leans against something, or stands on its base. NEVER floating or balanced on its tip. Cylindrical products lie on their side.
- Product must match the original photo EXACTLY — same shape, colors, text, logos, branding
- No text overlays, watermarks, or added words anywhere
- Every element must be photorealistic — no illustrated or cartoon elements
- If physically small product (pen, gum, lip balm, earbuds): "Frame TIGHT with macro-style crop — product fills 50-65% of frame"
- For WITH MODEL style: describe the Indian person (age, gender, expression, clothing), their ACTIVE interaction with the product (using it, not just holding it), and their realistic human features (skin pores, asymmetric smile, flyaway hair strands)
- For other styles: NO people in the scene
- Include lens spec: "Shot on [focal length] f/[aperture]"
- Include lighting: direction, color temperature, ratio
- Include natural photographic imperfections: "subtle film grain visible at full resolution", "dust motes caught in rim light", "slight vignetting at frame edges", "surfaces show natural micro-texture and real-world wear"
- Frame as describing a photograph that ALREADY EXISTS ("A photograph of..."), not instructions to create one
- End with: "Square format, 1:1 aspect ratio."

`;

  if (voiceInstructions && voiceInstructions.trim().length > 0) {
    const sanitizedInstructions = voiceInstructions
      .trim()
      .slice(0, 500)
      .replace(/[\x00-\x1F\x7F]/g, '') // strip control characters
      .replace(/\n{3,}/g, '\n\n'); // collapse excessive newlines
    prompt += `\nUser's additional instructions (incorporate into scene): ${sanitizedInstructions}\n\n`;
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
  "scenePrompt": string,
  "backgroundOnlyPrompt": string,
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
// Consolidated analysis — SINGLE Gemini call replaces 3 separate calls
// ---------------------------------------------------------------------------

/**
 * Single Gemini call that returns:
 * - Input quality assessment (usable/rejected)
 * - Branding detection (hasBranding, brandElements)
 * - Full product analysis (name, colors, materials, audience, scene)
 * - Creative scene prompt (for Seedream Track B)
 * - Background-only prompt (for Flux Track A)
 *
 * Uses Gemini 2.5 Flash (not Lite) for this critical analysis.
 */
export async function analyzeAndPlan(
  imageBuffer: Buffer,
  voiceInstructions?: string,
  style?: string
): Promise<AnalyzeAndPlanResult> {
  const startMs = Date.now();

  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });

  const base64Image = imageBuffer.toString('base64');
  const mimeType = detectMime(imageBuffer);

  const prompt = buildFullPrompt(style, voiceInstructions);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('analyzeAndPlan timed out after 60s')), 60_000)
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
    throw new Error(`Gemini returned non-JSON for analyzeAndPlan: ${rawText.slice(0, 300)}`);
  }

  const result = AnalyzeAndPlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`analyzeAndPlan schema validation failed: ${result.error.message}`);
  }

  console.info(JSON.stringify({
    event: 'analyze_and_plan_complete',
    usable: result.data.usable,
    productName: result.data.analysis.productName,
    category: result.data.productCategory,
    hasBranding: result.data.hasBranding,
    brandingConfidence: result.data.brandingConfidence,
    brandElements: result.data.brandElements,
    hasGlare: result.data.hasGlare,
    inputAngleQuality: result.data.inputAngleQuality,
    productPhysicalSize: result.data.productPhysicalSize,
    productDimensionality: result.data.productDimensionality,
    style: style ?? 'default',
    scenePromptPreview: result.data.scenePrompt.slice(0, 80),
    creativeBriefPreview: result.data.creativeBrief.slice(0, 100),
    durationMs: Date.now() - startMs,
  }));

  return result.data;
}

// ---------------------------------------------------------------------------
// Legacy exports (keep backward compat for index.ts exports)
// ---------------------------------------------------------------------------

export async function analyzeProduct(imageBuffer: Buffer): Promise<ProductAnalysis> {
  const result = await analyzeAndPlan(imageBuffer);
  return result.analysis;
}

export async function generateAdPrompt(
  analysis: ProductAnalysis,
  voiceInstructions?: string
): Promise<string> {
  // This is now handled inside analyzeAndPlan, but keep for backward compat
  const genai = new GoogleGenAI({ apiKey: getProviderKey('gemini') });
  const sanitizedInstructions = voiceInstructions
    ? voiceInstructions
        .trim()
        .slice(0, 500)
        .replace(/[\x00-\x1F\x7F]/g, '') // strip control characters
        .replace(/\n{3,}/g, '\n\n') // collapse excessive newlines
    : undefined;
  const prompt = `Generate a 40-70 word creative ad scene prompt for this product. The product is already placed on a canvas — describe ONLY the scene around it. No text, no words, no "8k", no "quality". Photorealistic only. Product is the ONLY main subject. No competing objects.\n\nProduct: ${JSON.stringify(analysis)}${sanitizedInstructions ? `\n\nUser instructions: ${sanitizedInstructions}` : ''}`;

  const response = await genai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return rawText.replace(/^["'`]+/, '').replace(/["'`]+$/, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}
