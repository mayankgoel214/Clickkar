export const CONVERSATION_STATES = [
  'IDLE',
  'ONBOARDING_WELCOME',
  'ONBOARDING_NAME',
  'ONBOARDING_CATEGORY',
  'ONBOARDING_CONSENT',
  'AWAITING_IMAGES',
  'AWAITING_STYLE',
  'AWAITING_VOICE',
  'CONFIRMING',
  'AWAITING_PAYMENT',
  'PROCESSING',
  'DELIVERED',
  'AWAITING_EDIT',
  'EDIT_PROCESSING',
] as const;

export type ConversationState = typeof CONVERSATION_STATES[number];

export interface SessionContext {
  phoneNumber: string;
  userName?: string;
  language: 'hi' | 'en';
  businessType?: string;
  currentState: ConversationState;
  currentOrderId?: string;
}

export interface MessageContext {
  messageId: string;
  messageType: 'text' | 'image' | 'audio' | 'interactive' | 'unknown';
  text?: string;
  mediaId?: string;
  buttonReplyId?: string;
  listReplyId?: string;
  isVoiceNote?: boolean;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Pricing constants
// ---------------------------------------------------------------------------

/** Price per image in paise (Rs 99) */
export const PRICE_PER_IMAGE_PAISE = 9900;

/** Edit revision fee in paise (Rs 29) */
export const EDIT_REVISION_PAISE = 2900;

/** Maximum images per order */
export const MAX_IMAGES_PER_ORDER = 5;

/** Free revisions per order */
export const FREE_REVISIONS_PER_ORDER = 2;

/** Seconds to wait for more images before advancing */
export const IMAGE_BATCH_TIMEOUT_SECONDS = 60;

/** Payment check job delay in milliseconds (2 minutes) */
export const PAYMENT_CHECK_DELAY_MS = 120_000;

// ---------------------------------------------------------------------------
// Button / list reply IDs
// ---------------------------------------------------------------------------

export const ButtonIds = {
  // Language
  LANG_HINDI: 'lang_hi',
  LANG_ENGLISH: 'lang_en',
  // Seller check
  IS_SELLER_YES: 'seller_yes',
  IS_SELLER_NO: 'seller_no',
  // Consent
  CONSENT_OK: 'consent_ok',
  // Order confirmation
  CONFIRM_ORDER: 'confirm_order',
  CHANGE_STYLE: 'change_style',
  // Feedback
  FEEDBACK_GREAT: 'feedback_great',
  FEEDBACK_CHANGE: 'feedback_change',
  FEEDBACK_REDO: 'feedback_redo',
  // Voice/skip
  SKIP_VOICE: 'skip_voice',
  // Edit options
  EDIT_BACKGROUND: 'edit_background',
  EDIT_LIGHTING: 'edit_lighting',
  EDIT_STYLE: 'edit_style',
  EDIT_TEXT: 'edit_text',
  EDIT_CROP: 'edit_crop',
  EDIT_OTHER: 'edit_other',
  // Multi-image
  SAME_STYLE: 'same_style',
  DIFF_STYLE: 'diff_style',
} as const;

export const ListIds = {
  // Categories
  CAT_JEWELLERY: 'cat_jewellery',
  CAT_FOOD: 'cat_food',
  CAT_GARMENT: 'cat_garment',
  CAT_SKINCARE: 'cat_skincare',
  CAT_CANDLE: 'cat_candle',
  CAT_BAG: 'cat_bag',
  CAT_GENERAL: 'cat_general',
  // Styles
  STYLE_CLEAN_WHITE: 'style_clean_white',
  STYLE_LIFESTYLE: 'style_lifestyle',
  STYLE_GRADIENT: 'style_gradient',
  STYLE_OUTDOOR: 'style_outdoor',
  STYLE_STUDIO: 'style_studio',
  STYLE_FESTIVE: 'style_festive',
  STYLE_MINIMAL: 'style_minimal',
} as const;
