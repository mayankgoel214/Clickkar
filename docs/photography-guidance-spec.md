# WhatsAds — Photography Angle Guidance System
**Document Version:** 1.0
**Date:** March 27, 2026
**Author:** Product (AI-assisted)
**Status:** Ready for development
**Audience:** Solo developer integrating into WhatsApp bot + AI pipeline

---

## WHY THIS DOCUMENT EXISTS

The AI pipeline produces poor outputs when the input photo has the wrong angle. A ring shot
side-on looks like a thin band — the AI cannot magically reveal the face of the stone from a
90-degree rotated input. A pickle jar photographed from the top shows zero label text — the
background removal still works, but the resulting product image is commercially useless.

This is the most impactful pre-processing improvement available. It costs zero in compute. It
is a conversation design problem, not a model problem.

---

## PART 1: PER-CATEGORY PHOTOGRAPHY GUIDE

---

### 1.1 JEWELLERY

#### Rings

**Optimal angle:** 45-degree front-facing, slightly above the ring (not eye-level, not directly
top-down). The camera sits at roughly the 10 o'clock position relative to the ring lying flat.
This angle simultaneously shows:
- The full band shape
- The height of the setting/stone
- The face of the stone with light catchment

**What amateurs do wrong:**
- Shoot perfectly side-on (ring looks like a thin stripe, no stone visible)
- Shoot dead top-down (stone visible but band disappears, no depth)
- Photograph on their hand with busy background — the background removal AI gets confused by skin
- Hold the ring in fingers (fingers block half the band)

**Surface recommendation:** Stand the ring upright on a neutral surface — a folded black velvet
cloth, a white tile, or even the flat spine of a dark book. Lying flat and shooting from above
is acceptable only if the stone is the star and the band is secondary (like a thin band diamond
solitaire). For all other rings, the 45-degree approach is correct.

**Worn vs. placed:** Place on surface. On-hand shots require the entire hand to look good, need
professional manicure, and the fingers create background removal problems. On-surface shots are
consistently better for micro-D2C sellers.

---

#### Necklaces and Chains

**Optimal angle:** Flat lay from directly above (90 degrees top-down), with the necklace fully
uncoiled and arranged in a clean shape. Either a straight horizontal line or a gentle U-shape.
The pendant, if any, should be centered and facing the camera fully.

**What amateurs do wrong:**
- Photograph the necklace still folded or tangled in the box it came in
- Hang it from a nail or hook — creates an uneven, sagging shape and harsh shadow on the wall
- Take a side-profile shot — chain links disappear, pendant is profile-only

**Surface recommendation:** Contrasting surface. Gold chain on dark velvet or black paper. Silver
on white or pale grey. For a more lifestyle feel, on a marble-print or wooden surface. The key
is sufficient contrast — a gold chain on a yellow fabric disappears.

**Worn vs. placed:** Placed flat is best for catalogue photography. If the seller wants to show
scale/how it sits on a neck, an on-model shot (worn by a person) is the alternative — but this
is harder for a solo micro-D2C seller. Flat lay is the correct guidance.

---

#### Earrings

**Optimal angle:** For stud earrings — flat lay, top-down. For dangling/jhumka earrings — hang
them from a small hook, nail, or earring stand at eye level and shoot horizontally. The full
drop of the earring must be visible. Alternatively, flat lay with earrings open on a surface.

**What amateurs do wrong:**
- Photograph a single earring when the pair should both be shown
- Place them on their side (the ear-post creates a shadow and the face is not visible)
- Photograph jhumkas from the top — the three-dimensional cascade of the jhumka is completely
  lost

**Surface recommendation:** Same as rings — dark surface for gold/coloured pieces, light surface
for silver/oxidised.

---

#### Bangles and Bracelets

**Optimal angle:** Flat lay, top-down, with all bangles/bracelets in the set arranged in a
stacked or fanned pattern. The circular shape must be fully visible. Do NOT stack them
vertically like a tower — camera captures the thin edge only.

**What amateurs do wrong:**
- Stack all bangles in a tight cylinder and photograph the stack from the side — all you see is
  a metal cylinder
- Wear them on the wrist — the wrist angle foreshortens the bangles and they look oval, not
  round

---

#### Maangtika / Hair Accessories

**Optimal angle:** Flat lay, top-down, with the piece laid out fully showing its pendant, chain,
and main ornament.

---

### 1.2 FOOD

#### Jars (Pickle, Honey, Jam, Ghee, Sauce, Oil)

**Optimal angle:** 45-degree angle at approximately eye-level to the jar. Camera sits at eye
level with the top third of the jar and tilts slightly down. This captures:
- The label face fully (essential for brand identity)
- The product inside the jar (colour, texture)
- The three-dimensional shape of the jar

**What amateurs do wrong:**
- Shoot from directly above — the lid dominates, the label is invisible, the product content is
  not visible
- Shoot from below (pointing camera upward) — label may appear but the jar looks distorted
- Shoot in harsh indoor lighting — the jar becomes reflective and label text blurs with glare
- Yellow tube-light lighting — the pickle's natural green/red colour looks brown and
  unappetising

**Surface recommendation:** Earthy, food-appropriate textures work best. A wooden chopping board,
a knotted jute or burlap cloth, or terracotta tiles look authentic and warm. The AI background
generation also handles this well — this is the category where background selection matters
most for appetite appeal.

**Content: in-jar vs. plated:** For jars, keep the product in the jar — that is what the
customer buys. Adding a small portion of the food item next to the jar (a tiny bowl of pickle,
a spoon of jam) significantly increases appetite appeal but requires more styling effort. As a
Phase 2 guidance tip, not for MVP.

---

#### Open Food / Plated (Mithai, Dry Fruits, Snacks, Ready-to-eat)

**Optimal angle:** 45-degree angle, camera slightly above eye level. Not top-down (kills depth
and texture). Not eye-level-flat (makes food look like a flat disc). The 45-degree is called the
"restaurant menu angle" for a reason — every professional food photographer defaults to it.

**What amateurs do wrong:**
- Full top-down flat lay on dry fruits / mithai (box of barfi photographed from directly above
  looks like coloured rectangles, no dimension)
- Photographing the food on the floor or kitchen slab with utensils and other items visible
- A plate that is not clean on the edges (food smears, spills)

**Surface recommendation:** On a clean plate or small bowl, placed on a dark wooden surface or
slate tile for snacks/mithai. White plate on white surface creates no contrast and loses shape.
Dark wood is the safest universal choice for Indian food photography.

---

#### Packaged / Sealed Products (Pouches, Stand-up Bags, Box Packaging)

**Optimal angle:** Straight-on, eye-level, perfectly front-facing. The camera should be at
exactly the midpoint height of the package and the package should be standing upright. Like a
supermarket shelf shot. All text on the primary face must be legible.

**What amateurs do wrong:**
- Lean the package against a wall at an angle — creates keystoning distortion where the text
  reads as slanting
- Photograph multiple products in one frame during the first/hero shot — clutters the frame

---

#### Spices (Loose, in Bowls, in Sachets)

**Optimal angle:** For loose spices in a bowl — 45 to 60-degree angle showing the bowl from
slightly above so the colour and texture of the spice is visible. A small wooden spoon or
measure in the bowl adds context.

---

### 1.3 GARMENTS AND TEXTILES

#### Kurtas and Shirts

**Optimal angle:** Flat lay, top-down, on a neutral surface. The garment must be:
- Fully spread out with no visible wrinkles or creases (iron or steam before shooting)
- Collar/neckline facing the camera at the top of the frame
- Sleeves naturally extended outward (not bunched at the sides)
- Any embroidery, block print, or key design element centered

**Alternatives:** Ghost mannequin (a solid mannequin photographed, mannequin removed in editing
— this is Stage 3 for WhatsAds, not immediate) or hanger shot. Hanger shot is acceptable —
hang on a plain wooden or white hanger against a plain light wall, shoot straight-on at eye
level.

**What amateurs do wrong:**
- Folded garment — the customer cannot see the shape, proportion, or full design
- Crumpled on the floor — no amount of AI can fix severe wrinkle texture
- Angled top-down where the bottom of the kurta is further from the camera — creates severe
  perspective distortion, the garment looks tapered even if it is straight
- Shot on a bed with patterned bedsheet — the AI cannot distinguish the garment from the
  background

**Surface recommendation:** Clean light-coloured floor or table for flat lay. Avoid patterned
surfaces — the AI background removal gets confused at the garment edge.

---

#### Sarees

**Optimal angle:** Close-up detail shots perform better than full-saree shots for most D2C
sellers. The full saree flat-lay requires 6-8 feet of floor space and looks like a pile of
fabric from the top. Instead:
- A 45-degree drape shot — saree partially draped and partially spread showing the border
- A close-up of the pallu (the decorated end) at 45 degrees showing texture and weave
- A folded presentation (pleated fold showing pallu) at eye-level from the front

**What amateurs do wrong:**
- Attempting a full saree flat lay in a cramped space — always results in a crumpled mess at
  the edges
- Not showing the border (the most valuable part of the saree) — photographing only the body

---

#### Dupattas and Stoles

**Optimal angle:** Hang from a hanger or drape over a mannequin if available. Alternatively,
semi-flat lay with one end gathered and the other spread out showing the border detail. Shot
from 45 degrees above.

---

#### Children's Wear

**Same guidance as kurtas/shirts** — flat lay is cleanest. The smaller size makes it easier to
get a full, crease-free flat lay.

---

### 1.4 SKINCARE AND BEAUTY

#### Bottles and Serums

**Optimal angle:** Straight-on, eye-level, perfectly vertical. The camera must be at exactly
the midpoint height of the bottle. This captures:
- The full label text
- The shape and cap design
- The correct proportions (no top-heavy or bottom-heavy distortion)

Do NOT tilt the bottle — even a slight tilt makes the label text appear to lean and gives a
low-quality appearance.

**What amateurs do wrong:**
- Shooting from above — label compresses and the bottle looks shorter
- Shooting from slightly below — bottle looks taller but label distorts
- Photographing in a bathroom with tiles, mirror, or other products visible

**Surface recommendation:** Clean white or grey surface. Plain white paper roll behind and
under. Marble-printed craft paper is an affordable alternative. Keep it minimal — this category
sells on cleanliness and simplicity. The AI background should be equally minimal.

---

#### Creams and Jars (Skincare)

**Optimal angle:** 45-degree angle showing both the front of the jar (label) and the lid at
the same time. Not fully top-down (label invisible), not fully front-on (lid not visible).

**Lid-open variation:** For a premium look, photographing the open jar with a small amount of
product on the inner rim shows texture and richness. This requires clean staging — the jar rim
and product must be pristine.

---

#### Soaps and Bars

**Optimal angle:** 45-degree angle, one bar or a small stack. If textured/handmade soap, the
angled shot shows the texture on the surface better than a flat-top shot.

---

#### Oils (Hair Oils, Body Oils)

**Same as bottles/serums** — straight-on, eye-level. If the oil is in a clear bottle and
colour is a selling point (e.g., black seed oil, rose oil), make sure natural light hits the
bottle from the side so the colour glows through.

---

### 1.5 CANDLES AND HOME DECOR

#### Candles

**Lit vs. unlit:** Both serve different purposes. Lit candles are better for lifestyle/mood
photography (shows the product in use) but require longer exposure or better light. Unlit
candles are easier to photograph clearly (no halo/glare from flame) and better for showing
label, colour, and shape.

**Recommendation for micro-D2C:** Shoot both. Unlit for the hero product shot (the AI-enhanced
output), lit for a secondary lifestyle shot. For MVP, unlit at a 45-degree angle is the correct
guidance — it is achievable by any user with a phone.

**Optimal angle (unlit):** 45-degree angle, camera slightly above the midpoint of the candle.
Shows the label, the wax texture, and the wick simultaneously. For pillar candles, a slight
rotation to show the three-dimensional cylindrical shape.

**What amateurs do wrong:**
- Photograph a lit candle from close-up — the flame creates a blown-out hotspot that the
  camera exposes for, leaving the candle body dark
- Top-down on a candle — you see only the lid/wick, not the label or shape

---

#### Home Decor (Vases, Figurines, Wall Hangings)

**Optimal angle:** Eye-level, straight-on, for any piece with a defined "front" face. 45-degree
for 3D objects like vases where depth and volume should show. For flat wall hangings — perfectly
top-down flat lay on a neutral floor.

---

### 1.6 BAGS, WALLETS, AND ACCESSORIES

#### Handbags and Purses

**Optimal angle:** 45-degree angle showing the front face, one side panel, and either the top
handles or shoulder strap. This is the standard e-commerce "three-quarter view" used by every
major retailer.

**Stuffed vs. empty:** Stuffed. A limp, empty bag collapses on itself and shows no structure.
Stuff with tissue paper, a small box, or rolled clothes to give it shape. The handles must be
standing up or positioned naturally, not flopped over.

**What amateurs do wrong:**
- Flat lay top-down on a bag — shows only the front face, loses all sense of depth and
  structure
- Empty bag that is collapsed — looks deflated, low quality
- Holding the bag by the handle while someone else photographs — the hand occludes the handle
  attachment and creates an unnatural angle

---

#### Wallets

**Optimal angle:** Two shots work best. (1) Closed wallet, front face, 45-degree angle. (2) Open
wallet flat lay from above showing internal compartments. For WhatsAds MVP — the 45-degree
closed shot is the primary.

**What amateurs do wrong:**
- Photographing the wallet's thin edge/spine — no detail visible
- Flat lay of a closed wallet — looks like a rectangle of leather with no texture visible

---

#### Belts

**Optimal angle:** Coiled/spiral arrangement flat lay, top-down. The buckle should be
prominently placed. Or laid flat in a straight line diagonally across the frame (creates a
dynamic diagonal composition).

---

#### Sunglasses and Eyewear

**Optimal angle:** Flat lay, top-down, on a contrasting surface. The full front frame should be
visible. Both lenses forward-facing. A slight angle (not perfectly top-down) shows the
three-dimensionality of the frame.

---

### 1.7 HANDMADE AND ARTISANAL ITEMS

#### Pottery and Ceramics

**Optimal angle:** Eye-level, 45-degree angle for closed pots/vases. If the piece has interior
detail (a bowl), a 60-degree angle tilted slightly to show both the outside and inside rim
simultaneously.

**What amateurs do wrong:**
- Full top-down on a pot — only the opening is visible, the entire form is lost
- Photographing on a cluttered shelf with other items — handmade pieces need a clean backdrop
  to let the craftsmanship read

---

#### Woodwork and Carved Items

**Optimal angle:** 45-degree angle that shows the primary decorative face plus gives context
for depth. For flat carved panels — top-down is correct. For 3D carved objects — 45 degrees.

**Key tip:** Rake lighting is ideal for wood carving — light coming from the side creates
shadows in the carved channels that make the carving "pop". With a phone camera, positioning
near a window with the light coming from one side (not front-on diffused light) achieves this.

---

#### Textiles and Embroidery (Cushion Covers, Wall Art)

**Optimal angle:** Flat lay, top-down, perfectly centred in frame. The full piece must be
visible with no edges cut off.

---

## PART 2: UNIVERSAL PHOTOGRAPHY TIPS

These apply to every product category. Select 2-3 maximum for in-WhatsApp delivery.

---

### 2.1 Natural Light vs. Artificial Light

**The rule:** Window light is always better than ceiling lights or tube lights.

Place the product near (not in front of) a window with diffused daylight — a window covered
with a white curtain, or a shaded window not in direct sunbeam. Direct sunbeam creates hard
shadows. Tube lights and LED bulbs create yellow colour cast that makes every product look
cheap and food look inedible.

**The test the user can do:** Take a photo with tube light on, then turn the light off and take
the same photo with window light. The difference will be immediately visible on the phone screen.

**Simple instruction for users:**
- Windows pe jaiye, light ki taraf product rakhiye (Go near a window, place product facing the light)
- Tube light band karo (Turn off the tube light)

---

### 2.2 Cleaning the Camera Lens

This is the most overlooked factor in mobile phone photography. Indian phones — especially
mid-range Android devices carried in pockets and bags — accumulate fingerprint grease, dust,
and oil on the camera lens constantly. A dirty lens creates soft focus, flare, and haze that
no AI model can sharpen after the fact.

**Simple instruction:** Before every product photo, wipe the phone camera lens with a clean
cotton cloth (the kind used to clean spectacles). This takes 5 seconds and improves every
photo.

This is tip #1 for all categories. It is the highest-ROI single tip for Indian phone users.

---

### 2.3 Distance from Product

Too close causes lens barrel distortion — jewellery looks wider than it is, jars look bulging,
clothes appear to curve at the edges. The safe distance:

- Small products (rings, earrings, soaps): 25-35 cm from phone to product
- Medium products (jars, candles, wallets): 40-60 cm
- Large products (bags, garments flat lay): 60-90 cm (phone held high above)

Use 2x optical zoom instead of moving physically closer — all modern phones have at least 2x
optical zoom. Digital zoom degrades quality; optical zoom does not.

**Simple instruction:** Product se thoda door jaiye — nahi to shape bigad jaati hai. Zoom karo
phone se. (Step back from the product — too close distorts the shape. Use the phone's zoom.)

---

### 2.4 Background

The AI pipeline's background removal (Stage 2A) works best when the product has sufficient
contrast against its background. The following backgrounds work best:

1. White paper or white fabric — works for most products
2. Plain light grey wall or surface
3. Plain dark fabric (for jewellery, light products)

The following backgrounds cause problems for background removal:

- Patterned fabric that matches the product colour (e.g., a floral kurta on a floral bedsheet)
- Glass surfaces (reflections confuse segmentation)
- Surfaces with products similar to what's being photographed (food on a food-packed kitchen
  counter)

**Simple instruction:** Peeche sab saaf rakho — white paper ya plain kapda rakho peeche.
(Keep the background clear — use white paper or plain cloth behind the product.)

A sheet of A4 paper as a background is the recommended minimum-effort guidance for all users.

---

### 2.5 Phone Orientation

For most products, portrait orientation (phone held vertically) is correct. This matches:
- WhatsApp's native display format
- Instagram Story/Reel format (9:16)
- The phone screen itself

Exception: Garment flat lays and sarees sometimes need landscape (horizontal) to capture the
full width. But the guidance complexity is not worth the benefit for MVP — default all users to
portrait orientation.

---

### 2.6 Holding the Phone Steady

Camera shake is the second-biggest quality killer after wrong angles. Blurry photos cannot be
fixed. Solutions:

1. Prop the phone against something stable while shooting (books, a box, the wall)
2. Use the volume button (not screen tap) as the shutter — reduces hand movement
3. Use the phone's built-in timer (2-second timer) so the press-shake settles before capture

**Simple instruction:** Photo kheeechte waqt haath hilao mat — phone ko kisi cheez pe tikao ya
timer use karo. (Don't move your hand while taking the photo — prop the phone or use the timer.)

---

### 2.7 Number of Photos to Send

MVP recommendation: one photo, best angle. Multi-angle is a Phase 2 feature (see Part 5).

The reasoning: asking a micro-D2C seller in Tier 2-3 India to photograph their product from
three angles will cause abandonment. They already find one photo submission high-effort. The
simplest path to a good output is: coach them to take one excellent photo from the right angle.

---

## PART 3: WHATSAPP GUIDANCE DELIVERY

### 3.1 Chosen Approach: Option A (Pre-photo guidance, proactive)

**Rationale for choosing Option A over B, C, D:**

- Option B (reactive AI angle detection) requires an additional AI call BEFORE the main
  pipeline — adds cost and latency, and the user already sent the wrong photo. Coaching before
  is better than correcting after.
- Option C (visual cheat sheet) is high-value but requires creating and hosting 7+ category
  images and managing media asset URLs in the WhatsApp Cloud API. High dev effort for MVP.
- Option D (video notes) requires video production, storage, and CDN — significant overhead.
- Option A requires only text messages. Zero additional infrastructure. Implementable in 1 dev
  day. Can be upgraded to include an example image later.

Option A is delivered immediately after the user selects their product category in onboarding
(after the Message 5 list selection), before the "Ab photo bhejiye" instruction.

Option C (visual cheat card) is recommended as a Phase 2 upgrade sent proactively once per
category, stored in the user's WhatsApp media, referenceable anytime.

---

### 3.2 WhatsApp Message Templates — Category-Specific Tip Messages

Each message below:
- Is delivered after category selection, before the "send photo" instruction
- Must not exceed 3 lines on a 6-inch screen (~180 chars total excluding the title)
- Has Hindi first (default), English translation provided
- Contains exactly 2 tips — never 3 (tested as too many for this user segment)

---

#### JEWELLERY

**For rings:**

```
[BOT — Tip Message — Ring]

H: Ek chhoti si tip 💍
Ring ko table pe rakhein, thoda upar se photo lein — seedha nahi.
Camera lens pooch se saaf karein.

E: Quick tip
Place the ring on a table, shoot from slightly above — not straight-on.
Wipe your camera lens clean first.
```

**For necklaces:**

```
[BOT — Tip Message — Necklace]

H: Ek chhoti si tip 📸
Necklace ko flat rakhein, seedha upar se photo lein — poora dikhna chahiye.
Dark kapde ya paper ke upar rakhein agar gold hai.

E: Quick tip
Lay the necklace flat, shoot from directly above — the full chain should show.
Place on dark cloth or paper if it's gold.
```

**For earrings:**

```
[BOT — Tip Message — Earrings]

H: Ek chhoti si tip ✨
Dono earrings ek saath rakhein — pair dikhna chahiye.
Flat rakhein, seedha upar se photo lein.

E: Quick tip
Place both earrings together — show the pair.
Lay them flat and shoot from directly above.
```

**For bangles:**

```
[BOT — Tip Message — Bangles]

H: Ek chhoti si tip 📸
Bangles ko flat rakhein, seedha upar se lein — poora circle dikhna chahiye.
Stack karke side se mat lena — circle nahi dikhega.

E: Quick tip
Lay bangles flat, shoot from directly above — full circle must show.
Don't stack them sideways — the circle won't be visible.
```

**Generic fallback for jewellery (used if sub-type not collected):**

```
[BOT — Tip Message — Jewellery Generic]

H: Ek chhoti si tip 💍
Jewellery ko saaf jagah pe rakhein, thoda upar se photo lein.
Pehle camera ka lens pooch se saaf karein — foto clear aayegi.

E: Quick tip
Place jewellery on a clean surface, shoot from slightly above.
Wipe your camera lens first — it'll be much sharper.
```

---

#### FOOD (Jars — Pickles, Sauces, Honey, Ghee)

```
[BOT — Tip Message — Food Jar]

H: Ek chhoti si tip 🫙
Jar ko seedha rakhein, aankhon ki seedh mein photo lein — label dikhna chahiye.
Upar se mat lena, label nahi dikhega.

E: Quick tip
Keep the jar upright, shoot at eye level — the label must be visible.
Don't shoot from the top — the label won't show.
```

---

#### FOOD (Open / Plated — Mithai, Dry Fruits, Snacks)

```
[BOT — Tip Message — Open Food]

H: Ek chhoti si tip 🍬
Khaane ko plate mein rakhein, thoda upar se aur thoda side se photo lein.
Seedha upar se mat lena — depth nahi dikhegi.

E: Quick tip
Place food on a plate, shoot from slightly above and to the side.
Don't shoot straight down — it'll look flat.
```

---

#### GARMENTS (Kurtas, Shirts, Children's Wear)

```
[BOT — Tip Message — Garments]

H: Ek chhoti si tip 👗
Kapde ko iron karke flat rakhein, seedha upar se photo lein.
Plain floor ya table pe rakhein — bedsheet pe nahi.

E: Quick tip
Iron the garment, lay it flat, shoot from directly above.
Use a plain floor or table — not a patterned bedsheet.
```

---

#### SAREES

```
[BOT — Tip Message — Saree]

H: Ek chhoti si tip 🥻
Pallu ya border close-up mein lein — thoda upar se aur side se.
Poora saree ek baar mein nahi lena — design nahi dikhega.

E: Quick tip
Photograph the pallu or border as a close-up — from slightly above and to the side.
Don't try to capture the full saree at once — the design won't show.
```

---

#### SKINCARE AND BEAUTY

```
[BOT — Tip Message — Skincare]

H: Ek chhoti si tip 🧴
Bottle ko seedha rakhein, aankhon ki seedh mein photo lein — label clear dikhna chahiye.
Bathroom mein mat lena — window ke paas lena, light better hogi.

E: Quick tip
Keep the bottle upright, shoot at eye level — label must be clearly readable.
Don't shoot in the bathroom — shoot near a window for better light.
```

---

#### CANDLES AND HOME DECOR

```
[BOT — Tip Message — Candles]

H: Ek chhoti si tip 🕯️
Candle ko thoda side se photo lein — label aur shape dono dikhenge.
Seedha upar se mat lena — sirf dhakkan dikhega.

E: Quick tip
Shoot the candle from a slight angle — you'll see both the label and shape.
Don't shoot from directly above — you'll only see the lid.
```

---

#### BAGS AND WALLETS

```
[BOT — Tip Message — Bags]

H: Ek chhoti si tip 👜
Bag ke andar kuch rakhein — tissue ya kapda — shape banana ke liye.
Front aur side dono dikhe is angle mein photo lein.

E: Quick tip
Stuff the bag with tissue or cloth to give it shape.
Shoot at an angle where both the front and one side are visible.
```

---

#### HANDMADE / ARTISANAL

```
[BOT — Tip Message — Handmade]

H: Ek chhoti si tip 🏺
Product ko window ke paas rakhein — side se light aane dein.
Andheri jagah mat lena — craftsmanship nahi dikhegi.

E: Quick tip
Place the product near a window — let light come from the side.
Don't photograph in dim light — the craftsmanship won't show.
```

---

### 3.3 Universal Tip (Appended to EVERY Category Message)

After every category-specific tip, append this as a separate 1-line message sent with 1s delay:

```
[BOT — Lens Cleaning Reminder]
[DELAY: 1s after tip message]

H: Aur ek baat — photo se pehle camera lens ko kapde se saaf zaroor karein. 📷

E: One more thing — always wipe your camera lens with a cloth before shooting.
```

This single tip has the highest universal impact across all categories and user types. By
sending it as a separate short message (not bundled in the tip), it is more memorable.

---

### 3.4 Integration Point in Existing Flow

Insert the tip message sequence at this exact point in the UX spec (Section 1B, after Message 5):

```
[Existing: USER selects product category from LIST]
   |
   v
[NEW: BOT sends category-specific tip message]   <-- INSERT HERE
   |
   [NEW: 1s delay]
   |
   v
[NEW: BOT sends lens cleaning reminder]
   |
   [1s delay]
   v
[Existing: BOT Message 6 — "Ab photo bhejiye"]
```

The tip message must NOT replace Message 6. It inserts before it. The user still gets the
clear "now send the photo" call to action.

---

### 3.5 Re-trigger: When Returning User Starts a New Order

When a returning user sends a new photo without going through onboarding again, do NOT resend
tips automatically — this becomes annoying. Instead, make tips available on demand:

```
[BOT — Returning User Photo Request]

H: Photo mil gayi! Ek second.
Agar angle ya light ke baare mein tip chahiye to "Tip" bhejiye.

E: Got your photo! One moment.
Send "Tip" if you want advice on angle or lighting.
```

If user sends "Tip" → resend their category-specific tip message (stored from onboarding).

---

## PART 4: AI-POWERED ANGLE DETECTION

### 4.1 Feasibility Assessment

Gemini 2.5 Flash Lite (the recommended QA model from AI_MODEL_RESEARCH.md) can reliably detect
the following angle problems in a single vision API call:

| Problem | Detectable? | Confidence |
|---|---|---|
| Ring photographed side-on (band visible, stone not) | Yes | High |
| Necklace tangled or coiled (not laid flat) | Yes | High |
| Jar photographed top-down (lid visible, label not) | Yes | High |
| Garment folded (not laid flat) | Yes | High |
| Bag empty and collapsed | Yes | Medium |
| Garment severely wrinkled | Yes | High |
| Ring photographed on hand (background confusion) | Yes | Medium |
| Food plated but shot completely top-down | Yes | Medium |
| Candle shot top-down (only wick/lid visible) | Yes | High |

The model cannot reliably detect:
- Subtle 10-degree angle differences (e.g., 45 vs. 55 degrees — both fine)
- Correct angle but wrong distance (produces no obvious visual cue the model can name)
- Sub-optimal but acceptable angles

---

### 4.2 Where to Insert Angle Detection in the Pipeline

**Insert as an extension of Stage 1 (Input Quality Assessment)**, not a separate stage. The
current Stage 1 call to Gemini already sends the image and assesses quality_score, blur_score,
lighting_issues, and usability_rating. Add `angle_issue` to the same JSON schema.

This costs zero additional API calls. The existing Stage 1 image is already loaded in the
model's context window. Adding 30-50 additional output tokens (for the angle_issue field) costs
approximately Rs 0.0015 extra per image at Gemini 2.5 Flash Lite pricing — negligible.

**Modified Stage 1 JSON schema:**

```json
{
  "product_category": "ring",
  "quality_score": 7,
  "blur_score": 2,
  "lighting_issues": ["yellow_cast"],
  "usability_rating": "usable",
  "angle_issue": {
    "detected": true,
    "problem": "ring_side_on",
    "message_hi": "Yeh ring side se li gayi hai — stone nahi dikh raha. Kya thoda upar se dobara le sakte hain?",
    "message_en": "This ring is shot from the side — the stone isn't visible. Can you reshoot from slightly above?"
  }
}
```

If `angle_issue.detected` is false, the pipeline continues normally.
If `angle_issue.detected` is true, the pipeline forks:

```
IF angle_issue.detected AND quality_score >= 5:
  → Process the image normally (it may still be usable)
  → Send the angle_issue message to user as a soft suggestion AFTER delivering the result
  → "Yeh result aaya — aur agar angle thoda theek ho to aur achha aayega. Dekhein?"

IF angle_issue.detected AND quality_score < 5:
  → Do NOT process (would be wasted Rs for a bad output)
  → Send the angle_issue message as a blocking nudge BEFORE asking them to re-submit
  → "Is photo mein thodi problem hai — angle theek karo aur dobara bhejiye. Ek baar aur try karein?"
```

This fork logic preserves user experience (they always get *something* when the photo is
usable) while preventing wasted processing on hopelessly bad input.

---

### 4.3 Angle Detection System Prompt (Stage 1 Extension)

Add this section to the existing Stage 1 system prompt:

```
ANGLE ASSESSMENT:
After assessing quality, evaluate whether the product is photographed from an optimal angle
for its category. Use the product_category you identified.

Angle problems to detect (only flag if clearly problematic, not for minor variations):

- ring: photographed flat side-on (band dominant, stone face not visible)
- ring: photographed on hand (distracting background, scale issues)
- necklace: coiled/tangled (not laid flat or clearly arranged)
- earrings: single earring shown when it is clearly a pair style (dangling/jhumka)
- jar: photographed top-down (lid dominant, label not visible)
- garment: folded or severely crumpled (shape not visible)
- garment: lying at steep angle (perspective distortion visible)
- bag: visibly empty/collapsed (no shape visible)
- candle: photographed top-down (only wick/lid visible)
- food_open: photographed perfectly top-down (completely flat view, no depth)

Return angle_issue.detected = false for:
- Acceptable angles that are not optimal but are workable
- Cases where category is unclear
- Unusual or creative angles that could be intentional

For angle_issue.problem, use only these values:
ring_side_on | ring_on_hand | necklace_coiled | earrings_pair_missing |
jar_top_down | garment_folded | garment_distorted | bag_collapsed |
candle_top_down | food_flat

Generate message_hi and message_en: Keep under 2 lines. Warm, non-critical tone.
Do NOT use words like "galat" (wrong), "buri" (bad), "problem". Use "aur achha ho sakta hai"
(could be even better) framing.
```

---

### 4.4 User-Facing Messages for Angle Detection

**Tone principle:** Never make the user feel rejected or that they did something wrong. Frame
every correction as "your photo is good, here is how to make it even better." The WhatsAds
user base is made up of first-time sellers with limited confidence. A blunt rejection will cause
immediate churn.

**Angle issue blocking message (quality_score < 5):**

```
[BOT — Angle Correction — Blocking]

H: Aapki photo aa gayi! 😊
Bas ek chhoti si baat — [angle_issue.message_hi]
Dobara bhejein — bilkul free mein process hoga.

E: Got your photo!
Just one small thing — [angle_issue.message_en]
Resend — it'll process for free.
```

**Angle issue soft suggestion (quality_score >= 5, sent AFTER result delivery):**

```
[BOT — Angle Suggestion — Post-result]

H: Yeh result aa gaya! 🎉
Ek sujhav — [angle_issue.message_hi]
Isi tarah ek aur photo bhejein to result aur bhi kamaal ka hoga!

E: Your result is ready!
One suggestion — [angle_issue.message_en]
Send another with this angle for an even better result!
```

---

## PART 5: MULTI-ANGLE STRATEGY

### 5.1 Which Categories Benefit Most from Multiple Angles

| Category | Benefit from Multi-Angle | Priority |
|---|---|---|
| Bags and wallets | Very high — structure + interior + strap all need separate shots | P1 |
| Jewellery (rings) | High — face + profile + on-hand lifestyle shot | P1 |
| Garments (kurtas) | High — front flat lay + collar detail + print detail | P2 |
| Skincare (serums) | Medium — front label + cap detail | P2 |
| Candles | Medium — front label + top (showing wick) + lit lifestyle | P2 |
| Food (jars) | Low — single label-facing shot is sufficient | P3 |
| Food (open/plated) | Low — single 45-degree shot covers it | P3 |
| Sarees | Very high — but complexity makes multi-angle hard to execute | P3 |

### 5.2 Recommendation: Multi-Angle as Phase 2 Feature

**Do NOT implement multi-angle for MVP.** The reasoning:

1. Asking a micro-D2C seller to take 3 photos instead of 1 will cause abandonment. The user
   is already performing a new behaviour (sending photos to a WhatsApp bot). Adding friction
   reduces activation rates.
2. The AI background compositing pipeline (Stage 3 and 4) currently works with a single product
   image. Adding multi-angle input requires a merge/selection step that adds pipeline complexity
   and latency.
3. The Rs 99 price point makes it unclear whether multi-angle processing warrants the same fee
   or a higher fee. This is a pricing experiment that should wait until the core loop has enough
   orders to be statistically meaningful.

**Phase 2 multi-angle design (for future implementation):**

After delivering the primary result, the bot sends:

```
[BOT — Multi-Angle Upsell — Post-result]
[DELAY: 10s after result delivery]

H: Result pasand aaya? 🎯
Ek aur angle bhejiyen — main isse aur bhi behtar kar sakta/sakti hun.
Pehla result free — doosra bhi sirf Rs 49.

E: Happy with the result?
Send one more angle — I can make it even better.
First result was free — second angle is just Rs 49.
```

The discounted second-angle pricing (Rs 49 vs Rs 99) lowers the experimentation barrier and
tests multi-angle demand before committing to building the full feature.

### 5.3 AI Angle Selection from Multiple Inputs (Future)

When multi-angle is implemented, the AI should not simply process all angles — it should select
the best input angle programmatically. Recommended approach:

1. Run Stage 1 Quality Assessment on all submitted photos simultaneously (parallel calls)
2. Score each photo on: quality_score, angle_appropriateness (new field), label_visibility
3. Select the highest-scoring photo as the primary input for Stage 2 onward
4. Return only one enhanced output (not one per angle) — keeps the output simple for the user

This is achievable with Gemini 2.5 Flash Lite with a comparative prompt: "Given these N photos
of the same product, identify which has the best angle for e-commerce use." Estimated additional
cost per multi-angle order: Rs 0.01-0.02. Acceptable.

---

## PART 6: RICE PRIORITIZATION

### Photography Guidance in Pre-Photo Tips (Part 3)

| Dimension | Value | Notes |
|---|---|---|
| Reach | ~100% of new users / month | Every new user passes through onboarding and category selection |
| Impact | 2 (High) | Correct angle directly improves AI output quality, reduces resubmissions |
| Confidence | 80% | Messaging is low-risk; whether it meaningfully changes user behaviour is medium confidence |
| Effort | 0.5 person-weeks | Text messages only, no new infrastructure, plug into existing onboarding flow |
| **RICE Score** | **(100% x 2 x 0.8) / 0.5 = 320** | |

### AI Angle Detection in Stage 1 (Part 4)

| Dimension | Value | Notes |
|---|---|---|
| Reach | ~30% of users / month | Estimated proportion who send a clearly suboptimal angle |
| Impact | 2 (High) | Prevents wasted processing, improves output quality on resubmission |
| Confidence | 80% | Gemini vision can detect clear angle problems reliably |
| Effort | 1 person-week | Schema update to Stage 1 prompt + bot message routing logic |
| **RICE Score** | **(30% x 2 x 0.8) / 1 = 48** | |

### Multi-Angle (Part 5)

| Dimension | Value | Notes |
|---|---|---|
| Reach | ~20% of users / month | Bags and jewellery sellers most likely to try |
| Impact | 1 (Medium) | Better outputs but not a fundamental problem |
| Confidence | 50% | Uncertain whether micro-D2C users will engage with 2+ photo flow |
| Effort | 4 person-weeks | Pipeline merge logic, pricing experiments, UI changes |
| **RICE Score** | **(20% x 1 x 0.5) / 4 = 2.5** | |

**Prioritisation order:**
1. Photography tips in onboarding (RICE 320) — build this sprint
2. AI angle detection in Stage 1 QA (RICE 48) — build next sprint
3. Multi-angle (RICE 2.5) — Phase 2, after 500 orders baseline

---

## PART 7: IMPLEMENTATION CHECKLIST

### Sprint 1 — Photography Tips (0.5 person-weeks)

- [ ] Add sub-type collection for jewellery (ring / necklace / earrings / bangles) to the
      category selection LIST in Message 5 onboarding, OR use a follow-up quick reply after
      user selects "Jewellery / Accessories"
- [ ] Map each product category + sub-type to the correct tip message template from Part 3
- [ ] Insert tip message + lens cleaning reminder into onboarding flow between category
      selection and the "Ab photo bhejiye" message
- [ ] Add "Tip" keyword handler for returning users (resend stored category tip on demand)
- [ ] Store category + sub-type in user profile (already planned in UX spec dev notes)

### Sprint 2 — AI Angle Detection (1 person-week)

- [ ] Add `angle_issue` object to Stage 1 QA JSON schema
- [ ] Update Stage 1 system prompt with angle assessment section (Part 4.3)
- [ ] Add pipeline fork logic: if `angle_issue.detected`, check `quality_score` and route to
      blocking vs. soft-suggestion message
- [ ] Write and test bot messages for blocking case and post-result suggestion case
- [ ] Add `angle_issue.problem` to order log for analytics (track which angles are most common)
- [ ] Set up PostHog event: `angle_issue_detected` with properties: category, problem type,
      resolution (resubmitted or ignored)

### Success Metrics

- **Activation:** % of new users who submit a photo after receiving the tip message. Baseline
  (no tip): measure first, then compare. Target: +10 percentage points within 4 weeks.
- **Resubmission rate:** % of users who resubmit after an angle correction message. Target:
  > 50% (majority should be willing to reshoot with guidance).
- **Output quality score:** Average final QA score (Stage 5) should increase once better input
  angles are achieved. Track before/after sprint 1 and sprint 2.
- **Support messages:** Count of "result accha nahi aaya" type messages per week. Should
  decrease as input quality improves.

---

## APPENDIX A: CATEGORY-TO-ANGLE REFERENCE TABLE

| Category | Sub-type | Optimal Angle | Surface | Worn/Placed |
|---|---|---|---|---|
| Jewellery | Ring | 45-degree above | Dark velvet / white tile | Placed |
| Jewellery | Necklace/Chain | Top-down flat lay | Dark contrasting cloth | Placed |
| Jewellery | Earrings (stud) | Top-down flat lay | Contrasting surface | Placed |
| Jewellery | Earrings (dangling/jhumka) | Eye-level hanging | Neutral background | Hung |
| Jewellery | Bangles/Bracelets | Top-down flat lay | Contrasting surface | Placed |
| Food | Jar (pickle/sauce/honey) | 45-degree eye-level | Wood / burlap | Upright |
| Food | Open/plated (mithai/snacks) | 45-degree above | Dark wood / slate | Plated |
| Food | Packaged/pouch | Straight front-on eye-level | Plain surface | Upright |
| Garments | Kurta/Shirt | Top-down flat lay | Plain floor/table | Flat |
| Garments | Saree | Close-up 45-degree (pallu/border) | Plain surface | Draped |
| Garments | Dupatta | 45-degree hanging or semi-flat | Plain surface | Hung |
| Skincare | Bottle/Serum | Straight front-on eye-level | White/marble | Upright |
| Skincare | Cream/Jar | 45-degree | White/marble | Upright |
| Skincare | Soap bar | 45-degree | Wood/white | Placed |
| Candles | Pillar/container | 45-degree above midpoint | Neutral surface | Upright |
| Bags | Handbag/Purse | 45-degree three-quarter view | Plain surface | Stuffed |
| Bags | Wallet | 45-degree closed + top-down open | Plain surface | Placed |
| Handmade | Pottery/Ceramics | 45-degree eye-level | Neutral surface | Placed |
| Handmade | Woodwork/Carvings | 45-degree with side lighting | Plain surface | Placed |
| Handmade | Textiles/Embroidery | Top-down flat lay | Plain floor | Flat |

---

## APPENDIX B: GEMINI ANGLE DETECTION PROMPT VALUES

Problem values for `angle_issue.problem` field and corresponding user messages:

| Problem Value | Hindi User Message | English User Message |
|---|---|---|
| `ring_side_on` | Ring thodi si ghumao — stone dikhna chahiye. Upar se photo lein. | Rotate the ring slightly — the stone should face the camera. Shoot from above. |
| `ring_on_hand` | Ring ko table pe rakh ke photo lein — zyada clean aayega. | Place the ring on a table — it'll photograph much cleaner. |
| `necklace_coiled` | Necklace ko flat rakhein aur seedha upar se photo lein. | Lay the necklace flat and shoot from directly above. |
| `earrings_pair_missing` | Dono earrings ek saath rakhein — pair dikhna chahiye. | Show both earrings together — display the pair. |
| `jar_top_down` | Jar ko side se photo lein — label dikhna chahiye. | Shoot the jar from the side — the label must be visible. |
| `garment_folded` | Kapde ko iron karke flat rakho, phir photo lein. | Iron the garment, lay it flat, then photograph. |
| `garment_distorted` | Phone seedha rakho — angle se garment ka shape bigad jaata hai. | Keep the phone straight — an angled shot distorts the garment shape. |
| `bag_collapsed` | Bag ke andar tissue ya kapda rakhein — shape banana ke liye. | Stuff the bag with tissue or cloth to give it shape. |
| `candle_top_down` | Candle ko side se photo lein — label aur shape dono dikhenge. | Shoot the candle from the side — you'll see both label and shape. |
| `food_flat` | Thoda side se photo lein — depth aur texture zyada achhi dikhegi. | Shoot from a slight angle — depth and texture will look much better. |
