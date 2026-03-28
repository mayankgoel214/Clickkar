/**
 * @whatsads/ai — Core AI pipeline package.
 *
 * Processes product photos into professional images for Indian SMB sellers
 * using a smart hybrid approach:
 *   - Primary: Bria Product Shot via fal.ai ($0.04/image, single API call)
 *   - Fallback: RMBG 2.0 + Flux Schnell + sharp compositing
 *   - QA: Gemini 2.5 Flash Lite (input assessment + output scoring)
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
// QA
// ---------------------------------------------------------------------------

export {
  assessInputImage,
  type InputAssessment,
} from './qa/assess.js';

export {
  checkOutputQuality,
  type OutputAssessment,
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
