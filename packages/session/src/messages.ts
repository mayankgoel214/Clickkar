/**
 * All bot message templates — streamlined V2 flow.
 * Quick-fire: details before photo, minimal messages.
 */

type Lang = 'hi' | 'en';

// ---------------------------------------------------------------------------
// SETUP (first-time onboarding — 3 messages total)
// ---------------------------------------------------------------------------

export function msgWelcomeAndAskName(lang: Lang): string {
  if (lang === 'hi') {
    return 'Namaste! Clickkar mein swagat hai.\nAapke product ki photo professional bana denge — Rs 99, 60 second mein.\nPehli baar bilkul free!\n\nAapka naam bataiye?';
  }
  return 'Welcome to Clickkar!\nWe make your product photos professional — Rs 99, 60 seconds.\nFirst one is completely free!\n\nWhat\'s your name?';
}

export function msgGreetAndAskCategory(lang: Lang, name: string): string {
  if (lang === 'hi') {
    return `Shukriya, ${name} ji!\nAap kaunsa product bechte hain?`;
  }
  return `Thanks, ${name}!\nWhat kind of product do you sell?`;
}

export function msgAskStyle(lang: Lang, name: string, recommendedStyleName?: string): string {
  const rec = recommendedStyleName ? `\n${recommendedStyleName} best rahega.` : '';
  if (lang === 'hi') {
    return `${name} ji, kaunsa style chahiye?${rec}`;
  }
  return `${name}, which style would you like?${rec ? `\n${recommendedStyleName} works best for your products.` : ''}`;
}

export function msgAskInstructionsAndPhoto(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kuch special batana hai? Text ya voice note bhejein.\nYa seedha product ki photo bhejiye.';
  }
  return 'Anything special? Send text or a voice note.\nOr just send your product photo.';
}

export function msgInstructionsReceived(lang: Lang): string {
  if (lang === 'hi') {
    return 'Samajh gaya! Ab photo bhejiye.';
  }
  return 'Got it! Now send your photo.';
}

// ---------------------------------------------------------------------------
// RETURNING USER
// ---------------------------------------------------------------------------

export function msgWelcomeBackWithStyle(lang: Lang, name: string, styleName: string): string {
  if (lang === 'hi') {
    return `Wapas aao, ${name} ji!\nPichli baar ${styleName} use kiya tha. Wahi style?`;
  }
  return `Welcome back, ${name}!\nLast time you used ${styleName}. Same style?`;
}

export function msgWelcomeBackNoStyle(lang: Lang, name: string): string {
  if (lang === 'hi') {
    return `Wapas aao, ${name} ji!\nNaya photo banwana hai?`;
  }
  return `Welcome back, ${name}!\nReady for a new product photo?`;
}

export function msgSendPhoto(lang: Lang): string {
  if (lang === 'hi') {
    return 'Photo bhejiye — 5 tak bhej sakte hain.';
  }
  return 'Send your photo — up to 5 at once.';
}

// ---------------------------------------------------------------------------
// PHOTO RECEIVED
// ---------------------------------------------------------------------------

export function msgPhotoReceived(lang: Lang, count: number): string {
  if (count === 1) {
    if (lang === 'hi') return 'Photo mil gayi! Aur bhejein (max 5) ya thodi der rukein.';
    return 'Photo received! Send more (max 5) or wait a moment.';
  }
  if (lang === 'hi') return `${count} photos mil gayi!`;
  return `${count} photos received!`;
}

export function msgPhotoReceivedWithPayment(
  lang: Lang,
  name: string,
  imageCount: number,
  styleName: string,
  totalRs: number,
): string {
  const photoText = imageCount > 1 ? `${imageCount} photos` : '1 photo';
  if (totalRs === 0) {
    if (lang === 'hi') {
      return `Photo mil gayi, ${name} ji!\n${photoText} • ${styleName}\nPehli baar free hai! Rs 0`;
    }
    return `Photo received, ${name}!\n${photoText} • ${styleName}\nYour first one is free! Rs 0`;
  }
  if (lang === 'hi') {
    return `Photo mil gayi, ${name} ji!\n${photoText} • ${styleName}\nRs ${totalRs} ka payment karein.`;
  }
  return `Photo received, ${name}!\n${photoText} • ${styleName}\nPay Rs ${totalRs} to get started.`;
}

// ---------------------------------------------------------------------------
// RETURNING USER + PHOTO (confirm style)
// ---------------------------------------------------------------------------

export function msgConfirmStyleForPhoto(lang: Lang, name: string, styleName: string): string {
  if (lang === 'hi') {
    return `Photo mil gayi, ${name} ji!\n${styleName} style lagayein?`;
  }
  return `Got your photo, ${name}!\nUse ${styleName} style?`;
}

// ---------------------------------------------------------------------------
// PAYMENT
// ---------------------------------------------------------------------------

export function msgPaymentConfirmed(lang: Lang): string {
  if (lang === 'hi') {
    return 'Payment mil gayi! Aapki photo banana shuru kar rahe hain...';
  }
  return 'Payment received! Starting to process your photo now...';
}

export function msgProcessingStarted(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kaam shuru! 60 second mein ready.';
  }
  return 'Processing started! Ready in about 60 seconds.';
}

export function msgPaymentPending(lang: Lang): string {
  if (lang === 'hi') {
    return 'Payment abhi tak nahi aayi. Link fir se bhejein?';
  }
  return 'Payment not received yet. Shall I resend the link?';
}

export function msgPaymentFailed(lang: Lang): string {
  if (lang === 'hi') {
    return 'Payment fail ho gayi. Ek aur try karein — link fir se bhej raha hun.';
  }
  return 'Payment failed. Try again — sending the link once more.';
}

// ---------------------------------------------------------------------------
// PROCESSING
// ---------------------------------------------------------------------------

export function msgProcessingDelay(lang: Lang): string {
  if (lang === 'hi') {
    return 'Thoda aur time lag raha hai... bas 1-2 minute aur.';
  }
  return 'Taking a bit longer... just 1-2 more minutes.';
}

export function msgProcessingStuck(lang: Lang): string {
  if (lang === 'hi') {
    return 'Maaf kijiye, processing mein dikkat aayi. Photo dobara bhejein.';
  }
  return 'Sorry, there was an issue with processing. Please send your photo again.';
}

// ---------------------------------------------------------------------------
// DELIVERY
// ---------------------------------------------------------------------------

export function msgImageDelivered(lang: Lang, userName?: string, index?: number, total?: number): string {
  const name = userName ? `${userName} ji` : '';
  const counter = index && total && total > 1 ? ` (${index}/${total})` : '';
  if (lang === 'hi') {
    return `Taiyaar hai${name ? ', ' + name : ''}!${counter}\nAapki professional product photo ready hai.`;
  }
  return `Here it is${name ? ', ' + name : ''}!${counter}\nYour professional product photo is ready.`;
}

export function msgAskFeedback(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kaise lagi? Neeche se bataiye:';
  }
  return 'How does it look? Let us know:';
}

export function msgThankYou(lang: Lang, isFirstOrder: boolean): string {
  if (isFirstOrder) {
    if (lang === 'hi') {
      return 'Bahut shukriya!\nAgle baar sirf Rs 99 mein. Worth it?';
    }
    return 'Thank you!\nNext one is just Rs 99. Worth it?';
  }
  if (lang === 'hi') {
    return 'Shukriya! Doston ko bhi Clickkar ke baare mein batayein.';
  }
  return 'Thank you! Tell your friends about Clickkar.';
}

// ---------------------------------------------------------------------------
// EDIT
// ---------------------------------------------------------------------------

export function msgEditProcessing(lang: Lang): string {
  if (lang === 'hi') {
    return 'Badlav kar raha hun... thodi der mein ready.';
  }
  return 'Applying your changes... ready shortly.';
}

export function msgRevisionLimitReached(lang: Lang): string {
  if (lang === 'hi') {
    return 'Free revision use ho gayi. Rs 29 mein yeh badlav hoga?';
  }
  return 'Free revisions used up. This change costs Rs 29.';
}

// ---------------------------------------------------------------------------
// ERRORS
// ---------------------------------------------------------------------------

export function msgUnknownMessage(lang: Lang): string {
  if (lang === 'hi') {
    return 'Samajh nahi aaya. Photo bhejein ya option chuniye.';
  }
  return "Didn't catch that. Send a photo or choose an option.";
}

export function msgGenericError(lang: Lang): string {
  if (lang === 'hi') {
    return 'Kuch gadbad ho gayi. Thodi der baad try karein.';
  }
  return 'Something went wrong. Please try again in a moment.';
}

export function msgEarlyPhotoAck(lang: Lang): string {
  if (lang === 'hi') {
    return 'Photo save ho gayi! Pehle setup pura kar lein, phir process karenge.';
  }
  return 'Photo saved! Let me finish setup first, then we\'ll process it.';
}

// ---------------------------------------------------------------------------
// STYLE & CATEGORY DISPLAY NAMES
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
    style_with_model: { hi: 'Model Ke Saath', en: 'With Model' },
  };
  return names[styleId]?.[lang] ?? styleId;
}

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
