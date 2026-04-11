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
    return 'Namaste! Clickkar mein swagat hai.\nAapke product ki photo professional bana denge — Rs 99, 1-2 minute mein.\nPehli baar bilkul free!\n\nAapka naam bataiye?';
  }
  return 'Welcome to Clickkar!\nWe make your product photos professional — Rs 99, under 2 minutes.\nFirst one is completely free!\n\nWhat\'s your name?';
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
    return `${name} ji! Photo bhejiye — ${styleName} mein banayenge.\nStyle badlana hai?`;
  }
  return `${name}! Send your photo — we'll use ${styleName}.\nWant a different style?`;
}

export function msgWelcomeBackNoStyle(lang: Lang, name: string): string {
  if (lang === 'hi') {
    return `Wapas aao, ${name} ji!\nNaya photo banwana hai?`;
  }
  return `Welcome back, ${name}!\nReady for a new product photo?`;
}

export function msgSendPhoto(lang: Lang, isFirstOrder: boolean): string {
  if (isFirstOrder) {
    if (lang === 'hi') {
      return 'Photo bhejiye! 📸 Pehli photo bilkul free.\n(Zyada bheji to Rs 99 per photo.)';
    }
    return 'Send your photo! 📸 First one is free.\n(Additional photos are Rs 99 each.)';
  }
  if (lang === 'hi') {
    return 'Photo bhejiye! 📸\n5 tak bhej sakte hain. Rs 99 per photo.';
  }
  return 'Send your photo! 📸\nUp to 5 at once. Rs 99 per photo.';
}

// ---------------------------------------------------------------------------
// PHOTO RECEIVED
// ---------------------------------------------------------------------------

export function msgPhotoReadyForProcessing(lang: Lang, count: number): string {
  if (lang === 'hi') {
    return `${count} photo${count > 1 ? 'en' : ''} taiyaar! Process karein ya instructions add karein?`;
  }
  return `${count} photo${count > 1 ? 's' : ''} ready! Process now or add instructions?`;
}

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
    return `${name} ji, ${photoText} • ${styleName}\nRs ${totalRs} — UPI se 1 minute mein ho jayega.`;
  }
  return `${name}, ${photoText} • ${styleName}\nRs ${totalRs} via UPI — done in 1 minute.`;
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
    return 'Ho gaya! ✨ Ab 1-2 minute mein aapki photo aayegi.';
  }
  return 'Done! ✨ Your photo will be ready in about 1-2 minutes.';
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
    return "Arre! Kuch gadbad ho gayi. Kripya dobara try karein — 'hi' bhej ke naya order shuru karein.";
  }
  return "Oops! Something went wrong. Please try again — send 'hi' to start a new order.";
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
      return 'Bahut badiya! 🎉\nYeh photo Instagram ya WhatsApp group pe share karein — customers ko dikhao!\n\nAgle baar sirf Rs 99 mein. Ek aur photo banwani hai?';
    }
    return 'Awesome! 🎉\nShare this on Instagram or your WhatsApp group — show it to customers!\n\nNext one is just Rs 99. Want another photo?';
  }
  if (lang === 'hi') {
    return 'Bahut badiya! 🎉\nYeh photo share karein — customers ko dikhao!\n\nEk aur product ki photo banwani hai?';
  }
  return 'Awesome! 🎉\nShare this photo — show it to customers!\n\nWant another product photo?';
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
    return '2 free edits ho chuke hain is order ke liye. ✨\n\nNaya photo bhejne ke liye "hi" bhejein!';
  }
  return 'You\'ve used your 2 free edits for this order. ✨\n\nSend "hi" to start a new photo!';
}

// ---------------------------------------------------------------------------
// ERRORS
// ---------------------------------------------------------------------------

export function msgUnknownMessage(lang: Lang): string {
  if (lang === 'hi') {
    return 'Samajh nahi aaya. 🤔 Photo bhejein ya neeche se option chuniye.';
  }
  return "Didn't catch that. 🤔 Send a photo or tap an option below.";
}

export function msgGenericError(lang: Lang): string {
  if (lang === 'hi') {
    return 'Oho! Kuch gadbad ho gayi. 😅 Ek minute baad try karein.';
  }
  return 'Oops! Something went wrong. 😅 Try again in a minute.';
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
    style_smart: { hi: '✨ Smart Style', en: '✨ Smart Style' },
    style_clean_white: { hi: 'Saaf Safed Background', en: 'Clean White Background' },
    style_lifestyle: { hi: 'Lifestyle Setting', en: 'Lifestyle Setting' },
    style_gradient: { hi: 'Dark Luxury', en: 'Dark Luxury' },
    style_outdoor: { hi: 'Outdoor Scene', en: 'Outdoor Scene' },
    style_studio: { hi: 'Colored Studio', en: 'Colored Studio' },
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
