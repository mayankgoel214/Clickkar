/**
 * @autmn/ai — Core AI pipeline package.
 *
 * Processes product photos into professional images for Indian SMB sellers
 * using a smart AI-driven approach:
 *   - Production pipeline: Beta prompt + Pro → Flash → GPT-2 fallback chain
 *   - Never-fail orchestrator: thin wrapper over production.ts
 *   - QA: deterministic sharp-based checks (no LLM QA gate in production)
 *   - Transcription: Groq Whisper Turbo with Sarvam AI fallback
 *   - Instruction parsing: Gemini 2.5 Flash Lite
 */

// ---------------------------------------------------------------------------
// Pipeline — main entry point (production)
// ---------------------------------------------------------------------------

export {
  processImageNeverFail,
  type NeverFailResult,
  type NeverFailParams,
} from './pipeline/never-fail-pipeline.js';

export {
  processOrderProduction,
  processStyleProduction,
  type ProductionParams,
  type ProductionResult,
  type StyleResult,
} from './pipeline/production.js';

// Shared pipeline types
export type { ProcessImageParams, ProcessImageResult } from './pipeline/_common/types.js';

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

export {
  runDeterministicChecks,
  type DeterministicResult,
} from './qa/deterministic-checks.js';

// ---------------------------------------------------------------------------
// Analysis + prompt building
// ---------------------------------------------------------------------------

export {
  lightAnalyze,
  type LightAnalysis,
} from './pipeline/light-analyzer.js';

export { buildBetaPrompt } from './pipeline/style-prompts-v5.js';

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

export {
  parsePerStyleInstructions,
  type PerStyleInstructionResult,
} from './instructions/parse-per-style.js';

// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

export {
  preprocessImage,
  type ImageMetadata,
} from './pipeline/preprocess.js';

// ---------------------------------------------------------------------------
// Shared image I/O helpers (used by worker)
// ---------------------------------------------------------------------------

export {
  downloadBuffer,
} from './pipeline/fallback.js';

// ---------------------------------------------------------------------------
// OpenAI image generation (admin A/B testing)
// ---------------------------------------------------------------------------

export {
  openaiGenerateImage,
  type OpenAIGenerateParams,
  type OpenAIModelId,
} from './pipeline/openai-generate.js';
