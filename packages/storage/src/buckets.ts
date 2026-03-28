export const Buckets = {
  RAW_IMAGES: "raw-images",
  PROCESSED_IMAGES: "processed-images",
  VOICE_NOTES: "voice-notes",
  CUTOUTS: "cutouts",
} as const;

export type Bucket = (typeof Buckets)[keyof typeof Buckets];
