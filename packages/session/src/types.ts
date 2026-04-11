export const CONVERSATION_STATES = [
  'IDLE',
  'SETUP_LANGUAGE',
  'SETUP_NAME',
  'SETUP_CATEGORY',
  'SETUP_STYLE',
  'AWAITING_PHOTO',
  'AWAITING_PAYMENT',
  'PROCESSING',
  'DELIVERED',
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
  caption?: string;        // Image caption text from WhatsApp
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

/** Seconds to wait for more photos before showing Process/Instructions buttons */
export const PHOTO_BATCH_TIMEOUT_SECONDS = 45;

/** Seconds to wait after showing Process/Instructions buttons before auto-advancing */
export const BUTTONS_SHOWN_TIMEOUT_SECONDS = 30;

/** Payment check job delay in milliseconds (2 minutes) */
export const PAYMENT_CHECK_DELAY_MS = 120_000;

// ---------------------------------------------------------------------------
// Button / list reply IDs
// ---------------------------------------------------------------------------

export const ButtonIds = {
  // Language
  LANG_HINDI: 'lang_hi',
  LANG_ENGLISH: 'lang_en',
  // Returning user style confirm
  SAME_STYLE: 'same_style',
  NEW_STYLE: 'new_style',
  // Free trial confirm
  CONFIRM_FREE: 'confirm_free',
  // Feedback
  FEEDBACK_GREAT: 'feedback_great',
  FEEDBACK_CHANGE: 'feedback_change',
  FEEDBACK_REDO: 'feedback_redo',
  // Payment
  CANCEL_ORDER: 'cancel_order',
  // Edit options (used in EDIT_PROCESSING / handleAwaitingEdit)
  EDIT_BACKGROUND: 'edit_background',
  EDIT_LIGHTING: 'edit_lighting',
  EDIT_STYLE: 'edit_style',
  EDIT_CROP: 'edit_crop',
  EDIT_OTHER: 'edit_other',
  // Photo batch — process or add instructions
  PROCESS_NOW: 'process_now',
  ADD_INSTRUCTIONS: 'add_instructions',
} as const;

// Category → recommended style mapping (must stay in sync with resolveSmartStyle in style.ts)
export const CATEGORY_STYLE_RECOMMENDATION: Record<string, string> = {
  cat_jewellery: 'style_gradient',
  cat_food: 'style_lifestyle',
  cat_garment: 'style_lifestyle',
  cat_skincare: 'style_minimal',
  cat_candle: 'style_lifestyle',
  cat_bag: 'style_outdoor',
  cat_general: 'style_studio',
};

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
  STYLE_SMART: 'style_smart',
  STYLE_CLEAN_WHITE: 'style_clean_white',
  STYLE_LIFESTYLE: 'style_lifestyle',
  STYLE_GRADIENT: 'style_gradient',
  STYLE_OUTDOOR: 'style_outdoor',
  STYLE_STUDIO: 'style_studio',
  STYLE_FESTIVE: 'style_festive',
  STYLE_MINIMAL: 'style_minimal',
  STYLE_WITH_MODEL: 'style_with_model',
} as const;
