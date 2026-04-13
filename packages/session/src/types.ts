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
  'AWAITING_REVISION_PAYMENT',
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

/** Price per order in paise (Rs 199 for 3 style ads) */
export const PRICE_PER_ORDER_PAISE = 19900;

/** Number of style ad outputs generated per order */
export const OUTPUT_STYLES_PER_ORDER = 3;

/** Free redos per style output */
export const FREE_REDOS_PER_STYLE = 1;

/** @deprecated Use PRICE_PER_ORDER_PAISE instead. Price per image in paise (Rs 99) */
export const PRICE_PER_IMAGE_PAISE = 9900;

/** Edit revision fee in paise (Rs 29) */
export const EDIT_REVISION_PAISE = 2900;

/** Maximum reference photos per order (angle shots of the same product) */
export const MAX_IMAGES_PER_ORDER = 5;

/**
 * Free redos per image. Each image the customer paid for gets this many
 * free regenerations. Total free redos for an order = imageCount * FREE_REDOS_PER_IMAGE.
 */
export const FREE_REDOS_PER_IMAGE = 1;

/** @deprecated Use FREE_REDOS_PER_IMAGE instead. */
export const FREE_REVISIONS_PER_ORDER = 2;

/** Seconds to wait (rolling debounce) for more photos before showing buttons */
export const PHOTO_BATCH_TIMEOUT_SECONDS = 8;

/** @deprecated No longer used — buttons no longer auto-advance */
export const BUTTONS_SHOWN_TIMEOUT_SECONDS = 30;

/** Seconds before sending a gentle nudge if user hasn't acted after buttons shown */
export const PHOTO_NUDGE_TIMEOUT_SECONDS = 120;

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
  // 3-style output — redo a specific style
  REDO_STYLE_0: 'redo_style_0',
  REDO_STYLE_1: 'redo_style_1',
  REDO_STYLE_2: 'redo_style_2',
  // Generic "change something" from multi-style feedback
  CHANGE_SOMETHING: 'change_something',
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
  // Style packs (single-tap = all 3 styles resolved)
  SMART_PACK: 'smart_pack',
  BESTSELLER_PACK: 'bestseller_pack',
  FESTIVAL_PACK: 'festival_pack',
  ACTION_PACK: 'action_pack',
  CUSTOM_PACK: 'custom_pack',
  // Individual styles (used in custom 3-step picker)
  STYLE_CLICKKAR_SPECIAL: 'style_clickkar_special',
  STYLE_CLEAN_WHITE: 'style_clean_white',
  STYLE_LIFESTYLE: 'style_lifestyle',
  STYLE_GRADIENT: 'style_gradient',
  STYLE_OUTDOOR: 'style_outdoor',
  STYLE_STUDIO: 'style_studio',
  STYLE_FESTIVE: 'style_festive',
  STYLE_WITH_MODEL: 'style_with_model',
  STYLE_VIDEO_SHOOT: 'style_video_shoot',
} as const;
