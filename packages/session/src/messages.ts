/**
 * All bot message templates.
 * Every exported function takes language ('hi' | 'en') and returns a string.
 * Messages are kept short — max 3 lines.
 */

type Lang = 'hi' | 'en';

// ---------------------------------------------------------------------------
// ONBOARDING
// ---------------------------------------------------------------------------

export function msgWelcome(lang: Lang): string {
  if (lang === 'hi') {
    return 'Namaste! 🙏 WhatsAds mein aapka swagat hai.\nAapka product photo 60 second mein professional bana denge.\nPehli baar bilkul free!';
  }
  return 'Welcome to WhatsAds! 🙏\nWe turn your product photo professional in 60 seconds.\nFirst photo is completely free!';
}

export function msgAskLanguage(_lang: Lang): string {
  // Always shown in both languages — before language is set
  return 'Kaunsi bhasha mein baat karein?\nWhich language would you prefer?';
}

export function msgAskIfSeller(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kya aap online kuch bechte hain?\nYa sirf dekhne aaye hain?';
  }
  return 'Do you sell products online?\nOr just checking us out?';
}

export function msgShowDemo(lang: Lang): string {
  if (lang === 'hi') {
    return 'Dekho! Yeh wahi photo hai — pehle aur baad mein.\nPehli photo free, uske baad sirf Rs 99/photo.\nShuru karein?';
  }
  return 'See the difference — before and after!\nFirst photo free, then Rs 99/photo.\nReady to start?';
}

export function msgAskName(lang: Lang): string {
  if (lang === 'hi') {
    return 'Aapka naam kya hai?\n(Bas pehla naam kaafi hai)';
  }
  return 'What is your name?\n(First name is fine)';
}

export function msgAskCategory(lang: Lang): string {
  if (lang === 'hi') {
    return 'Aap kaunsa product bechte hain?\nNeeche se chuniye:';
  }
  return 'What kind of product do you sell?\nChoose from the list:';
}

export function msgDpppConsent(lang: Lang): string {
  if (lang === 'hi') {
    return 'Aapki photo sirf order process karne ke liye use hogi.\nHum kisi ke saath share nahi karte. Privacy 100% safe hai.';
  }
  return 'Your photos are only used to process your order.\nWe never share them. Your privacy is 100% safe.';
}

export function msgOnboardingComplete(lang: Lang): string {
  if (lang === 'hi') {
    return 'Badiya! Ab apne product ki photo bhejiye. 📸\nEk ya zyada photos bhej sakte hain (max 5).';
  }
  return 'Great! Now send your product photo. 📸\nYou can send up to 5 photos at once.';
}

// ---------------------------------------------------------------------------
// PHOTO TIPS
// ---------------------------------------------------------------------------

export function msgPhotoTipJewellery(lang: Lang): string {
  if (lang === 'hi') {
    return 'Tip: Jewellery ko seedha ya thoda angle pe rakhein.\nClose-up lein jisse detail dikhe.\nSaaf safed background best hai.';
  }
  return 'Tip: Place jewellery straight on or at a slight angle.\nGet a close-up to show detail.\nA clean white background works best.';
}

export function msgPhotoTipFood(lang: Lang): string {
  if (lang === 'hi') {
    return 'Tip: Upar se photo lein (overhead) ya 45° angle.\nTexture aur color dikhaiye.\nKhidki ke paas natural light use karein.';
  }
  return 'Tip: Shoot from above (overhead) or at 45°.\nShow texture and colour.\nUse natural light near a window.';
}

export function msgPhotoTipGarment(lang: Lang): string {
  if (lang === 'hi') {
    return 'Tip: Kapde ko flat rakhein ya hanger pe latkaayein.\nPoori garment frame mein aani chahiye.\nSaaf background use karein.';
  }
  return 'Tip: Lay flat or hang on a hanger.\nFull garment should be in frame.\nUse a plain background.';
}

export function msgPhotoTipSkincare(lang: Lang): string {
  if (lang === 'hi') {
    return 'Tip: Bottle ka label seedha camera ki taraf hona chahiye.\nThoda angle dein jisse shape dikhe.\nSoft lighting best hai.';
  }
  return 'Tip: Point the label straight at the camera.\nA slight angle shows the product shape.\nSoft lighting works best.';
}

export function msgPhotoTipCandle(lang: Lang): string {
  if (lang === 'hi') {
    return 'Tip: Wick aur vessel ka shape dikhaye.\nThoda 3/4 angle use karein.\nWarm background accha lagta hai.';
  }
  return 'Tip: Show the wick and vessel shape.\nUse a slight 3/4 angle.\nA warm background looks great.';
}

export function msgPhotoTipBag(lang: Lang): string {
  if (lang === 'hi') {
    return 'Tip: 3/4 angle se photo lein — front pocket aur handle dono dikhen.\nBag ko stuffed rakhein shape ke liye.\nSaaf background use karein.';
  }
  return 'Tip: Use a 3/4 angle — show the front pocket and handle.\nStuff the bag lightly to hold its shape.\nUse a clean background.';
}

export function msgPhotoTipGeneral(lang: Lang): string {
  if (lang === 'hi') {
    return 'Tip: Product poora frame mein aana chahiye.\nSaaf background use karein.\nAcha lighting use karein.';
  }
  return 'Tip: Make sure the full product is in frame.\nUse a plain background.\nGood lighting makes a big difference.';
}

export function msgCleanLensTip(lang: Lang): string {
  if (lang === 'hi') {
    return 'Pehle camera ka lens saaf kar lein!\nCapde se ek baar pochh lein — photo aur bhi acchi aayegi.';
  }
  return 'Quick tip: wipe your camera lens first!\nA clean lens makes photos much sharper.';
}

// ---------------------------------------------------------------------------
// IMAGE FLOW
// ---------------------------------------------------------------------------

export function msgImageReceived(lang: Lang): string {
  if (lang === 'hi') {
    return 'Photo mil gayi! ✅\nAur photos bhejein, ya style chunne ke liye rukein.';
  }
  return 'Photo received! ✅\nSend more, or wait to choose your style.';
}

export function msgAskStyle(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kaunsa style chahiye aapko?\nNeeche se chuniye:';
  }
  return 'Which style would you like?\nChoose from the list below:';
}

export function msgAskVoice(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kuch khaas batana chahte hain?\nVoice note ya text mein batayein — ya Skip karein.';
  }
  return 'Anything special to add?\nSend a voice note or text — or tap Skip.';
}

export function msgOrderSummary(
  lang: Lang,
  imageCount: number,
  style: string,
  totalPaise: number,
): string {
  const totalRs = totalPaise / 100;
  if (lang === 'hi') {
    return `Aapka order:\n📸 ${imageCount} photo • Style: ${style}\n💰 Total: Rs ${totalRs}`;
  }
  return `Your order:\n📸 ${imageCount} photo(s) • Style: ${style}\n💰 Total: Rs ${totalRs}`;
}

export function msgConfirmOrder(lang: Lang): string {
  if (lang === 'hi') {
    return 'Sab theek hai? Order confirm karein ya style badlein.';
  }
  return 'All good? Confirm your order or change the style.';
}

// ---------------------------------------------------------------------------
// PAYMENT
// ---------------------------------------------------------------------------

export function msgPaymentRequest(lang: Lang, totalRs: number): string {
  if (lang === 'hi') {
    return `Rs ${totalRs} ka payment karein neeche diye button se.\nUPI, card, netbanking — sab chalega.`;
  }
  return `Please pay Rs ${totalRs} using the button below.\nUPI, card, or netbanking — all accepted.`;
}

export function msgPaymentPending(lang: Lang): string {
  if (lang === 'hi') {
    return 'Payment mein koi problem? 🤔\nLink fir se bhejein? Ya koi help chahiye?';
  }
  return 'Having trouble with payment? 🤔\nShall I resend the link? Or need help?';
}

export function msgPaymentAbandoned(lang: Lang): string {
  if (lang === 'hi') {
    return 'Koi baat nahi! Jab bhi ready hon, wapas aa jaana. 😊\nAapka order save hai.';
  }
  return "No worries! Come back whenever you're ready. 😊\nYour order is saved.";
}

export function msgPaymentFailed(lang: Lang): string {
  if (lang === 'hi') {
    return 'Payment fail ho gayi. 😕\nEk baar aur try karein — link fir se bhej raha hun.';
  }
  return 'Payment failed. 😕\nPlease try again — sending the link once more.';
}

export function msgPaymentWebhookDelay(lang: Lang): string {
  if (lang === 'hi') {
    return 'Payment confirm ho raha hai... ⏳\nEk minute mein update milega.';
  }
  return 'Confirming your payment... ⏳\nYou will get an update in a minute.';
}

export function msgPaymentConfirmed(lang: Lang): string {
  if (lang === 'hi') {
    return 'Payment mil gayi! ✅\nAb aapki photo banana shuru karte hain...';
  }
  return 'Payment received! ✅\nStarting to process your photo now...';
}

// ---------------------------------------------------------------------------
// PROCESSING
// ---------------------------------------------------------------------------

export function msgProcessingStarted(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kaam shuru ho gaya! ⚡\n60 second mein ready ho jaayegi.';
  }
  return 'Processing started! ⚡\nWill be ready in about 60 seconds.';
}

export function msgProcessingDelay(lang: Lang): string {
  if (lang === 'hi') {
    return 'Thoda aur time lag raha hai... 🔄\nAbhi bhi kaam chal raha hai, bas 1-2 minute aur.';
  }
  return 'Taking a little longer than usual... 🔄\nStill working — just 1-2 more minutes.';
}

// ---------------------------------------------------------------------------
// DELIVERY
// ---------------------------------------------------------------------------

export function msgImageDelivered(lang: Lang, userName?: string, index?: number, total?: number): string {
  const name = userName ? `${userName} ji` : '';
  const counter = index && total ? ` (${index}/${total})` : '';
  if (lang === 'hi') {
    return `Taiyaar hai${name ? ', ' + name : ''}! ✨${counter}\nAapki professional product photo ready hai.`;
  }
  return `Here it is${name ? ', ' + name : ''}! ✨${counter}\nYour professional product photo is ready.`;
}

export function msgAskFeedback(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kaise lagi photo? 😊\nNeeche se bataiye:';
  }
  return 'How does it look? 😊\nLet us know below:';
}

export function msgThankYou(lang: Lang, _userName?: string): string {
  if (lang === 'hi') {
    return 'Bahut shukriya! 🙏\nApne doston ko WhatsAds ke baare mein batayein aur unhe bhi free photo dilaayein!';
  }
  return 'Thank you so much! 🙏\nTell your friends about WhatsAds and get them a free photo too!';
}

// ---------------------------------------------------------------------------
// EDIT
// ---------------------------------------------------------------------------

export function msgAskWhatToChange(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kya badlana chahte hain?\nNeeche se chuniye:';
  }
  return 'What would you like to change?\nChoose from the list:';
}

export function msgStartOver(lang: Lang): string {
  if (lang === 'hi') {
    return 'Koi baat nahi! Nayi style se shuru karte hain.\nWahi photo use karein ya nayi bhejein?';
  }
  return 'No problem! Let\'s start fresh.\nUse the same photo or send a new one?';
}

export function msgEditProcessing(lang: Lang): string {
  if (lang === 'hi') {
    return 'Naya background laga raha hun... 🔄\nThodi der mein ready ho jaayega.';
  }
  return 'Applying your changes... 🔄\nWill be ready shortly.';
}

export function msgEditDelivered(lang: Lang): string {
  if (lang === 'hi') {
    return 'Naya version ready hai! ✨\nKaisa laga baar?';
  }
  return 'Updated version ready! ✨\nHow does this look?';
}

export function msgRevisionLimitReached(lang: Lang): string {
  if (lang === 'hi') {
    return 'Free revision use ho gayi. 😊\nRs 29 mein yeh badlav hoga — payment karein?';
  }
  return 'Free revisions used up. 😊\nThis change costs Rs 29 — shall we proceed?';
}

// ---------------------------------------------------------------------------
// RETURNING USER
// ---------------------------------------------------------------------------

export function msgWelcomeBack(lang: Lang, name: string): string {
  if (lang === 'hi') {
    return `Wapas aao, ${name} ji! 😊\nNaya product photo banwana hai?`;
  }
  return `Welcome back, ${name}! 😊\nReady to create another product photo?`;
}

// ---------------------------------------------------------------------------
// ERROR
// ---------------------------------------------------------------------------

export function msgUnknownMessage(lang: Lang): string {
  if (lang === 'hi') {
    return 'Main samajh nahi paaya. 🤔\nPhoto bhejein ya neeche se option chuniye.';
  }
  return "I didn't understand that. 🤔\nSend a photo or choose an option below.";
}

export function msgPhotoTooBlurry(lang: Lang): string {
  if (lang === 'hi') {
    return 'Photo thodi blur hai. 📸\nKya aap ek aur clear photo bhej sakte hain?';
  }
  return 'This photo is a bit blurry. 📸\nCould you send a clearer one?';
}

export function msgPhotoTooDark(lang: Lang): string {
  if (lang === 'hi') {
    return 'Photo mein roshni kam hai. 💡\nKhidki ke paas ya light ke saamne photo lein.';
  }
  return 'The photo is too dark. 💡\nTry near a window or under good light.';
}

export function msgPhotoNoProduct(lang: Lang): string {
  if (lang === 'hi') {
    return 'Product photo mein nahi dikha. 🔍\nProduct ko frame ke beech rakhein aur dobara bhejein.';
  }
  return 'Could not find a product in this photo. 🔍\nPlace the product in the centre and try again.';
}

export function msgGenericError(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kuch gadbad ho gayi. 😕\nThodi der baad dobara try karein.';
  }
  return 'Something went wrong. 😕\nPlease try again in a moment.';
}

// ---------------------------------------------------------------------------
// MULTI-IMAGE
// ---------------------------------------------------------------------------

export function msgMultiImageReceived(lang: Lang, count: number): string {
  if (lang === 'hi') {
    return `${count} photos mil gayi! ✅\nAur bhejein ya style chunne ke liye rukein.`;
  }
  return `${count} photos received! ✅\nSend more or wait to choose your style.`;
}

export function msgAskSameOrDifferentStyle(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kya sabhi photos ek hi style mein chahiye?\nYa alag-alag style?';
  }
  return 'Should all photos use the same style?\nOr different styles for each?';
}

export function msgBatchPricing(lang: Lang, count: number, totalRs: number): string {
  if (lang === 'hi') {
    return `${count} photos × Rs 99 = Rs ${totalRs}\nSabhi ek saath process hongi. 🚀`;
  }
  return `${count} photos × Rs 99 = Rs ${totalRs}\nAll will be processed together. 🚀`;
}

// ---------------------------------------------------------------------------
// STYLE DISPLAY NAMES
// ---------------------------------------------------------------------------

export function styleDisplayName(styleId: string, lang: Lang): string {
  const names: Record<string, { hi: string; en: string }> = {
    style_clean_white: { hi: 'Saaf Safed Background', en: 'Clean White Background' },
    style_lifestyle: { hi: 'Lifestyle Setting', en: 'Lifestyle Setting' },
    style_gradient: { hi: 'Gradient Background', en: 'Gradient Background' },
    style_outdoor: { hi: 'Outdoor Scene', en: 'Outdoor Scene' },
    style_studio: { hi: 'Studio Look', en: 'Studio Look' },
    style_festive: { hi: 'Tyohar Style', en: 'Festive Style' },
    style_minimal: { hi: 'Minimal Saaf', en: 'Minimal & Clean' },
  };
  return names[styleId]?.[lang] ?? styleId;
}

// ---------------------------------------------------------------------------
// CATEGORY DISPLAY NAMES
// ---------------------------------------------------------------------------

export function categoryDisplayName(categoryId: string, lang: Lang): string {
  const names: Record<string, { hi: string; en: string }> = {
    cat_jewellery: { hi: 'Jewellery / Zewar', en: 'Jewellery' },
    cat_food: { hi: 'Khaana / Food', en: 'Food' },
    cat_garment: { hi: 'Kapde / Garments', en: 'Garments' },
    cat_skincare: { hi: 'Skincare / Beauty', en: 'Skincare / Beauty' },
    cat_candle: { hi: 'Candle / Home Decor', en: 'Candle / Home Decor' },
    cat_bag: { hi: 'Bag / Purse', en: 'Bag / Purse' },
    cat_general: { hi: 'Kuch Aur / Other', en: 'Other' },
  };
  return names[categoryId]?.[lang] ?? categoryId;
}
