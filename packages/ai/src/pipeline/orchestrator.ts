import { assessInputImage } from '../qa/assess.js';
import { checkOutputWithReference } from '../qa/output-check.js';
import { preprocessImage } from './preprocess.js';
import { analyzeProduct, generateAdPrompt } from './product-analyzer.js';
import { runCompositePipeline, downloadBuffer } from './fallback.js';
import type { InputAssessment } from '../qa/assess.js';
import type { ProductAnalysis } from './product-analyzer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessImageParams {
  imageUrl: string;
  style?: string;
  productCategory?: string;
  voiceInstructions?: string;
  maxAttempts?: number;
}

export interface ProcessImageResult {
  outputUrl: string;
  cutoutUrl?: string;
  qaScore: number;
  pipeline: 'composite';
  attempts: number;
  durationMs: number;
  inputAssessment?: InputAssessment;
  productAnalysis?: ProductAnalysis;
  adPrompt?: string;
  rejected?: boolean;
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QA_PASS_SCORE = 55;
const QA_FIDELITY_MIN = 15;
const DEFAULT_MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Creative product ad pipeline with inpainting.
 *
 * Flow:
 * 1. Download + preprocess
 * 2. Input quality gate
 * 3. PARALLEL: Product analysis (Gemini) + prepare for next steps
 * 4. Generate creative scene prompt
 * 5. BiRefNet cutout → canvas + mask → Flux Pro inpainting
 *    (AI generates creative scene AROUND the real product pixels)
 * 6. Comparative QA
 * 7. Retry with different prompt if needed
 */
export async function processProductImage(
  params: ProcessImageParams
): Promise<ProcessImageResult> {
  const totalStart = Date.now();
  const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  // -------------------------------------------------------------------------
  // Stage 1: Download + preprocess
  // -------------------------------------------------------------------------

  let rawBuffer: Buffer;
  try {
    rawBuffer = await downloadBuffer(params.imageUrl);
  } catch (err) {
    throw new Error(
      `Cannot download input image: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const { buffer: processedBuffer } = await preprocessImage(rawBuffer);

  // -------------------------------------------------------------------------
  // Stage 2: Input quality gate
  // -------------------------------------------------------------------------

  const inputAssessment = await assessInputImage(processedBuffer);

  if (!inputAssessment.usable) {
    return {
      outputUrl: '',
      qaScore: 0,
      pipeline: 'composite',
      attempts: 0,
      durationMs: Date.now() - totalStart,
      inputAssessment,
      rejected: true,
      rejectionReason: inputAssessment.rejectionReason ?? 'Image quality too low',
    };
  }

  const inputBufferForQA = processedBuffer;

  // -------------------------------------------------------------------------
  // Stage 3: Deep product analysis
  // -------------------------------------------------------------------------

  let analysis: ProductAnalysis;
  try {
    analysis = await analyzeProduct(processedBuffer);
  } catch (err) {
    console.error(JSON.stringify({
      event: 'analysis_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    analysis = {
      productName: 'Product',
      brandName: null,
      productType: params.productCategory ?? 'other',
      specificDescription: 'A product',
      dominantColors: ['neutral'],
      material: 'unknown',
      shape: 'standard',
      keyVisualElements: [],
      visibleText: [],
      targetAudience: 'general consumers',
      priceSegment: 'mid_range',
      salesChannel: 'online',
      desiredEmotion: 'trust',
      recommendedScene: {
        surface: 'clean white surface',
        background: 'soft gradient',
        lighting: 'soft diffused studio lighting',
        colorPalette: 'neutral tones',
        props: [],
        mood: 'clean and professional',
        photographyStyle: 'e-commerce product photography',
      },
      category: (params.productCategory ?? 'other') as ProductAnalysis['category'],
    };
  }

  // -------------------------------------------------------------------------
  // Stage 4: Generate creative scene prompt
  // -------------------------------------------------------------------------

  let creativePrompt: string;
  try {
    creativePrompt = await generateAdPrompt(analysis, params.voiceInstructions);
  } catch {
    const scene = analysis.recommendedScene;
    creativePrompt = `${scene.surface}, ${scene.background}, ${scene.lighting}, dramatic dynamic elements, professional advertisement photography`;
  }

  console.info(JSON.stringify({
    event: 'orchestrator_ready',
    productName: analysis.productName,
    category: analysis.category,
    creativePrompt,
  }));

  // -------------------------------------------------------------------------
  // Stage 5+6: Inpainting pipeline with retry
  // -------------------------------------------------------------------------

  let bestOutputUrl = '';
  let bestCutoutUrl = '';
  let bestQaScore = 0;
  let totalAttempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    totalAttempts = attempt;

    try {
      const promptForAttempt =
        attempt === 1
          ? creativePrompt
          : `${creativePrompt}, different composition, alternative creative direction`;

      const { outputUrl, cutoutUrl } = await runCompositePipeline({
        imageUrl: params.imageUrl,
        creativePrompt: promptForAttempt,
        productCategory: analysis.category,
      });

      // QA check
      const outputBuffer = await downloadBuffer(outputUrl);
      const qa = await checkOutputWithReference(inputBufferForQA, outputBuffer);

      console.info(JSON.stringify({
        event: `orchestrator_attempt_${attempt}`,
        qaScore: qa.score,
        fidelity: qa.productFidelity,
        fidelityScore: qa.productFidelityScore,
      }));

      if (qa.score > bestQaScore) {
        bestOutputUrl = outputUrl;
        bestCutoutUrl = cutoutUrl;
        bestQaScore = qa.score;
      }

      if (qa.score >= QA_PASS_SCORE && qa.productFidelityScore >= QA_FIDELITY_MIN) {
        return {
          outputUrl,
          cutoutUrl,
          qaScore: qa.score,
          pipeline: 'composite',
          attempts: attempt,
          durationMs: Date.now() - totalStart,
          inputAssessment,
          productAnalysis: analysis,
          adPrompt: creativePrompt,
        };
      }
    } catch (err) {
      console.error(JSON.stringify({
        event: `orchestrator_attempt_${attempt}_error`,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  if (!bestOutputUrl) {
    throw new Error('All pipeline attempts failed');
  }

  return {
    outputUrl: bestOutputUrl,
    cutoutUrl: bestCutoutUrl,
    qaScore: bestQaScore,
    pipeline: 'composite',
    attempts: totalAttempts,
    durationMs: Date.now() - totalStart,
    inputAssessment,
    productAnalysis: analysis,
    adPrompt: creativePrompt,
  };
}
