/**
 * @whatsads/ai — Core AI pipeline package.
 *
 * Processes product photos into professional images for Indian SMB sellers
 * using a smart AI-driven approach:
 *   - Product Analysis: Gemini 2.5 Flash deep product understanding
 *   - Ad Prompt: Gemini generates tailored scene descriptions
 *   - Pipeline: BiRefNet cutout → Flux Pro background → sharp compositing
 *   - Product pixels are NEVER regenerated — only the background is AI-generated
 *   - QA: Gemini comparative check (input vs output fidelity)
 *   - Transcription: Groq Whisper Turbo with Sarvam AI fallback
 *   - Instruction parsing: Gemini 2.5 Flash Lite
 */

// ---------------------------------------------------------------------------
// Pipeline — main entry point
// ---------------------------------------------------------------------------

export {
  processProductImage,
  type ProcessImageParams,
  type ProcessImageResult,
} from './pipeline/orchestrator.js';

// V2 Pipeline — Gemini-first approach
export {
  processProductImageV2,
} from './pipeline/gemini-pipeline.js';

// V3 Pipeline — World-class creative ads (story-first, dynamic elements)
export {
  processProductImageV3,
} from './pipeline/gemini-pipeline-v3.js';

// Never-fail pipeline — production entry point
export {
  processImageNeverFail,
  type NeverFailResult,
} from './pipeline/never-fail-pipeline.js';

// Fallback tiers (for testing/direct use)
export {
  createStyledStudioShot,
  createCleanStudioShot,
  createEnhancedOriginal,
} from './pipeline/styled-studio.js';

// Story format (9:16) generation + ad text overlay
export {
  generateStoryFormat,
  addAdOverlay,
} from './pipeline/fallback.js';

// ---------------------------------------------------------------------------
// Product Analysis
// ---------------------------------------------------------------------------

export {
  analyzeAndPlan,
  analyzeProduct,
  generateAdPrompt,
  type ProductAnalysis,
  type AnalyzeAndPlanResult,
} from './pipeline/product-analyzer.js';

// Multi-angle product analyzer (1-5 photos → unified ProductProfile)
export {
  analyzeMultiAngleProduct,
  type MultiAngleProductProfile,
} from './pipeline/multi-angle-analyzer.js';

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

export {
  combinedQualityCheck,
  type CombinedQAResult,
} from './qa/combined-qa.js';

export {
  runDeterministicChecks,
  type DeterministicResult,
} from './qa/deterministic-checks.js';

export {
  runFocusedChecks,
  type FocusedCheckResult,
} from './qa/focused-checks.js';

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export {
  transcribeVoiceNote,
  transcribeWithGroq,
  transcribeWithSarvam,
  type TranscriptionResult,
} from './transcription/index.js';

// ---------------------------------------------------------------------------
// Instruction parsing
// ---------------------------------------------------------------------------

export {
  parseEditInstructions,
  type EditCommand,
} from './parsing/instructions.js';

export {
  parsePerPhotoInstructions,
  type InstructionParseResult,
} from './instructions/parse-per-photo.js';

// ---------------------------------------------------------------------------
// Scene prompt builder
// ---------------------------------------------------------------------------

export {
  buildScenePrompt,
  buildKontextPrompt,
  type StyleId,
  type ProductCategory,
} from './prompts/product-shot.js';

// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

export {
  preprocessImage,
  type ImageMetadata,
} from './pipeline/preprocess.js';

// ---------------------------------------------------------------------------
// Video generation
// ---------------------------------------------------------------------------

export {
  generateKenBurnsVideo,
  type KenBurnsEffect,
  type KenBurnsOptions,
  type KenBurnsResult,
} from './video/ken-burns.js';
