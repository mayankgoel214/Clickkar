/**
 * Shared pipeline types extracted from orchestrator.ts (V1).
 * Consumed by gemini-pipeline-v5.ts and never-fail-pipeline.ts.
 */

export interface ProcessImageParams {
  imageUrl: string;
  style?: string;
  productCategory?: string;
  voiceInstructions?: string;
  maxAttempts?: number;
  /** Pre-computed multi-angle product profile. Passed from worker when the order has
   *  multiple input images. The V3 pipeline uses this to skip redundant analysis and
   *  to provide richer context about all angles of the product. */
  productProfile?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ProcessImageResult {
  outputUrl: string;
  outputBuffer?: Buffer;
  storyUrl?: string;
  videoUrl?: string;
  cutoutUrl?: string;
  studioShotUrl?: string;
  qaScore: number;
  pipeline: 'composite' | 'styled-studio-fallback' | 'primary';
  attempts: number;
  durationMs: number;
  inputAssessment?: { usable: boolean; productCategory: string };
  // productAnalysis was typed against the V1 ProductAnalysis from product-analyzer.ts (now deleted).
  // V5 and never-fail pipelines do not populate this field.
  productAnalysis?: unknown;
  adPrompt?: string;
  rejected?: boolean;
  rejectionReason?: string;
  /** The creative direction actually used during generation — returned so the worker
   *  can cache it per-style regardless of whether the profile already had it. */
  usedCreativeDirection?: {
    heroMoment: string;
    creativeBrief: string;
    scenePrompt: string;
    dynamicElements: string[];
    emotionalTrigger: string;
    storyScene: string;
    backgroundOnlyPrompt: string;
  };
}
