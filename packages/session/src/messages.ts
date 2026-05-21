/**
 * All bot message templates — streamlined V2 flow.
 * Quick-fire: details before photo, minimal messages.
 */

import type { Language } from './types.js';
type Lang = Language;

// ---------------------------------------------------------------------------
// SETUP (first-time onboarding — 3 messages total)
// ---------------------------------------------------------------------------

export function msgWelcomeAndAskName(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Namaste! Autmn mein swagat hai.\nAapke product ki photo professional bana denge — Rs 99, 1-2 minute mein.\nPehli baar bilkul free!\n\nAapka naam bataiye?';
    case 'hi':
      return 'नमस्ते! Autmn में आपका स्वागत है।\nआपके product की photo professional बना देंगे — Rs 99, 1-2 minute में।\nपहली बार बिल्कुल free!\n\nआपका नाम बताइए?';
    case 'ta':
      return 'வணக்கம்! Autmn-க்கு வரவேற்கிறோம்.\nஉங்கள் product photo-ஐ professional-ஆக மாற்றுவோம் — Rs 99, 1-2 minute-ல்.\nமுதல் முறை முற்றிலும் free!\n\nஉங்கள் பெயர் சொல்லுங்கள்?';
    case 'te':
      return 'నమస్కారం! Autmn కు స్వాగతం.\nమీ product photo-ని professional గా తయారు చేస్తాం — Rs 99, 1-2 minute లో.\nమొదటిసారి పూర్తిగా free!\n\nమీ పేరు చెప్పండి?';
    case 'bn':
      return 'নমস্কার! Autmn-এ স্বাগতম।\nআপনার product photo professional করে দেব — Rs 99, 1-2 minute-এ।\nপ্রথমবার একদম free!\n\nআপনার নাম বলুন?';
    case 'mr':
      return 'नमस्कार! Autmn मध्ये स्वागत आहे.\nतुमच्या product ची photo professional बनवतो — Rs 99, 1-2 minute मध्ये.\nपहिल्यांदा पूर्णपणे free!\n\nतुमचं नाव सांगा?';
    case 'gu':
      return 'નમસ્તે! Autmn માં સ્વાગત છે.\nતમારા product ની photo professional બનાવીશું — Rs 99, 1-2 minute માં.\nપહેલી વખત બિલ્કુલ free!\n\nતમારું નામ જણાવો?';
    case 'kn':
      return 'ನಮಸ್ಕಾರ! Autmn ಗೆ ಸ್ವಾಗತ.\nನಿಮ್ಮ product photo professional ಆಗಿ ಮಾಡ್ತೀವಿ — Rs 99, 1-2 minute-ಲ್ಲಿ.\nಮೊದಲ ಬಾರಿ ಸಂಪೂರ್ಣ free!\n\nನಿಮ್ಮ ಹೆಸರು ಹೇಳಿ?';
    case 'ml':
      return 'നമസ്കാരം! Autmn-ലേക്ക് സ്വാഗതം.\nനിങ്ങളുടെ product photo professional ആക്കി തരാം — Rs 99, 1-2 minute-ൽ.\nആദ്യത്തേത് തീർത്തും free!\n\nനിങ്ങളുടെ പേര് പറയൂ?';
    case 'pa':
      return 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! Autmn ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ.\nਤੁਹਾਡੀ product photo professional ਬਣਾ ਦੇਵਾਂਗੇ — Rs 99, 1-2 minute ਵਿੱਚ.\nਪਹਿਲੀ ਵਾਰ ਬਿਲਕੁਲ free!\n\nਤੁਹਾਡਾ ਨਾਮ ਦੱਸੋ?';
    case 'or':
      return 'ନମସ୍କାର! Autmn କୁ ସ୍ୱାଗତ.\nଆପଣଙ୍କ product photo professional କରି ଦେବୁ — Rs 99, 1-2 minute ରେ.\nପ୍ରଥମ ଥର ସম୍ପୂର୍ଣ୍ଣ free!\n\nଆପଣଙ୍କ ନାମ କୁହନ୍ତୁ?';
    case 'en':
    default:
      return 'Welcome to Autmn!\nWe make your product photos professional — Rs 99, under 2 minutes.\nFirst one is completely free!\n\nWhat\'s your name?';
  }
}

export function msgGreetAndAskCategory(lang: Lang, name: string): string {
  switch (lang) {
    case 'hinglish':
      return `Shukriya, ${name} ji!\nAap kaunsa product bechte hain?`;
    case 'hi':
      return `शुक्रिया, ${name} जी!\nआप कौन सा product बेचते हैं?`;
    case 'ta':
      return `நன்றி, ${name}!\nநீங்கள் என்ன product விற்கிறீர்கள்?`;
    case 'te':
      return `థాంక్యూ, ${name}!\nమీరు ఏ product అమ్ముతారు?`;
    case 'bn':
      return `ধন্যবাদ, ${name}!\nআপনি কোন product বিক্রি করেন?`;
    case 'mr':
      return `धन्यवाद, ${name}!\nतुम्ही कोणता product विकता?`;
    case 'gu':
      return `આભાર, ${name}!\nતમે કયો product વેચો છો?`;
    case 'kn':
      return `ಧನ್ಯವಾದ, ${name}!\nನೀವು ಯಾವ product ಮಾರ್ತೀರಿ?`;
    case 'ml':
      return `നന്ദി, ${name}!\nനിങ്ങൾ ഏത് product വിൽക്കുന്നു?`;
    case 'pa':
      return `ਧੰਨਵਾਦ, ${name}!\nਤੁਸੀਂ ਕਿਹੜਾ product ਵੇਚਦੇ ਹੋ?`;
    case 'or':
      return `ଧନ୍ୟବାଦ, ${name}!\nଆପଣ କେଉଁ product ବିକ୍ରି କରନ୍ତି?`;
    case 'en':
    default:
      return `Thanks, ${name}!\nWhat kind of product do you sell?`;
  }
}

export function msgAskStyle(lang: Lang, name: string, recommendedStyleName?: string): string {
  switch (lang) {
    case 'hinglish': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} best rahega.` : '';
      return `${name} ji, kaunsa style chahiye?${rec}`;
    }
    case 'hi': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} सबसे अच्छा रहेगा।` : '';
      return `${name} जी, कौन सा style चाहिए?${rec}`;
    }
    case 'ta': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} best-ஆக இருக்கும்.` : '';
      return `${name}, எந்த style வேண்டும்?${rec}`;
    }
    case 'te': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} best గా ఉంటుంది.` : '';
      return `${name}, ఏ style కావాలి?${rec}`;
    }
    case 'bn': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} সবচেয়ে ভালো হবে।` : '';
      return `${name}, কোন style চাই?${rec}`;
    }
    case 'mr': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} सगळ्यात चांगला असेल.` : '';
      return `${name}, कोणता style हवा?${rec}`;
    }
    case 'gu': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} સૌથી સારો રહેશે.` : '';
      return `${name}, કયો style જોઈએ?${rec}`;
    }
    case 'kn': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} best ಆಗಿರುತ್ತೆ.` : '';
      return `${name}, ಯಾವ style ಬೇಕು?${rec}`;
    }
    case 'ml': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} best ആയിരിക്കും.` : '';
      return `${name}, ഏത് style വേണം?${rec}`;
    }
    case 'pa': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} ਸਭ ਤੋਂ ਵਧੀਆ ਰਹੇਗਾ.` : '';
      return `${name}, ਕਿਹੜਾ style ਚਾਹੀਦਾ?${rec}`;
    }
    case 'or': {
      const rec = recommendedStyleName ? `\n${recommendedStyleName} ସବୁଠୁ ଭଲ ହେବ.` : '';
      return `${name}, କେଉଁ style ଚାହୁଁଛନ୍ତି?${rec}`;
    }
    case 'en':
    default:
      return `${name}, which style would you like?${recommendedStyleName ? `\n${recommendedStyleName} works best for your products.` : ''}`;
  }
}

export function msgAskInstructionsAndPhoto(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Kuch special batana hai? Text ya voice note bhejein.\nYa seedha product ki photo bhejiye.';
    case 'hi':
      return 'कुछ special बताना है? Text या voice note भेजें।\nया सीधे product की photo भेजिए।';
    case 'ta':
      return 'ஏதாவது special சொல்ல வேண்டுமா? Text அல்லது voice note அனுப்புங்கள்.\nஅல்லது நேரடியாக product photo அனுப்புங்கள்.';
    case 'te':
      return 'ఏదైనా special చెప్పాలా? Text లేదా voice note పంపండి.\nలేదా నేరుగా product photo పంపండి.';
    case 'bn':
      return 'কিছু special বলতে চান? Text বা voice note পাঠান।\nঅথবা সরাসরি product photo পাঠান।';
    case 'mr':
      return 'काही special सांगायचं आहे का? Text किंवा voice note पाठवा.\nकिंवा थेट product photo पाठवा.';
    case 'gu':
      return 'કંઈ special છે? Text અથવા voice note મોકલો.\nઅથવા સીધો product photo મોકલો.';
    case 'kn':
      return 'ಏನಾದ್ರೂ special ಹೇಳಬೇಕಾ? Text ಅಥವಾ voice note ಕಳಿಸಿ.\nಅಥವಾ ನೇರವಾಗಿ product photo ಕಳಿಸಿ.';
    case 'ml':
      return 'എന്തെങ്കിലും special ഉണ്ടോ? Text അല്ലെങ്കിൽ voice note അയക്കൂ.\nഅല്ലെങ്കിൽ നേരെ product photo അയക്കൂ.';
    case 'pa':
      return 'ਕੁਝ special ਦੱਸਣਾ ਹੈ? Text ਜਾਂ voice note ਭੇਜੋ.\nਜਾਂ ਸਿੱਧਾ product photo ਭੇਜੋ.';
    case 'or':
      return 'କିଛି special ଅଛି? Text ବା voice note ପଠାନ୍ତୁ.\nଅଥବା ସିଧାସଳଖ product photo ପଠାନ୍ତୁ.';
    case 'en':
    default:
      return 'Anything special? Send text or a voice note.\nOr just send your product photo.';
  }
}

export function msgInstructionsReceived(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Samajh gaya! Ab photo bhejiye.';
    case 'hi':
      return 'समझ गया! अब photo भेजिए।';
    case 'ta':
      return 'புரிந்தது! இப்போது photo அனுப்புங்கள்.';
    case 'te':
      return 'అర్థమైంది! ఇప్పుడు photo పంపండి.';
    case 'bn':
      return 'বুঝেছি! এখন photo পাঠান।';
    case 'mr':
      return 'समजलं! आता photo पाठवा.';
    case 'gu':
      return 'સમજ્યો! હવે photo મોકલો.';
    case 'kn':
      return 'ಅರ್ಥ ಆಯ್ತು! ಈಗ photo ಕಳಿಸಿ.';
    case 'ml':
      return 'മനസ്സിലായി! ഇപ്പോൾ photo അയക്കൂ.';
    case 'pa':
      return 'ਸਮਝ ਗਿਆ! ਹੁਣ photo ਭੇਜੋ.';
    case 'or':
      return 'ବୁଝିଲି! ଏବେ photo ପଠାନ୍ତୁ.';
    case 'en':
    default:
      return 'Got it! Now send your photo.';
  }
}

// ---------------------------------------------------------------------------
// STYLE PICKER (3-step flow)
// ---------------------------------------------------------------------------

export function msgStylePicked(lang: Lang, styleName: string, pickNumber: number): string {
  switch (lang) {
    case 'hinglish':
      return `✅ *${styleName}* choose kiya! (${pickNumber}/3)`;
    case 'hi':
      return `✅ *${styleName}* चुन लिया! (${pickNumber}/3)`;
    case 'ta':
      return `✅ *${styleName}* தேர்ந்தெடுத்தாயிற்று! (${pickNumber}/3)`;
    case 'te':
      return `✅ *${styleName}* ఎంచుకున్నారు! (${pickNumber}/3)`;
    case 'bn':
      return `✅ *${styleName}* বেছে নেওয়া হয়েছে! (${pickNumber}/3)`;
    case 'mr':
      return `✅ *${styleName}* निवडला! (${pickNumber}/3)`;
    case 'gu':
      return `✅ *${styleName}* પસંદ કર્યો! (${pickNumber}/3)`;
    case 'kn':
      return `✅ *${styleName}* ಆಯ್ಕೆ ಮಾಡಿದ್ದಾರೆ! (${pickNumber}/3)`;
    case 'ml':
      return `✅ *${styleName}* തിരഞ്ഞെടുത്തു! (${pickNumber}/3)`;
    case 'pa':
      return `✅ *${styleName}* ਚੁਣਿਆ! (${pickNumber}/3)`;
    case 'or':
      return `✅ *${styleName}* ବାଛିଲେ! (${pickNumber}/3)`;
    case 'en':
    default:
      return `✅ *${styleName}* picked! (${pickNumber}/3)`;
  }
}

export function msgAllStylesReady(lang: Lang, styleNames: string[]): string {
  const list = styleNames.map((n, i) => `${i + 1}. ${n}`).join('\n');
  switch (lang) {
    case 'hinglish':
      return `3 styles ready hain! ✨\n\n${list}\n\nAb product ki photos bhejiye!`;
    case 'hi':
      return `3 styles तैयार हैं! ✨\n\n${list}\n\nअब product की photos भेजिए!`;
    case 'ta':
      return `3 styles ready! ✨\n\n${list}\n\nஇப்போது product photos அனுப்புங்கள்!`;
    case 'te':
      return `3 styles ready! ✨\n\n${list}\n\nఇప్పుడు product photos పంపండి!`;
    case 'bn':
      return `3 styles ready! ✨\n\n${list}\n\nএখন product photos পাঠান!`;
    case 'mr':
      return `3 styles तयार! ✨\n\n${list}\n\nआता product photos पाठवा!`;
    case 'gu':
      return `3 styles ready! ✨\n\n${list}\n\nહવે product photos મોકલો!`;
    case 'kn':
      return `3 styles ready! ✨\n\n${list}\n\nಈಗ product photos ಕಳಿಸಿ!`;
    case 'ml':
      return `3 styles ready! ✨\n\n${list}\n\nഇപ്പോൾ product photos അയക്കൂ!`;
    case 'pa':
      return `3 styles ready! ✨\n\n${list}\n\nਹੁਣ product photos ਭੇਜੋ!`;
    case 'or':
      return `3 styles ready! ✨\n\n${list}\n\nଏବେ product photos ପଠାନ୍ତୁ!`;
    case 'en':
    default:
      return `3 styles ready! ✨\n\n${list}\n\nNow send your product photos!`;
  }
}

export function msgSendProductPhotos(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Ab apne product ki photos bhejein! Ek hi product ki alag-alag angles se 1-5 photos bhej saktein hain. Jab ho jaye, "done" bolein.';
    case 'hi':
      return 'अब अपने प्रोडक्ट की फ़ोटो भेजें। एक ही प्रोडक्ट की अलग-अलग एंगल से 5 तक फ़ोटो भेज सकते हैं — जितनी ज़्यादा एंगल, उतना बेहतर रिज़ल्ट।\n\nसब भेज दें तो "done" लिखें।';
    case 'ta':
      return 'இப்போது உங்கள் product photos அனுப்புங்கள்! ஒரே product-ஐ வெவ்வேறு angles-ல் 1-5 photos அனுப்பலாம். முடிந்ததும் "done" என்று சொல்லுங்கள்.';
    case 'te':
      return 'ఇప్పుడు మీ product photos పంపండి! ఒకే product-ని వేర్వేరు angles నుండి 1-5 photos పంపవచ్చు. అయిపోయాక "done" అనండి.';
    case 'bn':
      return 'এখন আপনার product photos পাঠান! একই product-এর আলাদা আলাদা angles থেকে 1-5 photos পাঠাতে পারেন। শেষ হলে "done" বলুন।';
    case 'mr':
      return 'आता तुमच्या product photos पाठवा! एकाच product च्या वेगवेगळ्या angles मधून 1-5 photos पाठवता येतात. झाल्यावर "done" म्हणा.';
    case 'gu':
      return 'હવે તમારા product ની photos મોકલો! એક જ product ની અલગ-અલગ angles થી 1-5 photos મોકલી શકો. થઈ જાય ત્યારે "done" કહો.';
    case 'kn':
      return 'ಈಗ ನಿಮ್ಮ product photos ಕಳಿಸಿ! ಒಂದೇ product-ನ್ನ ವಿವಿಧ angles-ಲ್ಲಿ 1-5 photos ಕಳಿಸಬಹುದು. ಮುಗಿದ ಮೇಲೆ "done" ಎನ್ನಿ.';
    case 'ml':
      return 'ഇപ്പോൾ product photos അയക്കൂ! ഒരേ product-ന്റെ വ്യത്യസ്ത angles-ൽ 1-5 photos അയക്കാം. തീർന്നാൽ "done" പറയൂ.';
    case 'pa':
      return 'ਹੁਣ ਆਪਣੇ product ਦੀਆਂ photos ਭੇਜੋ! ਇੱਕੋ product ਦੇ ਵੱਖ-ਵੱਖ angles ਤੋਂ 1-5 photos ਭੇਜ ਸਕਦੇ ਹੋ। ਜਦੋਂ ਹੋ ਜਾਵੇ, "done" ਕਹੋ.';
    case 'or':
      return 'ଏବେ ଆପଣଙ୍କ product ର photos ପଠାନ୍ତୁ! ଗୋଟିଏ product ର ଅଲଗା ଅଲଗା angles ରୁ 1-5 photos ପଠାଇ ପାରିବେ। ଶେଷ ହେଲେ "done" କୁହନ୍ତୁ.';
    case 'en':
    default:
      return 'Send photos of your product! You can send 1-5 photos of the SAME product from different angles. Say "done" when finished.';
  }
}

export function msgPickStylePack(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Ek style pack chuniye — ek tap mein 3 best styles ready ho jayenge!';
    case 'hi':
      return 'अब अपने ऐड के लिए 3 स्टाइल चुनें।\n\nपक्का नहीं है? Smart Pack आपके प्रोडक्ट के हिसाब से सबसे अच्छे स्टाइल खुद चुन लेगा।';
    case 'ta':
      return 'ஒரு style pack தேர்ந்தெடுங்கள் — ஒரே tap-ல் 3 best styles ready ஆகும்!';
    case 'te':
      return 'ఒక style pack ఎంచుకోండి — ఒక్క tap లో 3 best styles ready అవుతాయి!';
    case 'bn':
      return 'একটা style pack বেছে নিন — এক tap-এ 3 best styles ready হয়ে যাবে!';
    case 'mr':
      return 'एक style pack निवडा — एका tap मध्ये 3 best styles ready होतील!';
    case 'gu':
      return 'એક style pack પસંદ કરો — એક tap માં 3 styles ready!';
    case 'kn':
      return 'ಒಂದು style pack ಆಯ್ಕೆ ಮಾಡಿ — ಒಂದೇ tap-ನಲ್ಲಿ 3 styles ready!';
    case 'ml':
      return 'ഒരു style pack തിരഞ്ഞെടുക്കൂ — ഒറ്റ tap-ൽ 3 styles ready!';
    case 'pa':
      return 'ਇੱਕ style pack ਚੁਣੋ — ਇੱਕ tap ਵਿੱਚ 3 styles ready!';
    case 'or':
      return 'ଏକ style pack ବାଛନ୍ତୁ — ଏକ tap ରେ 3 styles ready!';
    case 'en':
    default:
      return 'Pick a style pack — one tap and 3 styles are ready!';
  }
}

export function msgStylePackReady(lang: Lang, packName: string, styleNames: string[]): string {
  const list = styleNames.map((n, i) => `${i + 1}. ${n}`).join('\n');
  switch (lang) {
    case 'hinglish':
      return `${packName} select kiya! \u2728\n\n${list}\n\nAb order create ho raha hai...`;
    case 'hi':
      return `${packName} चुन लिया! \u2728\n\n${list}\n\nअभी order बन रहा है...`;
    case 'ta':
      return `${packName} தேர்ந்தெடுக்கப்பட்டது! \u2728\n\n${list}\n\nஇப்போது order உருவாகிறது...`;
    case 'te':
      return `${packName} ఎంచుకున్నారు! \u2728\n\n${list}\n\nఇప్పుడు order తయారవుతోంది...`;
    case 'bn':
      return `${packName} সিলেক্ট করা হয়েছে! \u2728\n\n${list}\n\nএখন order তৈরি হচ্ছে...`;
    case 'mr':
      return `${packName} निवडला! \u2728\n\n${list}\n\nआता order बनत आहे...`;
    case 'gu':
      return `${packName} પસંદ કર્યો! \u2728\n\n${list}\n\nહવે order બની રહ્યો છે...`;
    case 'kn':
      return `${packName} ಆಯ್ಕೆ ಮಾಡಿದ್ದಾರೆ! \u2728\n\n${list}\n\nಈಗ order ತಯಾರಾಗುತ್ತಿದೆ...`;
    case 'ml':
      return `${packName} തിരഞ്ഞെടുത്തു! \u2728\n\n${list}\n\nഇപ്പോൾ order ഉണ്ടാക്കുന്നു...`;
    case 'pa':
      return `${packName} ਚੁਣਿਆ! \u2728\n\n${list}\n\nਹੁਣ order ਬਣ ਰਿਹਾ ਹੈ...`;
    case 'or':
      return `${packName} ବାଛିଲେ! \u2728\n\n${list}\n\nଏବେ order ତିଆରି ହେଉଛି...`;
    case 'en':
    default:
      return `${packName} selected! \u2728\n\n${list}\n\nCreating your order now...`;
  }
}

// ---------------------------------------------------------------------------
// RETURNING USER
// ---------------------------------------------------------------------------

export function msgWelcomeBackWithStyle(lang: Lang, name: string, styleName: string): string {
  switch (lang) {
    case 'hinglish':
      return `${name} ji! Photo bhejiye — ${styleName} mein banayenge.\nStyle badlana hai?`;
    case 'hi':
      return `${name} जी! Photo भेजिए — ${styleName} में बनाएंगे।\nStyle बदलना है?`;
    case 'ta':
      return `${name}! Photo அனுப்புங்கள் — ${styleName}-ல் தயாரிப்போம்.\nStyle மாற்ற வேண்டுமா?`;
    case 'te':
      return `${name}! Photo పంపండి — ${styleName} లో చేస్తాం.\nStyle మార్చాలా?`;
    case 'bn':
      return `${name}! Photo পাঠান — ${styleName}-এ বানাবো।\nStyle বদলাতে চান?`;
    case 'mr':
      return `${name}! Photo पाठवा — ${styleName} मध्ये बनवतो.\nStyle बदलायचा आहे का?`;
    case 'gu':
      return `${name}! Photo મોકલો — ${styleName} માં બનાવીશું.\nStyle બદલવો છે?`;
    case 'kn':
      return `${name}! Photo ಕಳಿಸಿ — ${styleName} ಲ್ಲಿ ಮಾಡ್ತೀವಿ.\nStyle ಬದಲಾಯಿಸಬೇಕಾ?`;
    case 'ml':
      return `${name}! Photo അയക്കൂ — ${styleName} ൽ ഉണ്ടാക്കാം.\nStyle മാറ്റണോ?`;
    case 'pa':
      return `${name}! Photo ਭੇਜੋ — ${styleName} ਵਿੱਚ ਬਣਾਵਾਂਗੇ.\nStyle ਬਦਲਣਾ ਹੈ?`;
    case 'or':
      return `${name}! Photo ପଠାନ୍ତୁ — ${styleName} ରେ ବନାଇ ଦେବୁ.\nStyle ବଦଳାଇବେ?`;
    case 'en':
    default:
      return `${name}! Send your photo — we'll use ${styleName}.\nWant a different style?`;
  }
}

export function msgWelcomeBackNoStyle(lang: Lang, name: string): string {
  switch (lang) {
    case 'hinglish':
      return `Wapas aao, ${name} ji!\nNaya photo banwana hai?`;
    case 'hi':
      return `वापस आए, ${name} जी!\nनई photo बनवानी है?`;
    case 'ta':
      return `மீண்டும் வரவேற்கிறோம், ${name}!\nபுதிய product photo வேண்டுமா?`;
    case 'te':
      return `తిరిగి వచ్చారు, ${name}!\nకొత్త product photo కావాలా?`;
    case 'bn':
      return `আবার স্বাগতম, ${name}!\nনতুন product photo বানাবেন?`;
    case 'mr':
      return `परत स्वागत, ${name}!\nनवीन product photo बनवायची आहे का?`;
    case 'gu':
      return `પાછા આવ્યા, ${name}!\nનવી product photo બનાવવી છે?`;
    case 'kn':
      return `ಮತ್ತೆ ಸ್ವಾಗತ, ${name}!\nಹೊಸ product photo ಬೇಕಾ?`;
    case 'ml':
      return `വീണ്ടും സ്വാഗതം, ${name}!\nപുതിയ product photo വേണോ?`;
    case 'pa':
      return `ਵਾਪਸ ਆਏ, ${name}!\nਨਵੀਂ product photo ਬਣਾਉਣੀ ਹੈ?`;
    case 'or':
      return `ପୁଣି ସ୍ୱାଗତ, ${name}!\nନୂଆ product photo ବନାଇବେ?`;
    case 'en':
    default:
      return `Welcome back, ${name}!\nReady for a new product photo?`;
  }
}

export function msgSendPhoto(lang: Lang, isFirstOrder: boolean): string {
  if (isFirstOrder) {
    switch (lang) {
      case 'hinglish':
        return 'Apne product photos bhejiye — 5 tak bhej sakte hain.\nPehla free hai! (Baaki Rs 99 each.)';
      case 'hi':
        return 'अपने product photos भेजिए — 5 तक भेज सकते हैं।\nपहला free है! (बाकी Rs 99 each.)';
      case 'ta':
        return 'உங்கள் product photos அனுப்புங்கள் — 5 வரை அனுப்பலாம்.\nமுதலாவது free! (மற்றவை Rs 99 each.)';
      case 'te':
        return 'మీ product photos పంపండి — 5 వరకు పంపవచ్చు.\nమొదటిది free! (మిగతావి Rs 99 each.)';
      case 'bn':
        return 'আপনার product photos পাঠান — 5 পর্যন্ত পাঠাতে পারেন।\nপ্রথমটা free! (বাকিগুলো Rs 99 each.)';
      case 'mr':
        return 'तुमच्या product photos पाठवा — 5 पर्यंत पाठवता येतात.\nपहिला free! (बाकी Rs 99 each.)';
      case 'gu':
        return 'તમારા product ની photos મોકલો — એક વખતે 5 સુધી.\nપહેલી free! (બાકી Rs 99 each.)';
      case 'kn':
        return 'ನಿಮ್ಮ product photos ಕಳಿಸಿ — ಒಂದು ಬಾರಿ 5 ವರೆಗೆ.\nಮೊದಲ free! (ಉಳಿದವು Rs 99 each.)';
      case 'ml':
        return 'നിങ്ങളുടെ product photos അയക്കൂ — ഒരു തവണ 5 വരെ.\nആദ്യത്തേത് free! (ബാക്കി Rs 99 each.)';
      case 'pa':
        return 'ਆਪਣੇ product ਦੀਆਂ photos ਭੇਜੋ — ਇੱਕ ਵਾਰੀ 5 ਤੱਕ.\nਪਹਿਲੀ free! (ਬਾਕੀ Rs 99 each.)';
      case 'or':
        return 'ଆପଣଙ୍କ product ର photos ପଠାନ୍ତୁ — ଏକ ଥରରେ 5 ପର୍ଯ୍ୟନ୍ତ.\nପ୍ରଥମ free! (ବାକି Rs 99 each.)';
      case 'en':
      default:
        return 'Send your product photos — up to 5 at a time.\nFirst one is free! (Additional photos Rs 99 each.)';
    }
  }
  switch (lang) {
    case 'hinglish':
      return 'Apne product photos bhejiye — 5 tak bhej sakte hain.\nRs 99 per photo.';
    case 'hi':
      return 'अपने product photos भेजिए — 5 तक भेज सकते हैं।\nRs 99 per photo.';
    case 'ta':
      return 'உங்கள் product photos அனுப்புங்கள் — 5 வரை அனுப்பலாம்.\nRs 99 per photo.';
    case 'te':
      return 'మీ product photos పంపండి — 5 వరకు పంపవచ్చు.\nRs 99 per photo.';
    case 'bn':
      return 'আপনার product photos পাঠান — 5 পর্যন্ত পাঠাতে পারেন।\nRs 99 per photo.';
    case 'mr':
      return 'तुमच्या product photos पाठवा — 5 पर्यंत पाठवता येतात.\nRs 99 per photo.';
    case 'gu':
      return 'તમારા product ની photos મોકલો — એક વખતે 5 સુધી.\nRs 99 per photo.';
    case 'kn':
      return 'ನಿಮ್ಮ product photos ಕಳಿಸಿ — ಒಂದು ಬಾರಿ 5 ವರೆಗೆ.\nRs 99 per photo.';
    case 'ml':
      return 'നിങ്ങളുടെ product photos അയക്കൂ — ഒരു തവണ 5 വരെ.\nRs 99 per photo.';
    case 'pa':
      return 'ਆਪਣੇ product ਦੀਆਂ photos ਭੇਜੋ — ਇੱਕ ਵਾਰੀ 5 ਤੱਕ.\nRs 99 per photo.';
    case 'or':
      return 'ଆପଣଙ୍କ product ର photos ପଠାନ୍ତୁ — ଏକ ଥରରେ 5 ପର୍ଯ୍ୟନ୍ତ.\nRs 99 per photo.';
    case 'en':
    default:
      return 'Send your product photos — up to 5 at a time.\nRs 99 per photo.';
  }
}

// ---------------------------------------------------------------------------
// PHOTO RECEIVED
// ---------------------------------------------------------------------------

export function msgPhotoReadyForProcessing(lang: Lang, count: number): string {
  switch (lang) {
    case 'hinglish':
      return `${count} photo${count > 1 ? 'en' : ''} taiyaar! Process karein ya instructions add karein?`;
    case 'hi':
      return `${count} photo${count > 1 ? 'एं' : ''} तैयार! Process करें या instructions add करें?`;
    case 'ta':
      return `${count} photo${count > 1 ? 'கள்' : ''} ready! Process பண்ணலாமா, instructions சேர்க்கலாமா?`;
    case 'te':
      return `${count} photo${count > 1 ? 'లు' : ''} ready! Process చేయాలా, instructions add చేయాలా?`;
    case 'bn':
      return `${count}টা photo ready! Process করবেন নাকি instructions add করবেন?`;
    case 'mr':
      return `${count} photo${count > 1 ? 'ं' : ''} ready! Process करायचा का, instructions add करायचा का?`;
    case 'gu':
      return `${count} photo${count > 1 ? 's' : ''} ready! Process કરીએ કે instructions add કરીએ?`;
    case 'kn':
      return `${count} photo${count > 1 ? 'ಗಳು' : ''} ready! Process ಮಾಡಲಾ, instructions add ಮಾಡಲಾ?`;
    case 'ml':
      return `${count} photo${count > 1 ? 'കൾ' : ''} ready! Process ചെയ്യട്ടോ, instructions add ചെയ്യട്ടോ?`;
    case 'pa':
      return `${count} photo${count > 1 ? 'ਆਂ' : ''} ready! Process ਕਰੀਏ ਜਾਂ instructions add ਕਰੀਏ?`;
    case 'or':
      return `${count}ଟି photo ready! Process କରିବୁ ଆକି instructions add କରିବୁ?`;
    case 'en':
    default:
      return `${count} photo${count > 1 ? 's' : ''} ready! Process now or add instructions?`;
  }
}

export function msgPhotoReceived(lang: Lang, count: number): string {
  if (count === 1) {
    switch (lang) {
      case 'hinglish': return 'Photo mil gayi! Aur bhejein (max 5) ya thodi der rukein.';
      case 'hi': return 'Photo मिल गई! और भेजें (max 5) या थोड़ी देर रुकें।';
      case 'ta': return 'Photo கிடைத்தது! இன்னும் அனுப்பலாம் (max 5) அல்லது கொஞ்சம் காத்திருங்கள்.';
      case 'te': return 'Photo వచ్చింది! ఇంకా పంపవచ్చు (max 5) లేదా కొంచెం వేచి ఉండండి.';
      case 'bn': return 'Photo পেয়েছি! আরও পাঠান (max 5) অথবা একটু অপেক্ষা করুন।';
      case 'mr': return 'Photo मिळाला! आणखी पाठवा (max 5) किंवा थोडं थांबा.';
      case 'gu': return 'Photo મળ્યો! વધુ મોકલો (max 5) અથવા થોડી વાર રાહ જુઓ.';
      case 'kn': return 'Photo ಸಿಕ್ಕಿತು! ಇನ್ನಷ್ಟು ಕಳಿಸಿ (max 5) ಅಥವಾ ಸ್ವಲ್ಪ ತಡೆಯಿರಿ.';
      case 'ml': return 'Photo കിട്ടി! കൂടുതൽ അയക്കൂ (max 5) അല്ലെങ്കിൽ കൊഞ്ചം കാക്കൂ.';
      case 'pa': return 'Photo ਮਿਲਿਆ! ਹੋਰ ਭੇਜੋ (max 5) ਜਾਂ ਥੋੜੀ ਦੇਰ ਉਡੀਕ ਕਰੋ.';
      case 'or': return 'Photo ମିଳିଲା! ଆଉ ପଠାନ୍ତୁ (max 5) ଅଥବା ଅଳ୍ପ ଅପେକ୍ଷା କରନ୍ତୁ.';
      case 'en':
      default: return 'Photo received! Send more (max 5) or wait a moment.';
    }
  }
  switch (lang) {
    case 'hinglish': return `${count} photos mil gayi!`;
    case 'hi': return `${count} photos मिल गईं!`;
    case 'ta': return `${count} photos கிடைத்தன!`;
    case 'te': return `${count} photos వచ్చాయి!`;
    case 'bn': return `${count}টা photos পেয়েছি!`;
    case 'mr': return `${count} photos मिळाले!`;
    case 'gu': return `${count} photos મળ્યાં!`;
    case 'kn': return `${count} photos ಸಿಕ್ಕಿತು!`;
    case 'ml': return `${count} photos കിട്ടി!`;
    case 'pa': return `${count} photos ਮਿਲੇ!`;
    case 'or': return `${count} photos ମିଳିଲା!`;
    case 'en':
    default: return `${count} photos received!`;
  }
}

export function msgPhotoReceivedWithPayment(
  lang: Lang,
  name: string,
  imageCount: number,
  styleSelections: string[],
  totalRs: number,
): string {
  const photoText = imageCount > 1 ? `${imageCount} photos` : '1 photo';
  if (totalRs === 0) {
    switch (lang) {
      case 'hinglish':
        return `Photo mil gayi, ${name} ji!\n${photoText} • 3 professional ads\nAapka pehla order free hai! Rs 0`;
      case 'hi':
        return `Photo मिल गई, ${name} जी!\n${photoText} • 3 professional ads\nआपका पहला order free है! Rs 0`;
      case 'ta':
        return `Photo கிடைத்தது, ${name}!\n${photoText} • 3 professional ads\nஉங்கள் முதல் order free! Rs 0`;
      case 'te':
        return `Photo వచ్చింది, ${name}!\n${photoText} • 3 professional ads\nమీ మొదటి order free! Rs 0`;
      case 'bn':
        return `Photo পেয়েছি, ${name}!\n${photoText} • 3 professional ads\nআপনার প্রথম order free! Rs 0`;
      case 'mr':
        return `Photo मिळाला, ${name}!\n${photoText} • 3 professional ads\nतुमचा पहिला order free! Rs 0`;
      case 'gu':
        return `Photo મળ્યો, ${name}!\n${photoText} • 3 professional ads\nતમારો પહેલો order free! Rs 0`;
      case 'kn':
        return `Photo ಸಿಕ್ಕಿತು, ${name}!\n${photoText} • 3 professional ads\nನಿಮ್ಮ ಮೊದಲ order free! Rs 0`;
      case 'ml':
        return `Photo കിട്ടി, ${name}!\n${photoText} • 3 professional ads\nനിങ്ങളുടെ ആദ്യ order free! Rs 0`;
      case 'pa':
        return `Photo ਮਿਲਿਆ, ${name}!\n${photoText} • 3 professional ads\nਤੁਹਾਡਾ ਪਹਿਲਾ order free! Rs 0`;
      case 'or':
        return `Photo ମିଳିଲା, ${name}!\n${photoText} • 3 professional ads\nଆପଣଙ୍କ ପ୍ରଥମ order free! Rs 0`;
      case 'en':
      default:
        return `Photo received, ${name}!\n${photoText} • 3 professional ads\nYour first one is free! Rs 0`;
    }
  }
  switch (lang) {
    case 'hinglish':
      return `Photo mil gayi, ${name} ji!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'hi':
      return `Photo मिल गई, ${name} जी!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'ta':
      return `Photo கிடைத்தது, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'te':
      return `Photo వచ్చింది, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'bn':
      return `Photo পেয়েছি, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'mr':
      return `Photo मिळाला, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'gu':
      return `Photo મળ્યો, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'kn':
      return `Photo ಸಿಕ್ಕಿತು, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'ml':
      return `Photo കിട്ടി, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'pa':
      return `Photo ਮਿਲਿਆ, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'or':
      return `Photo ମିଳିଲା, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
    case 'en':
    default:
      return `Photo received, ${name}!\n${photoText} • 3 professional ads\nRs ${totalRs}`;
  }
}

/** Single combined message used when processing starts (free order or after payment). */
export function msgProcessingNow(
  lang: Lang,
  name: string,
  imageCount: number,
  isFree: boolean,
): string {
  const photoText = imageCount > 1 ? `${imageCount} photos` : '1 photo';
  const freeNoteHinglish = isFree ? '\nPehla order free hai! Rs 0' : '';
  const freeNoteHi = isFree ? '\nपहला order free है! Rs 0' : '';
  const freeNoteEn = isFree ? '\nFirst one is free! Rs 0' : '';
  const freeNoteTa = isFree ? '\nமுதல் order free! Rs 0' : '';
  const freeNoteTe = isFree ? '\nమొదటి order free! Rs 0' : '';
  const freeNoteBn = isFree ? '\nপ্রথম order free! Rs 0' : '';
  const freeNoteMr = isFree ? '\nपहिला order free! Rs 0' : '';
  const freeNoteGu = isFree ? '\nPehelo order free! Rs 0' : '';
  const freeNoteKn = isFree ? '\nಮೊದಲ order free! Rs 0' : '';
  const freeNoteMl = isFree ? '\nആദ്യ order free! Rs 0' : '';
  const freeNotePa = isFree ? '\nਪਹਿਲਾ order free! Rs 0' : '';
  const freeNoteOr = isFree ? '\nପ୍ରଥମ order free! Rs 0' : '';
  switch (lang) {
    case 'hinglish':
      return `Shuru ho gaya, ${name} ji! 🎨\n${photoText} • 3 professional ads\nAapke 3 ads ban rahe hain... 2-3 minute mein ready!${freeNoteHinglish} ⏳`;
    case 'hi':
      return 'ठीक है। आपके ऐड लगभग 2 मिनट में तैयार हो जाएंगे।';
    case 'ta':
      return `ஆரம்பித்தாகிவிட்டது, ${name}! 🎨\n${photoText} • 3 professional ads\nஉங்கள் 3 ads தயாராகின்றன... 2-3 minute-ல் ready!${freeNoteTa} ⏳`;
    case 'te':
      return `మొదలైంది, ${name}! 🎨\n${photoText} • 3 professional ads\nమీ 3 ads తయారవుతున్నాయి... 2-3 minute లో ready!${freeNoteTe} ⏳`;
    case 'bn':
      return `শুরু হয়ে গেছে, ${name}! 🎨\n${photoText} • 3 professional ads\nআপনার 3 ads তৈরি হচ্ছে... 2-3 minute-এ ready!${freeNoteBn} ⏳`;
    case 'mr':
      return `सुरू झालं, ${name}! 🎨\n${photoText} • 3 professional ads\nतुमचे 3 ads बनत आहेत... 2-3 minute मध्ये ready!${freeNoteMr} ⏳`;
    case 'gu':
      return `શરૂ થઈ ગયું, ${name}! 🎨\n${photoText} • 3 professional ads\nતમારા 3 ads બની રહ્યા છે... 2-3 minute માં ready!${freeNoteGu} ⏳`;
    case 'kn':
      return `ಶುರುವಾಯ್ತು, ${name}! 🎨\n${photoText} • 3 professional ads\nನಿಮ್ಮ 3 ads ತಯಾರಾಗ್ತಿದೆ... 2-3 minute-ಲ್ಲಿ ready!${freeNoteKn} ⏳`;
    case 'ml':
      return `തുടങ്ങി, ${name}! 🎨\n${photoText} • 3 professional ads\nനിങ്ങളുടെ 3 ads ഉണ്ടാക്കുന്നു... 2-3 minute-ൽ ready!${freeNoteMl} ⏳`;
    case 'pa':
      return `ਸ਼ੁਰੂ ਹੋ ਗਿਆ, ${name}! 🎨\n${photoText} • 3 professional ads\nਤੁਹਾਡੇ 3 ads ਬਣ ਰਹੇ ਹਨ... 2-3 minute ਵਿੱਚ ready!${freeNotePa} ⏳`;
    case 'or':
      return `ଆରମ୍ଭ ହୋଇଗଲା, ${name}! 🎨\n${photoText} • 3 professional ads\nଆପଣଙ୍କ 3 ads ତିଆରି ହେଉଛି... 2-3 minute ରେ ready!${freeNoteOr} ⏳`;
    case 'en':
    default:
      return `Let's go, ${name}! 🎨\n${photoText} • 3 professional ads\nMaking your 3 ads now... ready in 2-3 minutes!${freeNoteEn} ⏳`;
  }
}

// ---------------------------------------------------------------------------
// RETURNING USER + PHOTO (confirm style)
// ---------------------------------------------------------------------------

export function msgConfirmStyleForPhoto(lang: Lang, name: string, styleName: string): string {
  switch (lang) {
    case 'hinglish':
      return `Photo mil gayi, ${name} ji!\n${styleName} style lagayein?`;
    case 'hi':
      return `Photo मिल गई, ${name} जी!\n${styleName} style लगाएं?`;
    case 'ta':
      return `Photo கிடைத்தது, ${name}!\n${styleName} style போடலாமா?`;
    case 'te':
      return `Photo వచ్చింది, ${name}!\n${styleName} style వేయాలా?`;
    case 'bn':
      return `Photo পেয়েছি, ${name}!\n${styleName} style লাগাবো?`;
    case 'mr':
      return `Photo मिळाला, ${name}!\n${styleName} style लावायचा का?`;
    case 'gu':
      return `Photo મળ્યો, ${name}!\n${styleName} style વાપરીએ?`;
    case 'kn':
      return `Photo ಸಿಕ್ಕಿತು, ${name}!\n${styleName} style ಹಾಕಲಾ?`;
    case 'ml':
      return `Photo കിട്ടി, ${name}!\n${styleName} style ഇടട്ടോ?`;
    case 'pa':
      return `Photo ਮਿਲਿਆ, ${name}!\n${styleName} style ਲਗਾਈਏ?`;
    case 'or':
      return `Photo ମିଳିଲା, ${name}!\n${styleName} style ଲଗାଇବୁ?`;
    case 'en':
    default:
      return `Got your photo, ${name}!\nUse ${styleName} style?`;
  }
}

// ---------------------------------------------------------------------------
// PAYMENT
// ---------------------------------------------------------------------------

export function msgPaymentConfirmed(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Payment mil gayi! Aapke 3 ads ban rahe hain... 2-3 minute mein ready! ⏳';
    case 'hi':
      return 'Payment मिल गई! आपके 3 ads बन रहे हैं... 2-3 minute में ready! ⏳';
    case 'ta':
      return 'Payment கிடைத்தது! உங்கள் 3 ads தயாராகின்றன... 2-3 minute-ல் ready! ⏳';
    case 'te':
      return 'Payment వచ్చింది! మీ 3 ads తయారవుతున్నాయి... 2-3 minute లో ready! ⏳';
    case 'bn':
      return 'Payment পেয়েছি! আপনার 3 ads তৈরি হচ্ছে... 2-3 minute-এ ready! ⏳';
    case 'mr':
      return 'Payment मिळाली! तुमचे 3 ads बनत आहेत... 2-3 minute मध्ये ready! ⏳';
    case 'gu':
      return 'Payment મળ્યી! તમારા 3 ads બની રહ્યા છે... 2-3 minute માં ready! ⏳';
    case 'kn':
      return 'Payment ಬಂತು! ನಿಮ್ಮ 3 ads ತಯಾರಾಗ್ತಿದೆ... 2-3 minute-ಲ್ಲಿ ready! ⏳';
    case 'ml':
      return 'Payment കിട്ടി! നിങ്ങളുടെ 3 ads ഉണ്ടാക്കുന്നു... 2-3 minute-ൽ ready! ⏳';
    case 'pa':
      return 'Payment ਮਿਲਿਆ! ਤੁਹਾਡੇ 3 ads ਬਣ ਰਹੇ ਹਨ... 2-3 minute ਵਿੱਚ ready! ⏳';
    case 'or':
      return 'Payment ମିଳିଲା! ଆପଣଙ୍କ 3 ads ତିଆରି ହେଉଛି... 2-3 minute ରେ ready! ⏳';
    case 'en':
    default:
      return 'Payment received! Making your 3 ads now... ready in 2-3 minutes! ⏳';
  }
}

export function msgPaymentPending(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Payment abhi tak nahi aayi. Link fir se bhejein?';
    case 'hi':
      return 'Payment अभी तक नहीं आई। Link फिर से भेजूं?';
    case 'ta':
      return 'Payment இன்னும் வரவில்லை. Link மீண்டும் அனுப்பட்டுமா?';
    case 'te':
      return 'Payment ఇంకా రాలేదు. Link మళ్ళీ పంపాలా?';
    case 'bn':
      return 'Payment এখনো আসেনি। Link আবার পাঠাবো?';
    case 'mr':
      return 'Payment अजून आली नाही. Link परत पाठवू का?';
    case 'gu':
      return 'Payment હજી નથી આઈ. Link ફરી મોકલું?';
    case 'kn':
      return 'Payment ಇನ್ನೂ ಬಂದಿಲ್ಲ. Link ಮತ್ತೆ ಕಳಿಸಲಾ?';
    case 'ml':
      return 'Payment ഇനിയും കിട്ടിയില്ല. Link വീണ്ടും അയക്കട്ടോ?';
    case 'pa':
      return 'Payment ਅਜੇ ਨਹੀਂ ਆਈ। Link ਦੁਬਾਰਾ ਭੇਜਾਂ?';
    case 'or':
      return 'Payment ଏ ପର୍ଯ୍ୟନ୍ତ ଆସିନି। Link ଆଉ ଥରେ ପଠାଇବୁ?';
    case 'en':
    default:
      return 'Payment not received yet. Shall I resend the link?';
  }
}

export function msgPaymentFailed(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Payment fail ho gayi. Ek aur try karein — link fir se bhej raha hun.';
    case 'hi':
      return 'Payment fail हो गई। एक और try करें — link फिर से भेज रहा हूं।';
    case 'ta':
      return 'Payment fail ஆனது. மீண்டும் try பண்ணுங்கள் — link மீண்டும் அனுப்புகிறேன்.';
    case 'te':
      return 'Payment fail అయింది. మళ్ళీ try చేయండి — link మళ్ళీ పంపుతున్నాను.';
    case 'bn':
      return 'Payment fail হয়েছে। আবার try করুন — link আবার পাঠাচ্ছি।';
    case 'mr':
      return 'Payment fail झाली. एकदा आणखी try करा — link परत पाठवतो.';
    case 'gu':
      return 'Payment fail થઈ. ફરી try કરો — link મોકલું છું.';
    case 'kn':
      return 'Payment fail ಆಯ್ತು. ಮತ್ತೆ try ಮಾಡಿ — link ಮತ್ತೊಮ್ಮೆ ಕಳಿಸ್ತೀನಿ.';
    case 'ml':
      return 'Payment fail ആയി. വീണ്ടും try ചെയ്യൂ — link ഒന്ന് കൂടി അയക്കുന്നു.';
    case 'pa':
      return 'Payment fail ਹੋ ਗਈ। ਦੁਬਾਰਾ try ਕਰੋ — link ਫਿਰ ਭੇਜ ਰਿਹਾ ਹਾਂ.';
    case 'or':
      return 'Payment fail ହୋଇଗଲା। ଆଉ ଥରେ try କରନ୍ତୁ — link ପୁଣି ପଠାଉଛି.';
    case 'en':
    default:
      return 'Payment failed. Try again — sending the link once more.';
  }
}

// ---------------------------------------------------------------------------
// STAGE-BASED PROGRESS MESSAGES
// ---------------------------------------------------------------------------

/** Processing started — replaces generic "processing now" */
export function msgProcessingStarted(lang: Lang, name: string, isFree: boolean): string {
  switch (lang) {
    case 'hinglish':
      return `Shukriya, ${name} ji! ${isFree ? 'Pehla order bilkul free!' : 'Payment confirmed ✓'}\n\nAb shuru hota hai:\n📷 Aapke product ka analysis\n🎨 3 professional ad designs\n\n2-3 minute mein ready hoga!`;
    case 'hi':
      return `शुक्रिया, ${name} जी! ${isFree ? 'पहला order बिल्कुल free!' : 'Payment confirmed ✓'}\n\nअब शुरू होता है:\n📷 आपके product का analysis\n🎨 3 professional ad designs\n\n2-3 minute में ready होगा!`;
    case 'ta':
      return `நன்றி, ${name}! ${isFree ? 'முதல் order பூர்த்தியும் free!' : 'Payment confirmed ✓'}\n\nஆரம்பிக்கிறோம்:\n📷 உங்கள் product analysis\n🎨 3 professional ad designs\n\n2-3 minute-ல் ready ஆகும்!`;
    case 'te':
      return `థాంక్యూ, ${name}! ${isFree ? 'మొదటి order పూర్తిగా free!' : 'Payment confirmed ✓'}\n\nఇప్పుడు మొదలవుతోంది:\n📷 మీ product analysis\n🎨 3 professional ad designs\n\n2-3 minute లో ready అవుతుంది!`;
    case 'bn':
      return `ধন্যবাদ, ${name}! ${isFree ? 'প্রথম order একদম free!' : 'Payment confirmed ✓'}\n\nএখন শুরু হচ্ছে:\n📷 আপনার product analysis\n🎨 3 professional ad designs\n\n2-3 minute-এ ready হবে!`;
    case 'mr':
      return `धन्यवाद, ${name}! ${isFree ? 'पहिला order पूर्णपणे free!' : 'Payment confirmed ✓'}\n\nआता सुरू होतंय:\n📷 तुमच्या product चे analysis\n🎨 3 professional ad designs\n\n2-3 minute मध्ये ready होईल!`;
    case 'gu':
      return `ઠીક છે, ${name}! ${isFree ? 'પહેલો order free!' : 'Payment confirmed ✓'}\n\nહવે શરૂ:\n📷 Product નું analysis\n🎨 3 professional ad designs\n\n2-3 minute માં ready!`;
    case 'kn':
      return `ಸರಿ, ${name}! ${isFree ? 'ಮೊದಲ order free!' : 'Payment confirmed ✓'}\n\nಈಗ ಶುರು:\n📷 Product ಅನ್ಯಾಲಿಸಿಸ್\n🎨 3 professional ad designs\n\n2-3 minute-ಲ್ಲಿ ready!`;
    case 'ml':
      return `ശരി, ${name}! ${isFree ? 'ആദ്യ order free!' : 'Payment confirmed ✓'}\n\nഇപ്പോൾ തുടങ്ങുന്നു:\n📷 Product analysis\n🎨 3 professional ad designs\n\n2-3 minute-ൽ ready!`;
    case 'pa':
      return `ਠੀਕ ਹੈ, ${name}! ${isFree ? 'ਪਹਿਲਾ order free!' : 'Payment confirmed ✓'}\n\nਹੁਣ ਸ਼ੁਰੂ:\n📷 Product ਦਾ analysis\n🎨 3 professional ad designs\n\n2-3 minute ਵਿੱਚ ready!`;
    case 'or':
      return `ଭଲ, ${name}! ${isFree ? 'ପ୍ରଥମ order free!' : 'Payment confirmed ✓'}\n\nଏବେ ଆରମ୍ଭ:\n📷 Product ର analysis\n🎨 3 professional ad designs\n\n2-3 minute ରେ ready!`;
    case 'en':
    default:
      return `Got it, ${name}! ${isFree ? 'First order is free!' : 'Payment confirmed ✓'}\n\nStarting now:\n📷 Analyzing your product\n🎨 Creating 3 professional ads\n\nReady in 2-3 minutes!`;
  }
}

/** Product analyzed — shows actual product name to prove AI understood */
export function msgProgressProductAnalyzed(lang: Lang, productName: string): string {
  switch (lang) {
    case 'hinglish':
      return `📷 Aapka *${productName}* samajh aa gaya!\n\n🎨 Teeno styles ban rahe hain — bas thodi der...`;
    case 'hi':
      return `📷 आपका *${productName}* समझ आ गया!\n\n🎨 तीनों styles बन रहे हैं — बस थोड़ी देर...`;
    case 'ta':
      return `📷 உங்கள் *${productName}* புரிந்துவிட்டது!\n\n🎨 3 styles-உம் தயாராகின்றன — கொஞ்சம் நேரம்...`;
    case 'te':
      return `📷 మీ *${productName}* అర్థమైంది!\n\n🎨 3 styles-అన్నీ తయారవుతున్నాయి — కొంచెం సేపు...`;
    case 'bn':
      return `📷 আপনার *${productName}* বুঝেছি!\n\n🎨 তিনটে styles তৈরি হচ্ছে — একটু অপেক্ষা...`;
    case 'mr':
      return `📷 तुमचा *${productName}* समजला!\n\n🎨 तिन्ही styles बनत आहेत — थोडं थांबा...`;
    case 'gu':
      return `📷 તમારો *${productName}* સમજ્યો!\n\n🎨 ત્રણેય styles બની રહ્યા છે — બસ થોડી વાર...`;
    case 'kn':
      return `📷 ನಿಮ್ಮ *${productName}* ಅರ್ಥ ಆಯ್ತು!\n\n🎨 3 styles-ಅನ್ನೂ ಮಾಡ್ತಿದ್ದೀವಿ — ಸ್ವಲ್ಪ ಸಮಯ...`;
    case 'ml':
      return `📷 നിങ്ങളുടെ *${productName}* മനസ്സിലായി!\n\n🎨 3 styles-ഉം ഉണ്ടാക്കുന്നു — കൊഞ്ചം നേരം...`;
    case 'pa':
      return `📷 ਤੁਹਾਡਾ *${productName}* ਸਮਝ ਗਿਆ!\n\n🎨 ਤਿੰਨੇ styles ਬਣ ਰਹੇ ਹਨ — ਬੱਸ ਥੋੜੀ ਦੇਰ...`;
    case 'or':
      return `📷 ଆପଣଙ୍କ *${productName}* ବୁଝିଲି!\n\n🎨 ତିନୋଟି styles ବনাଉଛୁ — ଟିକ ଅପେକ୍ଷା...`;
    case 'en':
    default:
      return `📷 Got your *${productName}*!\n\n🎨 Generating all 3 styles now...`;
  }
}

/** Initial progress — sent immediately when first job starts processing */
export function msgGotPhotoCreating(lang: Lang, styleCount: number): string {
  switch (lang) {
    case 'hinglish':
      return `📷 Photo mil gayi! ${styleCount} ads bana rahe hain...`;
    case 'hi':
      return `📷 Photo मिल गई! ${styleCount} ads बना रहे हैं...`;
    case 'ta':
      return `📷 Photo கிடைத்தது! ${styleCount} ads தயாராகின்றன...`;
    case 'te':
      return `📷 Photo వచ్చింది! ${styleCount} ads తయారవుతున్నాయి...`;
    case 'bn':
      return `📷 Photo পেয়েছি! ${styleCount} ads তৈরি হচ্ছে...`;
    case 'mr':
      return `📷 Photo मिळाला! ${styleCount} ads बनत आहेत...`;
    case 'gu':
      return `📷 Photo મળી! ${styleCount} ads બની રહ્યા છે...`;
    case 'kn':
      return `📷 Photo ಸಿಕ್ಕಿತು! ${styleCount} ads ಮಾಡುತ್ತಿದ್ದೇವೆ...`;
    case 'ml':
      return `📷 Photo കിട്ടി! ${styleCount} ads ഉണ്ടാക്കുന്നു...`;
    case 'pa':
      return `📷 Photo ਮਿਲ ਗਈ! ${styleCount} ads ਬਣਾ ਰਹੇ ਹਾਂ...`;
    case 'or':
      return `📷 Photo ମିଳିଲା! ${styleCount} ads ତିଆରି କରୁଛୁ...`;
    case 'en':
    default:
      return `📷 Got your photo! Creating ${styleCount} ads now...`;
  }
}

/** Almost done — fires at 90s if still processing */
export function msgProgressAlmostDone(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return '✨ Quality check ho raha hai...\nEk minute aur!';
    case 'hi':
      return '✨ Quality check हो रहा है...\nएक minute और!';
    case 'ta':
      return '✨ Quality check நடக்கிறது...\nஒரு minute மட்டும்!';
    case 'te':
      return '✨ Quality check జరుగుతోంది...\nఒక minute మాత్రమే!';
    case 'bn':
      return '✨ Quality check চলছে...\nআর এক minute!';
    case 'mr':
      return '✨ Quality check होत आहे...\nअजून एक minute!';
    case 'gu':
      return '✨ Quality check ચાલી રહ્યો છે...\nહવે બસ એક minute!';
    case 'kn':
      return '✨ Quality check ನಡೀತಿದೆ...\nಇನ್ನೊಂದು minute ಮಾತ್ರ!';
    case 'ml':
      return '✨ Quality check നടക്കുന്നു...\nഒരു minute കൂടി!';
    case 'pa':
      return '✨ Quality check ਚੱਲ ਰਿਹਾ ਹੈ...\nਬੱਸ ਇੱਕ minute ਹੋਰ!';
    case 'or':
      return '✨ Quality check ଚାଲୁଛି...\nଆଉ ଏକ minute!';
    case 'en':
    default:
      return '✨ Final quality check running.\nAlmost done!';
  }
}

/** Ready to send — fires just before images are delivered */
export function msgProgressReadyToSend(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return '🎉 Taiyaar hain! Bhej raha hun...';
    case 'hi':
      return '🎉 तैयार हैं! भेज रहा हूं...';
    case 'ta':
      return '🎉 Ready! அனுப்புகிறேன்...';
    case 'te':
      return '🎉 Ready! పంపుతున్నాను...';
    case 'bn':
      return '🎉 Ready! পাঠাচ্ছি...';
    case 'mr':
      return '🎉 Ready! पाठवतो...';
    case 'gu':
      return '🎉 Ready! મોકલી રહ્યો છું...';
    case 'kn':
      return '🎉 Ready! ಕಳಿಸ್ತಿದ್ದೀನಿ...';
    case 'ml':
      return '🎉 Ready! അയക്കുന്നു...';
    case 'pa':
      return '🎉 Ready! ਭੇਜ ਰਿਹਾ ਹਾਂ...';
    case 'or':
      return '🎉 Ready! ପଠାଉଛି...';
    case 'en':
    default:
      return '🎉 Ready! Sending your ads now...';
  }
}

// ---------------------------------------------------------------------------
// PROCESSING
// ---------------------------------------------------------------------------

export function msgProcessingDelay(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Thoda aur time lag raha hai... bas 1-2 minute aur.';
    case 'hi':
      return 'थोड़ा और time लग रहा है... बस 1-2 minute और।';
    case 'ta':
      return 'கொஞ்சம் நேரம் ஆகிறது... 1-2 minute மட்டும்.';
    case 'te':
      return 'కొంచెం సమయం పడుతోంది... 1-2 minute మాత్రమే.';
    case 'bn':
      return 'একটু বেশি সময় লাগছে... মাত্র 1-2 minute আর.';
    case 'mr':
      return 'थोडा जास्त वेळ लागतोय... फक्त 1-2 minute आणखी.';
    case 'gu':
      return 'થોડો વધુ time લાગે છે... બસ 1-2 minute.';
    case 'kn':
      return 'ಸ್ವಲ್ಪ ಜಾಸ್ತಿ ಸಮಯ ಆಗ್ತಿದೆ... 1-2 minute ಮಾತ್ರ.';
    case 'ml':
      return 'കൊഞ്ചം കൂടി സമയം വേണം... 1-2 minute കൂടി.';
    case 'pa':
      return 'ਥੋੜਾ ਵੱਧ ਸਮਾਂ ਲੱਗ ਰਿਹਾ ਹੈ... ਬੱਸ 1-2 minute ਹੋਰ.';
    case 'or':
      return 'ଟିକ ବେଶୀ ସମୟ ଲାଗୁଛି... ବସ 1-2 minute ଆଉ.';
    case 'en':
    default:
      return 'Taking a bit longer... just 1-2 more minutes.';
  }
}

export function msgProcessingStuck(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return "Arre! Kuch gadbad ho gayi. Kripya dobara try karein — 'hi' bhej ke naya order shuru karein.";
    case 'hi':
      return "अरे! कुछ गड़बड़ हो गई। दोबारा try करें — 'hi' भेजकर नया order शुरू करें।";
    case 'ta':
      return "அய்யோ! ஏதோ பிரச்சனை ஆனது. மீண்டும் try பண்ணுங்கள் — 'hi' அனுப்பி புதிய order ஆரம்பியுங்கள்.";
    case 'te':
      return "అరె! ఏదో తేడా వచ్చింది. మళ్ళీ try చేయండి — 'hi' పంపి కొత్త order మొదలు పెట్టండి.";
    case 'bn':
      return "আরে! কিছু একটা গোলমাল হয়েছে। আবার try করুন — 'hi' পাঠিয়ে নতুন order শুরু করুন।";
    case 'mr':
      return "अरे! काहीतरी चुकलं. परत try करा — 'hi' पाठवून नवीन order सुरू करा.";
    case 'gu':
      return "અરે! કંઈ ગડબડ થઈ. ફરી try કરો — 'hi' મોકલો, નવો order શરૂ કરો.";
    case 'kn':
      return "ಅಯ್ಯೋ! ಏನೋ ತೊಂದರೆ ಆಯ್ತು. ಮತ್ತೆ try ಮಾಡಿ — 'hi' ಕಳಿಸಿ ಹೊಸ order ಶುರು ಮಾಡಿ.";
    case 'ml':
      return "അയ്യോ! എന്തോ തെറ്റ് പറ്റി. വീണ്ടും try ചെയ്യൂ — 'hi' അയച്ച് പുതിയ order ആരംഭിക്കൂ.";
    case 'pa':
      return "ਅਰੇ! ਕੁਝ ਗੜਬੜ ਹੋ ਗਈ। ਦੁਬਾਰਾ try ਕਰੋ — 'hi' ਭੇਜ ਕੇ ਨਵਾਂ order ਸ਼ੁਰੂ ਕਰੋ.";
    case 'or':
      return "ଆରେ! କିଛି ଗଡ଼ବଡ ହୋଇଗଲା। ଆଉ ଥରେ try କରନ୍ତୁ — 'hi' ପଠାଇ ନୂଆ order ଆରମ୍ଭ କରନ୍ତୁ.";
    case 'en':
    default:
      return "Oops! Something went wrong. Please try again — send 'hi' to start a new order.";
  }
}

// ---------------------------------------------------------------------------
// DELIVERY
// ---------------------------------------------------------------------------

export function msgImageDelivered(lang: Lang, userName?: string, index?: number, total?: number): string {
  const name = userName ? `${userName} ji` : '';
  const nameHi = userName ? `${userName} जी` : '';
  const nameTa = userName ? `${userName}` : '';
  const nameTe = userName ? `${userName}` : '';
  const nameBn = userName ? `${userName}` : '';
  const nameMr = userName ? `${userName}` : '';
  const counter = index && total && total > 1 ? ` (${index}/${total})` : '';
  switch (lang) {
    case 'hinglish':
      return `Taiyaar hai${name ? ', ' + name : ''}!${counter}\nAapki professional product photo ready hai.`;
    case 'hi':
      return `तैयार है${nameHi ? ', ' + nameHi : ''}!${counter}\nआपकी professional product photo ready है।`;
    case 'ta':
      return `Ready${nameTa ? ', ' + nameTa : ''}!${counter}\nஉங்கள் professional product photo தயார்.`;
    case 'te':
      return `Ready${nameTe ? ', ' + nameTe : ''}!${counter}\nమీ professional product photo తయారు.`;
    case 'bn':
      return `Ready${nameBn ? ', ' + nameBn : ''}!${counter}\nআপনার professional product photo তৈরি।`;
    case 'mr':
      return `तयार${nameMr ? ', ' + nameMr : ''}!${counter}\nतुमची professional product photo ready आहे.`;
    case 'gu':
      return `Ready${userName ? ', ' + userName : ''}!${counter}\nતમારી professional product photo ready છે.`;
    case 'kn':
      return `Ready${userName ? ', ' + userName : ''}!${counter}\nನಿಮ್ಮ professional product photo ತಯಾರು.`;
    case 'ml':
      return `Ready${userName ? ', ' + userName : ''}!${counter}\nനിങ്ങളുടെ professional product photo ready.`;
    case 'pa':
      return `Ready${userName ? ', ' + userName : ''}!${counter}\nਤੁਹਾਡੀ professional product photo ready ਹੈ.`;
    case 'or':
      return `Ready${userName ? ', ' + userName : ''}!${counter}\nଆପଣଙ୍କ professional product photo ready ଅଛି.`;
    case 'en':
    default:
      return `Here it is${name ? ', ' + name : ''}!${counter}\nYour professional product photo is ready.`;
  }
}

/** Caption for a style-labeled delivery image (3-style V2 flow). */
export function msgStyleImageDelivered(
  lang: Lang,
  styleLabel: string,
  styleEmoji: string,
  index: number,
  total: number,
): string {
  switch (lang) {
    case 'hinglish':
      return `${styleEmoji} *${styleLabel} Ad* (${index}/${total}) taiyaar hai!`;
    case 'hi':
      return `ये रहा आपका *${styleLabel}* ऐड। ${styleEmoji}${total > 1 ? ` (${index}/${total})` : ''}`;
    case 'ta':
      return `${styleEmoji} உங்கள் *${styleLabel} Ad* ready! (${index}/${total})`;
    case 'te':
      return `${styleEmoji} మీ *${styleLabel} Ad* తయారు! (${index}/${total})`;
    case 'bn':
      return `${styleEmoji} আপনার *${styleLabel} Ad* ready! (${index}/${total})`;
    case 'mr':
      return `${styleEmoji} तुमचा *${styleLabel} Ad* तयार! (${index}/${total})`;
    case 'gu':
      return `${styleEmoji} તમારો *${styleLabel} Ad* ready! (${index}/${total})`;
    case 'kn':
      return `${styleEmoji} ನಿಮ್ಮ *${styleLabel} Ad* ತಯಾರು! (${index}/${total})`;
    case 'ml':
      return `${styleEmoji} നിങ്ങളുടെ *${styleLabel} Ad* ready! (${index}/${total})`;
    case 'pa':
      return `${styleEmoji} ਤੁਹਾਡਾ *${styleLabel} Ad* ready! (${index}/${total})`;
    case 'or':
      return `${styleEmoji} ଆପଣଙ୍କ *${styleLabel} Ad* ready! (${index}/${total})`;
    case 'en':
    default:
      return `${styleEmoji} Here's your *${styleLabel} ad*! (${index}/${total})`;
  }
}

export function msgAskFeedback(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Kaisa laga? Batayein:';
    case 'hi':
      return 'कैसा लगा? बताइए:';
    case 'ta':
      return 'எப்படி இருக்கிறது? சொல்லுங்கள்:';
    case 'te':
      return 'ఎలా ఉన్నాయి? చెప్పండి:';
    case 'bn':
      return 'কেমন লাগলো? বলুন:';
    case 'mr':
      return 'कसं वाटलं? सांगा:';
    case 'gu':
      return 'કેવું લાગ્યું? જણાવો:';
    case 'kn':
      return 'ಹೇಗಿದೆ? ಹೇಳಿ:';
    case 'ml':
      return 'എങ്ങനെ ഉണ്ട്? പറയൂ:';
    case 'pa':
      return 'ਕਿਵੇਂ ਲੱਗਿਆ? ਦੱਸੋ:';
    case 'or':
      return 'କେମିତି ଲାଗିଲା? ଜଣାନ୍ତୁ:';
    case 'en':
    default:
      return 'How do they look? Let us know:';
  }
}

/** Prompt asking the user WHICH of the 3 style outputs to change. */
export function msgWhichAdToChange(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Kaunsa ad badalna hai?';
    case 'hi':
      return 'कौन सा ऐड फिर से बनाना है? एक या एक से ज़्यादा चुन सकते हैं।';
    case 'ta':
      return 'எந்த ad மாற்ற வேண்டும்?';
    case 'te':
      return 'ఏ ad మార్చాలి?';
    case 'bn':
      return 'কোন ad বদলাতে চান?';
    case 'mr':
      return 'कोणता ad बदलायचा?';
    case 'gu':
      return 'કયો ad બદલવો છે?';
    case 'kn':
      return 'ಯಾವ ad ಬದಲಾಯಿಸಬೇಕು?';
    case 'ml':
      return 'ഏത് ad മാറ്റണം?';
    case 'pa':
      return 'ਕਿਹੜਾ ad ਬਦਲਣਾ ਹੈ?';
    case 'or':
      return 'କେଉଁ ad ବଦଳାଇବେ?';
    case 'en':
    default:
      return 'Which ad would you like to change?';
  }
}

export function msgThankYou(lang: Lang, isFirstOrder: boolean): string {
  if (isFirstOrder) {
    switch (lang) {
      case 'hinglish':
        return 'Bahut badiya! 🎉\nYeh photo Instagram ya WhatsApp group pe share karein — customers ko dikhao!\n\nAgle baar sirf Rs 99 mein. Ek aur photo banwani hai?';
      case 'hi':
        return 'बहुत बढ़िया! 🎉\nयह photo Instagram या WhatsApp group पर share करें — customers को दिखाएं!\n\nअगली बार सिर्फ Rs 99 में। एक और photo बनवानी है?';
      case 'ta':
        return 'அருமை! 🎉\nInstagram அல்லது WhatsApp group-ல் share பண்ணுங்கள் — customers-கு காட்டுங்கள்!\n\nஅடுத்த முறை வெறும் Rs 99. இன்னொரு photo வேண்டுமா?';
      case 'te':
        return 'చాలా బాగుంది! 🎉\nInstagram లేదా WhatsApp group లో share చేయండి — customers కు చూపండి!\n\nతర్వాత కేవలం Rs 99. ఇంకో photo కావాలా?';
      case 'bn':
        return 'দারুণ! 🎉\nInstagram বা WhatsApp group-এ share করুন — customers-দের দেখান!\n\nপরেরবার মাত্র Rs 99. আরেকটা photo বানাবেন?';
      case 'mr':
        return 'एकदम छान! 🎉\nInstagram किंवा WhatsApp group वर share करा — customers ला दाखवा!\n\nपुढच्या वेळी फक्त Rs 99. आणखी एक photo बनवायची आहे का?';
      case 'gu':
        return 'ઘણું સરસ! 🎉\nInstagram અથવા WhatsApp group પર share કરો — customers ને બતાવો!\n\nઆગળ ફક્ત Rs 99. બીજો photo બનાવવો છે?';
      case 'kn':
        return 'ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ! 🎉\nInstagram ಅಥವಾ WhatsApp group-ಲ್ಲಿ share ಮಾಡಿ — customers-ಗೆ ತೋರಿಸಿ!\n\nಮುಂದಿನ ಬಾರಿ ಬರೀ Rs 99. ಇನ್ನೊಂದು photo ಬೇಕಾ?';
      case 'ml':
        return 'ഭംഗിയായി! 🎉\nInstagram അല്ലെങ്കിൽ WhatsApp group-ൽ share ചെയ്യൂ — customers-ക്ക് കാണിക്കൂ!\n\nഅടുത്തത് വെറും Rs 99. ഇനിയൊരു photo വേണോ?';
      case 'pa':
        return 'ਬਹੁਤ ਵਧੀਆ! 🎉\nInstagram ਜਾਂ WhatsApp group ਤੇ share ਕਰੋ — customers ਨੂੰ ਦਿਖਾਓ!\n\nਅਗਲੀ ਵਾਰ ਸਿਰਫ Rs 99. ਇੱਕ ਹੋਰ photo ਬਣਾਉਣੀ ਹੈ?';
      case 'or':
        return 'ଖୁବ ଭଲ! 🎉\nInstagram ବା WhatsApp group ରେ share କରନ୍ତୁ — customers ଙ୍କୁ ଦେଖାନ୍ତୁ!\n\nପରବର୍ତ୍ତୀ ଥର ମାତ୍ର Rs 99. ଆଉ ଏକ photo ବନାଇବେ?';
      case 'en':
      default:
        return 'Awesome! 🎉\nShare this on Instagram or your WhatsApp group — show it to customers!\n\nNext one is just Rs 99. Want another photo?';
    }
  }
  switch (lang) {
    case 'hinglish':
      return 'Bahut badiya! 🎉\nYeh photo share karein — customers ko dikhao!\n\nEk aur product ki photo banwani hai?';
    case 'hi':
      return 'बहुत बढ़िया! 🎉\nयह photo share करें — customers को दिखाएं!\n\nएक और product की photo बनवानी है?';
    case 'ta':
      return 'அருமை! 🎉\nPhoto share பண்ணுங்கள் — customers-கு காட்டுங்கள்!\n\nइன்னொரு product photo வேண்டுமா?';
    case 'te':
      return 'చాలా బాగుంది! 🎉\nPhoto share చేయండి — customers కు చూపండి!\n\nఇంకో product photo కావాలా?';
    case 'bn':
      return 'দারুণ! 🎉\nPhoto share করুন — customers-দের দেখান!\n\nআরেকটা product photo বানাবেন?';
    case 'mr':
      return 'एकदम छान! 🎉\nPhoto share करा — customers ला दाखवा!\n\nआणखी एक product photo बनवायची आहे का?';
    case 'gu':
      return 'ઘણું સરસ! 🎉\nPhoto share કરો — customers ને બતાવો!\n\nબીજો product photo બનાવવો છે?';
    case 'kn':
      return 'ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ! 🎉\nPhoto share ಮಾಡಿ — customers-ಗೆ ತೋರಿಸಿ!\n\nಇನ್ನೊಂದು product photo ಬೇಕಾ?';
    case 'ml':
      return 'ഭംഗിയായി! 🎉\nPhoto share ചെയ്യൂ — customers-ക്ക് കാണിക്കൂ!\n\nഇനിയൊരു product photo വേണോ?';
    case 'pa':
      return 'ਬਹੁਤ ਵਧੀਆ! 🎉\nPhoto share ਕਰੋ — customers ਨੂੰ ਦਿਖਾਓ!\n\nਇੱਕ ਹੋਰ product photo ਬਣਾਉਣੀ ਹੈ?';
    case 'or':
      return 'ଖୁବ ଭଲ! 🎉\nPhoto share କରନ୍ତୁ — customers ଙ୍କୁ ଦେଖାନ୍ତୁ!\n\nଆଉ ଏକ product photo ବନାଇବେ?';
    case 'en':
    default:
      return 'Awesome! 🎉\nShare this photo — show it to customers!\n\nWant another product photo?';
  }
}

// ---------------------------------------------------------------------------
// EDIT
// ---------------------------------------------------------------------------

export function msgEditProcessing(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Badlav kar raha hun... thodi der mein ready.';
    case 'hi':
      return 'बदलाव कर रहा हूं... थोड़ी देर में ready।';
    case 'ta':
      return 'மாற்றுகிறேன்... கொஞ்ச நேரத்தில் ready.';
    case 'te':
      return 'మారుస్తున్నాను... కొంచెం సేపటిలో ready.';
    case 'bn':
      return 'বদলাচ্ছি... একটু পরেই ready।';
    case 'mr':
      return 'बदल करतोय... थोड्या वेळात ready.';
    case 'gu':
      return 'ફેરફાર કરી રહ્યો છું... થોડી વારમાં ready.';
    case 'kn':
      return 'ಬದಲಾವಣೆ ಮಾಡ್ತಿದ್ದೀನಿ... ಸ್ವಲ್ಪ ಸಮಯದಲ್ಲಿ ready.';
    case 'ml':
      return 'മാറ്റം ചെയ്യുന്നു... കൊഞ്ചം നേരത്തിൽ ready.';
    case 'pa':
      return 'ਬਦਲਾਅ ਕਰ ਰਿਹਾ ਹਾਂ... ਥੋੜੀ ਦੇਰ ਵਿੱਚ ready.';
    case 'or':
      return 'ବଦଳ କରୁଛି... ଟିକ ସମୟ ରେ ready.';
    case 'en':
    default:
      return 'Applying your changes... ready shortly.';
  }
}

/**
 * Fallback message when revision payment link creation fails.
 * Under normal operation the user receives a Rs 29 payment link instead.
 */
export function msgRevisionLimitReached(lang: Lang, imageCount = 1): string {
  // Each image gets 1 free redo. Total free redos = imageCount.
  const freeRedos = imageCount;
  switch (lang) {
    case 'hinglish':
      return `${freeRedos} free redo${freeRedos > 1 ? 's' : ''} ho ${freeRedos > 1 ? 'chuke' : 'chuka'} hai is order ke liye. Abhi naya photo start karein — "hi" bhejein!`;
    case 'hi':
      return `इस order के लिए ${freeRedos} free redo हो ${freeRedos > 1 ? 'चुके' : 'चुका'} है। नई photo शुरू करें — "hi" भेजें!`;
    case 'ta':
      return `இந்த order-க்கு ${freeRedos} free redo${freeRedos > 1 ? 'கள்' : ''} ஆகிவிட்டது. புதிய photo ஆரம்பியுங்கள் — "hi" அனுப்புங்கள்!`;
    case 'te':
      return `ఈ order కోసం ${freeRedos} free redo${freeRedos > 1 ? 'లు' : ''} అయిపోయాయి. కొత్త photo మొదలు పెట్టండి — "hi" పంపండి!`;
    case 'bn':
      return `এই order-এর জন্য ${freeRedos}টা free redo শেষ হয়ে গেছে। নতুন photo শুরু করুন — "hi" পাঠান!`;
    case 'mr':
      return `या order साठी ${freeRedos} free redo${freeRedos > 1 ? 'ं' : ''} झाले. नवीन photo सुरू करा — "hi" पाठवा!`;
    case 'gu':
      return `આ order ના ${freeRedos} free redo${freeRedos > 1 ? 's' : ''} વપરાઈ ગયા. નવો photo શરૂ કરો — "hi" મોકલો!`;
    case 'kn':
      return `ಈ order ಗೆ ${freeRedos} free redo${freeRedos > 1 ? 'ಗಳು' : ''} ಆಗಿಹೋಯ್ತು. ಹೊಸ photo ಶುರು ಮಾಡಿ — "hi" ಕಳಿಸಿ!`;
    case 'ml':
      return `ഈ order-നുള്ള ${freeRedos} free redo${freeRedos > 1 ? 'കൾ' : ''} തീർന്നു. പുതിയ photo ആരംഭിക്കൂ — "hi" അയക്കൂ!`;
    case 'pa':
      return `ਇਸ order ਲਈ ${freeRedos} free redo${freeRedos > 1 ? 'ਆਂ' : ''} ਹੋ ਗਏ। ਨਵਾਂ photo ਸ਼ੁਰੂ ਕਰੋ — "hi" ਭੇਜੋ!`;
    case 'or':
      return `ଏ order ପାଇଁ ${freeRedos} free redo${freeRedos > 1 ? 's' : ''} ଶେଷ ହୋଇଗଲା। ନୂଆ photo ଆରମ୍ଭ କରନ୍ତୁ — "hi" ପଠାନ୍ତୁ!`;
    case 'en':
    default:
      return `You've used your ${freeRedos} free redo${freeRedos > 1 ? 's' : ''} for this order. Start a new photo — send "hi"!`;
  }
}

// ---------------------------------------------------------------------------
// AWAITING_PHOTO — instructions prompts
// ---------------------------------------------------------------------------

export function msgAnySpecialInstructions(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Kuch special instructions? Text ya voice note bhejein.';
    case 'hi':
      return 'कोई ख़ास हिदायत? जैसे: "पीछे वाला कप मत दिखाना" या "हाथ फ्रेम में नहीं चाहिए।"\n\nकुछ नहीं है तो "none" लिखें।';
    case 'ta':
      return 'ஏதேனும் special instructions? Text அல்லது voice note அனுப்புங்கள்.';
    case 'te':
      return 'ఏదైనా special instructions? Text లేదా voice note పంపండి.';
    case 'bn':
      return 'কোনো special instructions? Text বা voice note পাঠান।';
    case 'mr':
      return 'काही special instructions? Text किंवा voice note पाठवा.';
    case 'gu':
      return 'કોઈ special instructions? Text અથવા voice note મોકલો.';
    case 'kn':
      return 'ಯಾವುದಾದರೂ special instructions? Text ಅಥವಾ voice note ಕಳುಹಿಸಿ.';
    case 'ml':
      return 'എന്തെങ്കിലും special instructions? Text അല്ലെങ്കിൽ voice note അയയ്ക്കൂ.';
    case 'pa':
      return 'ਕੋਈ special instructions? Text ਜਾਂ voice note ਭੇਜੋ।';
    case 'or':
      return 'କୌଣସି special instructions? Text କିମ୍ବା voice note ପଠାନ୍ତୁ।';
    case 'en':
    default:
      return 'Any special instructions? Send text or a voice note.';
  }
}

export function msgInstructionsAck(lang: Lang, transcript: string): string {
  switch (lang) {
    case 'hinglish':
      return `Samajh gaya: "${transcript}"\nShuru karte hain!`;
    case 'hi':
      return `समझ गया: "${transcript}"\nशुरू करते हैं!`;
    case 'ta':
      return `புரிந்தது: "${transcript}"\nஆரம்பிக்கலாம்!`;
    case 'te':
      return `అర్థమైంది: "${transcript}"\nప్రారంభిద్దాం!`;
    case 'bn':
      return `বুঝেছি: "${transcript}"\nশুরু করা যাক!`;
    case 'mr':
      return `समजलं: "${transcript}"\nसुरू करूया!`;
    case 'gu':
      return `સમજી ગયો: "${transcript}"\nશરૂ કરીએ!`;
    case 'kn':
      return `ಅರ್ಥವಾಯಿತು: "${transcript}"\nಪ್ರಾರಂಭಿಸೋಣ!`;
    case 'ml':
      return `മനസ്സിലായി: "${transcript}"\nതുടങ്ങാം!`;
    case 'pa':
      return `ਸਮਝ ਗਿਆ: "${transcript}"\nਸ਼ੁਰੂ ਕਰੀਏ!`;
    case 'or':
      return `ବୁଝିଲି: "${transcript}"\nଆରମ୍ଭ କରିବା!`;
    case 'en':
    default:
      return `Got it: "${transcript}"\nLet's go!`;
  }
}

// ---------------------------------------------------------------------------
// AWAITING_PHOTO — short prompts and button labels
// ---------------------------------------------------------------------------

export function msgSendPhotoShort(lang: Lang): string {
  switch (lang) {
    case 'hinglish': return 'Photo bhejiye!';
    case 'hi':       return 'Photo भेजिए!';
    case 'ta':       return 'Photo அனுப்புங்கள்!';
    case 'te':       return 'Photo పంపండి!';
    case 'bn':       return 'Photo পাঠান!';
    case 'mr':       return 'Photo पाठवा!';
    case 'gu':       return 'Photo મોકલો!';
    case 'kn':       return 'Photo ಕಳುಹಿಸಿ!';
    case 'ml':       return 'Photo അയയ്ക്കൂ!';
    case 'pa':       return 'Photo ਭੇਜੋ!';
    case 'or':       return 'Photo ପଠାନ୍ତୁ!';
    case 'en':
    default:         return 'Send your photo!';
  }
}

export function msgPhotoBeforeInstructions(lang: Lang): string {
  switch (lang) {
    case 'hinglish': return 'Pehle photo bhejiye, phir instructions dena.';
    case 'hi':       return 'पहले photo भेजें, फिर instructions दें।';
    case 'ta':       return 'முதலில் photo அனுப்புங்கள், பிறகு instructions.';
    case 'te':       return 'మొదట photo పంపండి, తర్వాత instructions.';
    case 'bn':       return 'আগে photo পাঠান, তারপর instructions।';
    case 'mr':       return 'आधी photo पाठवा, मग instructions द्या.';
    case 'gu':       return 'પહેલા photo મોકલો, પછી instructions આપો.';
    case 'kn':       return 'ಮೊದಲು photo ಕಳುಹಿಸಿ, ನಂತರ instructions.';
    case 'ml':       return 'ആദ്യം photo അയയ്ക്കൂ, പിന്നെ instructions.';
    case 'pa':       return 'ਪਹਿਲਾਂ photo ਭੇਜੋ, ਫਿਰ instructions।';
    case 'or':       return 'ପ୍ରଥମେ photo ପଠାନ୍ତୁ, ତାପରେ instructions।';
    case 'en':
    default:         return 'Send your photo first, then instructions.';
  }
}

/** Button title — MUST stay ≤ 20 characters in every language. */
export function btnStart(lang: Lang): string {
  switch (lang) {
    case 'hinglish': return 'Shuru karein';
    case 'hi':       return 'शुरू करें';
    case 'ta':       return 'Aarambh';
    case 'te':       return 'Praarambham';
    case 'bn':       return 'Shuru korun';
    case 'mr':       return 'Suru kara';
    case 'gu':       return 'Shuru karo';
    case 'kn':       return 'Prarambhisi';
    case 'ml':       return 'Thudangu';
    case 'pa':       return 'Shuru karo';
    case 'or':       return 'Aarambha';
    case 'en':
    default:         return 'Start';
  }
}

/** Button title — MUST stay ≤ 20 characters in every language. */
export function btnAddInstructions(lang: Lang): string {
  switch (lang) {
    case 'hinglish': return 'Instructions';
    case 'hi':       return 'निर्देश';
    case 'ta':       return 'Instructions';
    case 'te':       return 'Instructions';
    case 'bn':       return 'Nirdesh';
    case 'mr':       return 'Suchana';
    case 'gu':       return 'Suchna';
    case 'kn':       return 'Sucheya';
    case 'ml':       return 'Nirdesham';
    case 'pa':       return 'Hidayatan';
    case 'or':       return 'Nirdesha';
    case 'en':
    default:         return 'Add instructions';
  }
}

export function msgDoneOrInstructions(lang: Lang): string {
  switch (lang) {
    case 'hinglish': return '"done" bolein ya instructions bhejein.';
    case 'hi':       return '"done" बोलें या instructions भेजें।';
    case 'ta':       return '"done" sollungal allathu instructions anuppungal.';
    case 'te':       return '"done" cheppandi leda instructions pampandi.';
    case 'bn':       return '"done" bolun ba instructions pathan.';
    case 'mr':       return '"done" bola kinva instructions pathwa.';
    case 'gu':       return '"done" kaho athva instructions moklo.';
    case 'kn':       return '"done" heli athava instructions kaluhisi.';
    case 'ml':       return '"done" parayu allenkil instructions ayaykku.';
    case 'pa':       return '"done" kaho ya instructions bhejo.';
    case 'or':       return '"done" kahantu kimba instructions pathantu.';
    case 'en':
    default:         return 'Say "done" or send instructions.';
  }
}

// ---------------------------------------------------------------------------
// LANGUAGE SWITCH
// ---------------------------------------------------------------------------

/** Language switch acknowledgement */
export function msgLanguageSwitched(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return '✅ Bhasha Hinglish mein badal gayi!';
    case 'hi':
      return '✅ भाषा हिंदी में बदल गई!';
    case 'ta':
      return '✅ மொழி Tamil-க்கு மாற்றப்பட்டது!';
    case 'te':
      return '✅ భాష Telugu కి మారింది!';
    case 'bn':
      return '✅ ভাষা Bengali-তে পরিবর্তন হয়েছে!';
    case 'mr':
      return '✅ भाषा Marathi मध्ये बदलली!';
    case 'gu':
      return '✅ ભાષા Gujarati માં બદલાઈ!';
    case 'kn':
      return '✅ ಭಾಷೆ Kannada-ಗೆ ಬದಲಾಯ್ತು!';
    case 'ml':
      return '✅ ഭാഷ Malayalam-ലേക്ക് മാറ്റി!';
    case 'pa':
      return '✅ ਭਾਸ਼ਾ Punjabi ਵਿੱਚ ਬਦਲ ਗਈ!';
    case 'or':
      return '✅ ଭାଷା Odia ରେ ବଦଲ ହୋଇଗଲା!';
    case 'en':
    default:
      return '✅ Language changed to English!';
  }
}

/** Language already set */
export function msgLanguageAlreadySet(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Bhasha pehle se Hinglish hai!';
    case 'hi':
      return 'भाषा पहले से हिंदी है!';
    case 'ta':
      return 'மொழி ஏற்கனவே Tamil-ல் இருக்கிறது!';
    case 'te':
      return 'భాష ఇప్పటికే Telugu లో ఉంది!';
    case 'bn':
      return 'ভাষা আগে থেকেই Bengali-তে আছে!';
    case 'mr':
      return 'भाषा आधीच Marathi मध्ये आहे!';
    case 'gu':
      return 'ભાષા પહેલેથી Gujarati માં છે!';
    case 'kn':
      return 'ಭಾಷೆ ಈಗಾಗಲೇ Kannada-ಲ್ಲಿ ಇದೆ!';
    case 'ml':
      return 'ഭാഷ ഇതിനകം Malayalam-ൽ ആണ്!';
    case 'pa':
      return 'ਭਾਸ਼ਾ ਪਹਿਲਾਂ ਤੋਂ Punjabi ਵਿੱਚ ਹੈ!';
    case 'or':
      return 'ଭାଷା ଆଗ ଥୁ Odia ରେ ଅଛି!';
    case 'en':
    default:
      return 'Language is already set to English!';
  }
}

// ---------------------------------------------------------------------------
// ERRORS
// ---------------------------------------------------------------------------

export function msgUnknownMessage(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Samajh nahi aaya. 🤔 Photo bhejein ya neeche se option chuniye.';
    case 'hi':
      return 'समझ नहीं आया। 🤔 Photo भेजें या नीचे से option चुनिए।';
    case 'ta':
      return 'புரியவில்லை. 🤔 Photo அனுப்புங்கள் அல்லது கீழே option தேர்ந்தெடுங்கள்.';
    case 'te':
      return 'అర్థం కాలేదు. 🤔 Photo పంపండి లేదా క్రింద option ఎంచుకోండి.';
    case 'bn':
      return 'বুঝতে পারিনি। 🤔 Photo পাঠান অথবা নিচে থেকে option বেছে নিন।';
    case 'mr':
      return 'समजलं नाही. 🤔 Photo पाठवा किंवा खाली option निवडा.';
    case 'gu':
      return 'સમજ ન આવ્યું. 🤔 Photo મોકલો અથવા નીચે option પસંદ કરો.';
    case 'kn':
      return 'ಅರ್ಥವಾಗಲಿಲ್ಲ. 🤔 Photo ಕಳಿಸಿ ಅಥವಾ ಕೆಳಗಿನ option ಆಯ್ಕೆ ಮಾಡಿ.';
    case 'ml':
      return 'മനസ്സിലായില്ല. 🤔 Photo അയക്കൂ അല്ലെങ്കിൽ താഴെ option തിരഞ്ഞെടുക്കൂ.';
    case 'pa':
      return 'ਸਮਝ ਨਹੀਂ ਆਇਆ। 🤔 Photo ਭੇਜੋ ਜਾਂ ਹੇਠਾਂ option ਚੁਣੋ।';
    case 'or':
      return 'ବୁଝି ହେଲା ନାହିଁ। 🤔 Photo ପଠାନ୍ତୁ ବା ତଳ option ବାଛନ୍ତୁ।';
    case 'en':
    default:
      return "Didn't catch that. 🤔 Send a photo or tap an option below.";
  }
}

export function msgGenericError(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Oho! Kuch gadbad ho gayi. 😅 Ek minute baad try karein.';
    case 'hi':
      return 'ओहो! कुछ गड़बड़ हो गई। 😅 एक minute बाद try करें।';
    case 'ta':
      return 'அய்யோ! ஏதோ தவறு நடந்தது. 😅 ஒரு minute பிறகு try பண்ணுங்கள்.';
    case 'te':
      return 'అయ్యో! ఏదో తేడా వచ్చింది. 😅 ఒక minute తర్వాత try చేయండి.';
    case 'bn':
      return 'আরে! কিছু একটা গন্ডগোল হয়েছে। 😅 এক minute পরে try করুন।';
    case 'mr':
      return 'अरेरे! काहीतरी चुकलं. 😅 एक minute नंतर try करा.';
    case 'gu':
      return 'ઓહો! કંઈક ગરબડ થઈ. 😅 એક minute પછી try કરો.';
    case 'kn':
      return 'ಅಯ್ಯೋ! ಏನೋ ತಪ್ಪಾಯ್ತು. 😅 ಒಂದು minute ನಂತರ try ಮಾಡಿ.';
    case 'ml':
      return 'അയ്യോ! എന്തോ കുഴപ്പം. 😅 ഒരു minute കഴിഞ്ഞ് try ചെയ്യൂ.';
    case 'pa':
      return 'ਓਹੋ! ਕੁਝ ਗੜਬੜ ਹੋ ਗਈ। 😅 ਇੱਕ minute ਬਾਅਦ try ਕਰੋ।';
    case 'or':
      return 'ଆରେ! କିଛି ଗୋଳମାଳ ହୋଇଗଲା। 😅 ଏକ minute ପରେ try କରନ୍ତୁ।';
    case 'en':
    default:
      return 'Oops! Something went wrong. 😅 Try again in a minute.';
  }
}

export function msgPhotoProcessingFailed(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Maaf kijiye, aapki photo process nahi ho payi. Kripya dobara try karein.';
    case 'hi':
      return 'माफ़ कीजिये, आपकी photo process नहीं हो पाई। कृपया दोबारा try करें।';
    case 'ta':
      return 'மன்னிக்கவும், உங்கள் photo process ஆகவில்லை. மீண்டும் try செய்யுங்கள்.';
    case 'te':
      return 'క్షమించండి, మీ photo process కాలేదు. దయచేసి మళ్ళీ try చేయండి.';
    case 'bn':
      return 'দুঃখিত, আপনার photo process হয়নি। আবার try করুন।';
    case 'mr':
      return 'माफ करा, तुमचा photo process झाला नाही. पुन्हा try करा.';
    case 'gu':
      return 'માફ કરો, તમારો photo process નથી થયો. કૃપા કરી ફરીથી try કરો.';
    case 'kn':
      return 'ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ photo process ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ try ಮಾಡಿ.';
    case 'ml':
      return 'ക്ഷമിക്കണം, നിങ്ങളുടെ photo process ആയില്ല. വീണ്ടും try ചെയ്യൂ.';
    case 'pa':
      return 'ਮਾਫ਼ ਕਰੋ, ਤੁਹਾਡੀ photo process ਨਹੀਂ ਹੋ ਸਕੀ। ਕਿਰਪਾ ਕਰ ਕੇ ਦੁਬਾਰਾ try ਕਰੋ।';
    case 'or':
      return 'କ୍ଷମା କରନ୍ତୁ, ଆପଣଙ୍କ photo process ହୋଇପାରିଲା ନାହିଁ। ଦୟାକରି ପୁଣି try କରନ୍ତୁ।';
    case 'en':
    default:
      return 'Sorry, we could not process your photo. Please try again.';
  }
}

export function msgEarlyPhotoAck(lang: Lang): string {
  switch (lang) {
    case 'hinglish':
      return 'Photo save ho gayi! Pehle setup pura kar lein, phir process karenge.';
    case 'hi':
      return 'Photo save हो गई! पहले setup पूरा कर लें, फिर process करेंगे।';
    case 'ta':
      return 'Photo save ஆகிவிட்டது! முதலில் setup முடிக்கலாம், அப்புறம் process பண்ணுவோம்.';
    case 'te':
      return 'Photo save అయింది! ముందు setup పూర్తి చేద్దాం, తర్వాత process చేస్తాం.';
    case 'bn':
      return 'Photo save হয়ে গেছে! আগে setup শেষ করি, তারপর process করবো।';
    case 'mr':
      return 'Photo save झाला! आधी setup पूर्ण करू, मग process करू.';
    case 'gu':
      return 'Photo save થઈ ગઈ! પહેલા setup પૂરો કરીએ, પછી process કરીશું.';
    case 'kn':
      return 'Photo save ಆಯ್ತು! ಮೊದಲು setup ಮುಗಿಸೋಣ, ಆಮೇಲೆ process ಮಾಡ್ತೀವಿ.';
    case 'ml':
      return 'Photo save ആയി! ആദ്യം setup തീർക്കാം, പിന്നെ process ചെയ്യാം.';
    case 'pa':
      return 'Photo save ਹੋ ਗਈ! ਪਹਿਲਾਂ setup ਪੂਰਾ ਕਰੀਏ, ਫਿਰ process ਕਰਾਂਗੇ।';
    case 'or':
      return 'Photo save ହୋଇଗଲା! ପ୍ରଥମେ setup ଶେଷ କରିବା, ତା\'ପରେ process କରିବୁ।';
    case 'en':
    default:
      return 'Photo saved! Let me finish setup first, then we\'ll process it.';
  }
}

// ---------------------------------------------------------------------------
// STYLE & CATEGORY DISPLAY NAMES
// ---------------------------------------------------------------------------

export function styleDisplayName(styleId: string, lang: Lang): string {
  const names: Record<string, { hinglish: string; en: string }> = {
    style_smart: { hinglish: '✨ Smart Style', en: '✨ Smart Style' },
    style_autmn_special: { hinglish: 'Autmn Special ✨', en: 'Autmn Special ✨' },
    style_clean_white: { hinglish: 'Saaf Safed Background', en: 'Clean White Background' },
    style_lifestyle: { hinglish: 'Lifestyle Setting', en: 'Lifestyle Setting' },
    style_gradient: { hinglish: 'Dark Luxury', en: 'Dark Luxury' },
    style_outdoor: { hinglish: 'Outdoor Scene', en: 'Outdoor Scene' },
    style_studio: { hinglish: 'Colored Studio', en: 'Colored Studio' },
    style_festive: { hinglish: 'Tyohar Style', en: 'Festive Style' },
    style_minimal: { hinglish: 'Minimal Saaf', en: 'Minimal & Clean' },
    style_with_model: { hinglish: 'Model Ke Saath', en: 'With Model' },
    style_video_shoot: { hinglish: 'Video Ad 🎬 (Beta)', en: 'Video Ad 🎬 (Beta)' },
  };
  // All non-hinglish languages fall back to English until translated
  const key = (lang === 'hinglish' || lang === 'hi') ? 'hinglish' : 'en';
  return names[styleId]?.[key] ?? styleId;
}

export function categoryDisplayName(categoryId: string, lang: Lang): string {
  const names: Record<string, { hinglish: string; en: string }> = {
    cat_jewellery: { hinglish: 'Jewellery / Zewar', en: 'Jewellery' },
    cat_food: { hinglish: 'Khaana / Food', en: 'Food' },
    cat_garment: { hinglish: 'Kapde / Garments', en: 'Garments' },
    cat_skincare: { hinglish: 'Skincare / Beauty', en: 'Skincare / Beauty' },
    cat_candle: { hinglish: 'Candle / Home Decor', en: 'Candle / Home Decor' },
    cat_bag: { hinglish: 'Bag / Purse', en: 'Bag / Purse' },
    cat_general: { hinglish: 'Kuch Aur / Other', en: 'Other' },
  };
  const key = (lang === 'hinglish' || lang === 'hi') ? 'hinglish' : 'en';
  return names[categoryId]?.[key] ?? categoryId;
}
