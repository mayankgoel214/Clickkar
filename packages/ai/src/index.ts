/**
 * @whatsads/ai — Core AI pipeline package.
 *
 * Processes product photos into professional images for Indian SMB sellers
 * using a smart AI-driven approach:
 *   - Product Analysis: Gemini 2.5 Flash deep product understanding
 *   - Ad Prompt: Gemini generates tailored scene descriptions
 *   - Primary: Nano Banana 2 via fal.ai (Google's product photography model)
 *   - Fallback: BiRefNet + Flux Pro + IC-Light segmentation compositing
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

// ---------------------------------------------------------------------------
// Product Analysis
// ---------------------------------------------------------------------------

export {
  analyzeProduct,
  generateAdPrompt,
  type ProductAnalysis,
} from './pipeline/product-analyzer.js';

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

export {
  assessInputImage,
  type InputAssessment,
} from './qa/assess.js';

export {
  checkOutputQuality,
  checkOutputWithReference,
  type OutputAssessment,
  type ComparativeAssessment,
} from './qa/output-check.js';

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
