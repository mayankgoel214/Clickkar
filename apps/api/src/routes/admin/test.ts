/**
 * Admin Test UI — mirrors the WhatsApp customer experience for rapid pipeline testing.
 *
 * GET  /admin/test         → HTML page (style picker + photo upload + results)
 * POST /admin/test/generate → multipart endpoint; runs image generation
 *
 * Auth: query param ?key=<ADMIN_SECRET> (skipped when ADMIN_SECRET === 'placeholder' in dev)
 */

import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { getConfig } from '../../config.js';
import { uploadFile } from '@autmn/storage';
import { Buckets } from '@autmn/storage';
import { lightAnalyze, type LightAnalysis } from '@autmn/ai';
import { processOrderProduction } from '@autmn/ai';
import { buildBetaPrompt } from '@autmn/ai';
import { openaiGenerateImage, type OpenAIModelId } from '@autmn/ai';
import { preprocessImage } from '@autmn/ai';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function checkAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  const config = getConfig();
  const adminSecret = config.ADMIN_SECRET ?? '';

  if (config.NODE_ENV !== 'production' && adminSecret === 'placeholder') {
    return true;
  }

  const key = (req.query as Record<string, string>)['key'] ?? '';
  if (!key || !adminSecret) {
    reply.code(403).send({ error: 'Forbidden', code: 'ADMIN_AUTH_REQUIRED' });
    return false;
  }

  try {
    if (
      Buffer.byteLength(key) !== Buffer.byteLength(adminSecret) ||
      !timingSafeEqual(Buffer.from(key), Buffer.from(adminSecret))
    ) {
      reply.code(403).send({ error: 'Forbidden', code: 'ADMIN_AUTH_REQUIRED' });
      return false;
    }
  } catch {
    reply.code(403).send({ error: 'Forbidden', code: 'ADMIN_AUTH_REQUIRED' });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Style metadata — matches styleDisplayName() from packages/session/src/messages.ts
// ---------------------------------------------------------------------------

const STYLES = [
  { id: 'style_autmn_special', label: 'Autmn Special' },
  { id: 'style_clean_white',   label: 'Clean White Background' },
  { id: 'style_lifestyle',     label: 'Lifestyle Setting' },
  { id: 'style_gradient',      label: 'Dark Luxury' },
  { id: 'style_outdoor',       label: 'Outdoor Scene' },
  { id: 'style_studio',        label: 'Colored Studio' },
  { id: 'style_festive',       label: 'Festive Style' },
  { id: 'style_minimal',       label: 'Minimal & Clean' },
  { id: 'style_with_model',    label: 'With Model' },
] as const;

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

const STYLES_JSON = JSON.stringify(STYLES);

function buildHtml(adminKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Autmn Admin — Pipeline Test</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .thumb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
    .thumb-grid img { width: 100%; height: 100px; object-fit: cover; border-radius: 6px; border: 2px solid #e5e7eb; }
    .style-btn { transition: all 0.15s; }
    .style-btn.selected { border-color: #6366f1; background-color: #eef2ff; }
    .style-btn.selected .style-check { display: inline; }
    .style-btn .style-check { display: none; }
    pre { white-space: pre-wrap; word-break: break-word; }
    .result-card { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">

<div class="max-w-5xl mx-auto px-4 py-8">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-2xl font-bold text-gray-900">Autmn Pipeline Tester</h1>
    <p class="text-sm text-gray-500 mt-1">Upload 1–5 photos, pick 3 styles, run the production pipeline. Beta prompt + Pro → NB2 → GPT Image 2.</p>
  </div>

  <!-- Step 1: Upload Photos -->
  <div class="bg-white rounded-xl border border-gray-200 p-6 mb-5 shadow-sm">
    <h2 class="font-semibold text-gray-800 mb-3">1. Upload Photos <span class="text-gray-400 text-sm font-normal">(1–5, max 10MB each)</span></h2>
    <label
      id="drop-zone"
      class="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg py-10 px-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition"
    >
      <svg class="w-10 h-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
      <span class="text-gray-500">Drag & drop photos here, or <span class="text-indigo-600 font-medium">click to browse</span></span>
      <span class="text-xs text-gray-400 mt-1">JPG, PNG, WEBP</span>
      <input id="file-input" type="file" multiple accept="image/*" class="hidden" />
    </label>
    <div id="thumb-container" class="mt-4 thumb-grid hidden"></div>
    <p id="photo-count-msg" class="text-sm text-gray-500 mt-2 hidden"></p>
  </div>

  <!-- Step 2: Pick 3 Styles -->
  <div class="bg-white rounded-xl border border-gray-200 p-6 mb-5 shadow-sm">
    <h2 class="font-semibold text-gray-800 mb-1">2. Pick Exactly 3 Styles</h2>
    <p id="style-count-label" class="text-sm text-gray-400 mb-4">0/3 selected</p>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3" id="style-grid"></div>
  </div>

  <!-- Step 3: Pipeline info (read-only) -->
  <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-5">
    <p class="text-sm text-indigo-800 font-medium">Pipeline: Production (Beta)</p>
    <p class="text-xs text-indigo-600 mt-1">Beta prompt per style &rarr; Tier 1: gemini-3-pro-image-preview (&#8377;13.40) &rarr; Tier 2: gemini-3.1-flash-image-preview (&#8377;4.50) &rarr; Tier 3: gpt-image-2 (&#8377;21.00). Ceiling per style: &#8377;38.90. Full order (3 styles): &#8377;50 ceiling.</p>
  </div>

  <!-- Step 4: Model selector (for direct OpenAI A/B testing) -->
  <div class="bg-white rounded-xl border border-gray-200 p-6 mb-5 shadow-sm">
    <h2 class="font-semibold text-gray-800 mb-1">3. Model Override <span class="text-gray-400 text-sm font-normal">(optional — bypasses Gemini entirely)</span></h2>
    <p class="text-sm text-gray-400 mb-4">Leave on "Auto (Production Chain)" to run the full tier chain. Select an OpenAI model to bypass Gemini and test direct OpenAI generation.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="model-grid">
      <label class="model-option flex items-start gap-3 cursor-pointer border-2 border-indigo-500 rounded-lg p-3 bg-indigo-50 transition" data-model="">
        <input type="radio" name="imageModel" value="" checked class="mt-1 accent-indigo-600" />
        <div class="flex-1">
          <div class="font-medium text-sm text-gray-800">Auto (Production Chain)</div>
          <div class="text-xs text-gray-500">Pro &rarr; NB2 &rarr; GPT-2. Best quality, uses full tier fallback.</div>
        </div>
      </label>
      <label class="model-option flex items-start gap-3 cursor-pointer border-2 border-gray-200 rounded-lg p-3 hover:border-indigo-300 transition" data-model="gpt-image-2">
        <input type="radio" name="imageModel" value="gpt-image-2" class="mt-1 accent-indigo-600" />
        <div class="flex-1">
          <div class="font-medium text-sm text-gray-800">GPT Image 2 <span class="text-xs text-gray-400">(direct, no Gemini)</span></div>
          <div class="text-xs text-gray-500">&#8377;21/style — Arena #2 for editing. Direct bypass for comparison.</div>
        </div>
      </label>
      <label class="model-option flex items-start gap-3 cursor-pointer border-2 border-gray-200 rounded-lg p-3 hover:border-indigo-300 transition" data-model="gpt-image-1.5">
        <input type="radio" name="imageModel" value="gpt-image-1.5" class="mt-1 accent-indigo-600" />
        <div class="flex-1">
          <div class="font-medium text-sm text-gray-800">GPT Image 1.5 <span class="text-xs text-gray-400">(direct, no Gemini)</span></div>
          <div class="text-xs text-gray-500">&#8377;10/style — cheaper OpenAI option for A/B testing.</div>
        </div>
      </label>
    </div>
  </div>

  <!-- Step 5: Instructions -->
  <div class="bg-white rounded-xl border border-gray-200 p-6 mb-5 shadow-sm">
    <h2 class="font-semibold text-gray-800 mb-3">4. Instructions <span class="text-gray-400 text-sm font-normal">(optional)</span></h2>
    <textarea
      id="instructions"
      rows="3"
      placeholder="Any special instructions? e.g. 'show on a marble slab' or 'make the model wear a red saree'"
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
    ></textarea>
  </div>

  <!-- Start button -->
  <button
    id="start-btn"
    disabled
    class="w-full py-3 px-6 rounded-xl font-semibold text-white bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 transition"
  >
    Generate 3 Images
  </button>

  <!-- Progress -->
  <div id="progress-area" class="hidden mt-8 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
    <div class="flex items-center gap-3">
      <div class="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <span class="text-gray-700 font-medium" id="progress-text">Processing...</span>
    </div>
    <!-- Analysis block -->
    <div id="analysis-block" class="hidden mt-5 border-t border-gray-100 pt-4">
      <p class="text-xs text-gray-400 uppercase tracking-wide mb-2 font-semibold">Gemini understood this product as:</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm" id="analysis-grid"></div>
    </div>
    <!-- V1.2.1: Parsed instructions block -->
    <div id="parsed-instructions-block" class="hidden mt-5 border-t border-gray-100 pt-4">
      <p class="text-xs text-emerald-600 uppercase tracking-wide mb-2 font-semibold">Instructions parsed (per-style routing)</p>
      <div id="parsed-instructions-body"></div>
    </div>
    <!-- V1.1: Creative Brief block -->
    <div id="brief-block" class="hidden mt-5 border-t border-gray-100 pt-4">
      <p class="text-xs text-indigo-500 uppercase tracking-wide mb-2 font-semibold">Creative Brief (per-product art direction)</p>
      <div id="brief-body"></div>
    </div>
  </div>

  <!-- Results -->
  <div id="results-area" class="hidden mt-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-800">Results</h2>
      <!-- Cost summary -->
      <div id="cost-summary" class="hidden text-sm font-medium rounded-lg px-3 py-1.5 border"></div>
    </div>
    <div id="results-grid" class="grid grid-cols-1 sm:grid-cols-3 gap-5"></div>
    <button
      id="again-btn"
      class="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-white bg-gray-700 hover:bg-gray-800 transition"
    >
      Run Again
    </button>
  </div>

  <!-- Error -->
  <div id="error-area" class="hidden mt-8 bg-red-50 border border-red-200 rounded-xl p-5 text-red-800 text-sm"></div>
</div>

<script>
const ADMIN_KEY = ${JSON.stringify(adminKey)};
const IMAGE_STYLES = ${STYLES_JSON};

let selectedFiles = [];
let selectedStyles = [];

// ── File upload ──────────────────────────────────────────────────────────────

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const thumbCont  = document.getElementById('thumb-container');
const photoMsg   = document.getElementById('photo-count-msg');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('border-indigo-400'); });
dropZone.addEventListener('dragleave',  () => dropZone.classList.remove('border-indigo-400'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('border-indigo-400');
  handleFiles([...e.dataTransfer.files]);
});
fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));

function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  const oversized  = imageFiles.filter(f => f.size > 10 * 1024 * 1024);
  if (oversized.length) {
    showError('Some files exceed 10MB and were skipped: ' + oversized.map(f => f.name).join(', '));
    return;
  }
  const merged = [...selectedFiles, ...imageFiles].slice(0, 5);
  selectedFiles = merged;
  renderThumbs();
  updateStartBtn();
}

function renderThumbs() {
  thumbCont.innerHTML = '';
  if (selectedFiles.length === 0) {
    thumbCont.classList.add('hidden');
    photoMsg.classList.add('hidden');
    return;
  }
  thumbCont.classList.remove('hidden');
  photoMsg.classList.remove('hidden');
  photoMsg.textContent = selectedFiles.length + ' photo' + (selectedFiles.length > 1 ? 's' : '') + ' selected' + (selectedFiles.length === 1 ? ' (Primary)' : ' (first = Primary)');
  selectedFiles.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.title = (idx === 0 ? 'Primary — ' : '') + file.name;
      if (idx === 0) img.style.borderColor = '#6366f1';
      thumbCont.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

// ── Style picker ─────────────────────────────────────────────────────────────

const styleGrid  = document.getElementById('style-grid');
const styleLabel = document.getElementById('style-count-label');

IMAGE_STYLES.forEach(s => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.styleId = s.id;
  btn.className = 'style-btn border-2 border-gray-200 rounded-lg px-4 py-3 text-left hover:border-indigo-300 transition text-sm';
  btn.innerHTML = '<span class="style-check text-indigo-600 mr-1">&#10003;</span>' + s.label;
  btn.addEventListener('click', () => toggleImageStyle(s.id, btn));
  styleGrid.appendChild(btn);
});

function toggleImageStyle(id, btn) {
  if (selectedStyles.includes(id)) {
    selectedStyles = selectedStyles.filter(s => s !== id);
    btn.classList.remove('selected');
  } else {
    if (selectedStyles.length >= 3) return;
    selectedStyles.push(id);
    btn.classList.add('selected');
  }
  styleLabel.textContent = selectedStyles.length + '/3 selected';
  updateStartBtn();
}

// ── Model selector ────────────────────────────────────────────────────────────

document.querySelectorAll('.model-option input[type="radio"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.model-option').forEach(label => {
      label.classList.remove('border-indigo-500', 'bg-indigo-50');
      label.classList.add('border-gray-200');
    });
    const checked = document.querySelector('.model-option input[type="radio"]:checked');
    if (checked) {
      const label = checked.closest('.model-option');
      label.classList.remove('border-gray-200');
      label.classList.add('border-indigo-500', 'bg-indigo-50');
    }
  });
});

// ── Start button ─────────────────────────────────────────────────────────────

const startBtn = document.getElementById('start-btn');

function updateStartBtn() {
  const ready = selectedFiles.length >= 1 && selectedStyles.length === 3;
  startBtn.disabled = !ready;
}

startBtn.addEventListener('click', runGeneration);

// ── Generation ───────────────────────────────────────────────────────────────

const progressArea = document.getElementById('progress-area');
const progressText = document.getElementById('progress-text');
const analysisBlock = document.getElementById('analysis-block');
const analysisGrid  = document.getElementById('analysis-grid');
const resultsArea  = document.getElementById('results-area');
const resultsGrid  = document.getElementById('results-grid');
const errorArea    = document.getElementById('error-area');
const againBtn     = document.getElementById('again-btn');
const costSummary  = document.getElementById('cost-summary');

againBtn.addEventListener('click', resetUI);

async function runGeneration() {
  clearError();
  startBtn.disabled = true;
  progressArea.classList.remove('hidden');
  resultsArea.classList.add('hidden');
  analysisBlock.classList.add('hidden');
  const briefBlock = document.getElementById('brief-block');
  if (briefBlock) briefBlock.classList.add('hidden');
  const piBlock = document.getElementById('parsed-instructions-block');
  if (piBlock) piBlock.classList.add('hidden');
  costSummary.classList.add('hidden');

  progressText.textContent = 'Photo mil gayi! 3 ads bana rahe hain...';

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('photos', f));

  selectedStyles.forEach(s => formData.append('styles', s));
  const instructions = document.getElementById('instructions').value.trim();
  if (instructions) formData.append('instructions', instructions);
  const modelRadio = document.querySelector('input[name="imageModel"]:checked');
  if (modelRadio && modelRadio.value) formData.append('imageModel', modelRadio.value);

  const url = '/admin/test/generate' + (ADMIN_KEY ? '?key=' + encodeURIComponent(ADMIN_KEY) : '');

  let resp;
  try {
    resp = await fetch(url, { method: 'POST', body: formData });
  } catch (err) {
    progressArea.classList.add('hidden');
    startBtn.disabled = false;
    showError('Network error: ' + err.message);
    return;
  }

  if (!resp.ok) {
    progressArea.classList.add('hidden');
    startBtn.disabled = false;
    let msg = 'Server error ' + resp.status;
    try { const j = await resp.json(); msg = j.error || msg; } catch {}
    showError(msg);
    return;
  }

  let data;
  try { data = await resp.json(); } catch {
    progressArea.classList.add('hidden');
    startBtn.disabled = false;
    showError('Invalid JSON response from server.');
    return;
  }

  // Show analysis
  if (data.analysis) {
    const a = data.analysis;
    analysisBlock.classList.remove('hidden');
    analysisGrid.innerHTML = '';
    [
      { label: 'Product', value: a.productName },
      { label: 'Category', value: a.productCategory },
      { label: 'Items', value: a.itemCount > 1 ? a.itemCount + 'x — ' + a.items.join(', ') : (a.items?.[0] ?? a.productName) },
      { label: 'Set', value: a.setDescription || '—' },
    ].forEach(({ label, value }) => {
      const div = document.createElement('div');
      div.className = 'bg-gray-50 rounded-lg p-3';
      div.innerHTML = '<p class="text-xs text-gray-400 mb-0.5">' + label + '</p><p class="text-gray-800 font-medium text-sm">' + escHtml(value) + '</p>';
      analysisGrid.appendChild(div);
    });
  }

  // V1.2.1: Show parsed instructions (per-style routing)
  if (data.parsedInstructions) {
    const pi = data.parsedInstructions;
    const piBlock = document.getElementById('parsed-instructions-block');
    const piBody  = document.getElementById('parsed-instructions-body');
    if (piBlock && piBody) {
      piBlock.classList.remove('hidden');
      var piHtml = '<div class="bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-2">' +
        '<p class="text-xs text-emerald-600 mb-1">Confidence: <span class="font-medium">' + (pi.confidence * 100).toFixed(0) + '%</span></p>' +
        '</div>';
      if (pi.globalInstruction) {
        piHtml += '<div class="bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-2">' +
          '<p class="text-xs text-emerald-600 mb-1">Apply to ALL styles</p>' +
          '<p class="text-sm text-gray-800">' + escHtml(pi.globalInstruction) + '</p>' +
          '</div>';
      }
      Object.entries(pi.perStyle).forEach(([style, instr]) => {
        if (instr && instr.trim()) {
          piHtml += '<div class="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">' +
            '<p class="text-xs text-gray-400 mb-1">' + escHtml(style) + '</p>' +
            '<p class="text-sm text-gray-800">' + escHtml(instr) + '</p>' +
            '</div>';
        }
      });
      const ignoredStyles = Object.entries(pi.perStyle).filter(([_, v]) => !v || !v.trim()).map(([s]) => s);
      if (ignoredStyles.length > 0 && !pi.globalInstruction) {
        piHtml += '<p class="text-xs text-gray-400 mt-1">No instruction for: ' + ignoredStyles.join(', ') + '</p>';
      }
      piBody.innerHTML = piHtml;
    }
  }

  // V1.1: Show creative brief (per-product art direction)
  if (data.creativeBrief) {
    const cb = data.creativeBrief;
    const briefBlock = document.getElementById('brief-block');
    const briefBody = document.getElementById('brief-body');
    if (briefBlock && briefBody) {
      briefBlock.classList.remove('hidden');
      var briefHtml = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">' +
        '<div class="bg-indigo-50 border border-indigo-100 rounded-lg p-3"><p class="text-xs text-indigo-500 mb-0.5">Product type</p><p class="text-sm text-gray-800">' + escHtml(cb.profile.productType) + '</p></div>' +
        '<div class="bg-indigo-50 border border-indigo-100 rounded-lg p-3"><p class="text-xs text-indigo-500 mb-0.5">Brand identity</p><p class="text-sm text-gray-800">' + escHtml(cb.profile.brandIdentity) + '</p></div>' +
        '<div class="bg-indigo-50 border border-indigo-100 rounded-lg p-3"><p class="text-xs text-indigo-500 mb-0.5">Target audience</p><p class="text-sm text-gray-800">' + escHtml(cb.profile.targetAudience) + '</p></div>' +
        '<div class="bg-indigo-50 border border-indigo-100 rounded-lg p-3"><p class="text-xs text-indigo-500 mb-0.5">Cultural fit</p><p class="text-sm text-gray-800">' + escHtml(cb.profile.culturalFit) + '</p></div>' +
        '<div class="bg-indigo-50 border border-indigo-100 rounded-lg p-3 md:col-span-2"><p class="text-xs text-indigo-500 mb-0.5">Uniqueness</p><p class="text-sm text-gray-800">' + escHtml(cb.profile.uniqueness) + '</p></div>' +
        '</div>';
      briefHtml += '<p class="text-xs uppercase tracking-wide text-gray-400 mb-2">Per-style direction</p>';
      Object.entries(cb.directions).forEach(([style, dir]) => {
        briefHtml += '<div class="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">' +
          '<p class="text-xs text-gray-400 mb-1">' + escHtml(style) + '</p>' +
          '<p class="text-sm text-gray-800 mb-1"><span class="font-medium">Scene:</span> ' + escHtml(dir.sceneDirection) + '</p>' +
          '<p class="text-sm text-gray-700"><span class="font-medium">Mood:</span> ' + escHtml(dir.moodAnchor) + '</p>' +
          '</div>';
      });
      briefBody.innerHTML = briefHtml;
    }
  }

  progressArea.classList.add('hidden');
  resultsArea.classList.remove('hidden');
  resultsGrid.innerHTML = '';

  const results = data.results ?? [];
  results.forEach((r, idx) => {
    renderImageResult(r, idx);
  });

  // Cost summary
  if (data.costSummary) {
    const cs = data.costSummary;
    const overBudget = cs.totalCostInr > 50;
    costSummary.classList.remove('hidden');
    costSummary.className = 'text-sm font-medium rounded-lg px-3 py-1.5 border ' +
      (overBudget
        ? 'bg-red-50 border-red-200 text-red-800'
        : 'bg-green-50 border-green-200 text-green-800');
    costSummary.textContent =
      'Cost: \\u20B9' + cs.totalCostInr.toFixed(2) +
      ' | Margin: \\u20B9' + cs.marginInr.toFixed(2) +
      ' (' + cs.marginPct.toFixed(1) + '%)' +
      (cs.needsRefund ? ' | REFUND NEEDED' : '');
  }
}

function renderImageResult(r, idx) {
  const styleInfo = IMAGE_STYLES.find(s => s.id === r.style);
  const styleLabel = styleInfo?.label ?? r.style;
  const card = document.createElement('div');
  card.className = 'result-card bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden';

  const tierBadge = r.tier ? 'Tier ' + r.tier + ' — ' + (r.pipeline ?? r.model ?? '') : (r.pipeline ?? '');
  const costBadge = r.costInr != null ? '\\u20B9' + Number(r.costInr).toFixed(2) : '';

  if (r.error) {
    card.innerHTML =
      '<div class="p-4">' +
        '<p class="font-semibold text-gray-800 mb-1">' + escHtml(styleLabel) + ' <span class="text-gray-400 text-xs">' + (idx+1) + '/3</span></p>' +
        '<div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">' +
          '<p class="font-medium mb-1">Generation failed</p>' +
          '<p class="font-mono text-xs break-all">' + escHtml(r.error) + '</p>' +
        '</div>' +
      '</div>';
  } else {
    card.innerHTML =
      '<img src="' + escHtml(r.outputUrl) + '" class="w-full aspect-square object-cover" />' +
      '<div class="p-4">' +
        '<p class="font-semibold text-gray-800 mb-1">' + escHtml(styleLabel) + ' <span class="text-gray-400 text-xs">(' + (idx+1) + '/3)</span></p>' +
        '<div class="flex items-center gap-3 text-xs mb-3 flex-wrap">' +
          '<span class="text-gray-500 italic">' + escHtml(tierBadge) + '</span>' +
          (costBadge ? '<span class="font-medium text-gray-700">' + escHtml(costBadge) + '</span>' : '') +
          '<span class="text-gray-400">&#9200; ' + ((r.durationMs ?? 0) / 1000).toFixed(1) + 's</span>' +
        '</div>' +
        (r.prompt
          ? '<div class="mt-3 mb-3">' +
              '<div class="flex items-center justify-between mb-1">' +
                '<span class="text-xs text-gray-500 uppercase tracking-wide">Prompt</span>' +
                '<button onclick="copyPrompt(this)" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition">Copy</button>' +
              '</div>' +
              '<pre class="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-800 font-mono whitespace-pre-wrap max-h-52 overflow-y-auto">' + escHtml(r.prompt) + '</pre>' +
            '</div>'
          : '') +
        '<a href="' + escHtml(r.outputUrl) + '" download class="mt-3 block text-center text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg py-2 transition">Download</a>' +
      '</div>';
  }

  resultsGrid.className = 'grid grid-cols-1 sm:grid-cols-3 gap-5';
  resultsGrid.appendChild(card);
}

function resetUI() {
  selectedFiles = [];
  selectedStyles = [];
  renderThumbs();
  document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('style-count-label').textContent = '0/3 selected';
  document.getElementById('instructions').value = '';
  resultsArea.classList.add('hidden');
  costSummary.classList.add('hidden');
  clearError();
  updateStartBtn();
}

function showError(msg) {
  errorArea.textContent = msg;
  errorArea.classList.remove('hidden');
}
function clearError() {
  errorArea.classList.add('hidden');
  errorArea.textContent = '';
}
function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function copyPrompt(btn) {
  const pre = btn.closest('div').nextElementSibling;
  const text = pre ? pre.textContent : '';
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1500);
  }).catch(() => {
    btn.textContent = 'Failed';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

const GenerateImageBodySchema = z.object({
  styles: z.array(z.string()).min(3).max(3),
  instructions: z.string().optional(),
});

export async function adminTestRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 5,
    },
  });

  // ── GET /admin/test ──────────────────────────────────────────────────────
  app.get('/admin/test', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!checkAuth(req, reply)) return;

    const adminKey = (req.query as Record<string, string>)['key'] ?? '';
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(buildHtml(adminKey));
  });

  // ── POST /admin/test/generate ────────────────────────────────────────────
  app.post('/admin/test/generate', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!checkAuth(req, reply)) return;

    const parts = req.parts();

    let photoBuffers: Array<{ buffer: Buffer; mimetype: string; filename: string }> = [];
    let rawStyles: string[] = [];
    let instructions: string | undefined;
    let imageModel: string | undefined;

    for await (const part of parts) {
      if (part.type === 'file') {
        if (part.fieldname === 'photos') {
          if (!part.mimetype.startsWith('image/')) {
            await part.toBuffer();
            return reply.code(400).send({
              error: `File "${part.filename}" is not an image`,
              code: 'INVALID_FILE_TYPE',
            });
          }
          const buffer = await part.toBuffer();
          photoBuffers.push({ buffer, mimetype: part.mimetype, filename: part.filename ?? 'photo.jpg' });
          if (photoBuffers.length > 5) {
            return reply.code(400).send({ error: 'Maximum 5 photos allowed', code: 'TOO_MANY_PHOTOS' });
          }
        } else {
          await part.toBuffer();
        }
      } else {
        const value = part.value as string;
        if (part.fieldname === 'styles') rawStyles.push(value);
        if (part.fieldname === 'instructions') instructions = value.trim() || undefined;
        if (part.fieldname === 'imageModel') imageModel = value.trim() || undefined;
      }
    }

    // Allowlist — only OpenAI models are valid overrides (Gemini runs via auto chain)
    const OPENAI_MODELS = new Set(['gpt-image-2', 'gpt-image-1.5']);
    const useOpenAIDirect = imageModel ? OPENAI_MODELS.has(imageModel) : false;
    if (!useOpenAIDirect) imageModel = undefined;

    if (photoBuffers.length === 0) {
      return reply.code(400).send({ error: 'At least 1 photo required', code: 'NO_PHOTOS' });
    }

    const parsed = GenerateImageBodySchema.safeParse({ styles: rawStyles, instructions });
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Invalid input',
        code: 'VALIDATION_ERROR',
      });
    }

    const { styles } = parsed.data;
    const primary = photoBuffers[0]!;
    const referenceImageBuffers = photoBuffers.slice(1).map(p => p.buffer);

    // ---- Light analysis -------------------------------------------------------
    let analysis: LightAnalysis;
    try {
      analysis = await lightAnalyze([primary.buffer, ...referenceImageBuffers]);
    } catch (err) {
      app.log.warn({ err }, 'Admin test: lightAnalyze failed — using fallback');
      analysis = {
        productName: 'product',
        productCategory: 'other',
        hasBranding: true,
        physicalSize: 'medium' as const,
        dominantColors: ['neutral'],
        typicalSetting: 'tabletop',
        usable: true,
        itemCount: 1,
        items: ['product'],
        setDescription: null,
      };
    }

    // ---- Direct OpenAI path (A/B testing — bypasses Gemini entirely) ----------
    if (useOpenAIDirect && imageModel) {
      const generationTasks = styles.map(async (style) => {
        const styleStart = Date.now();
        const prompt = buildBetaPrompt(style, analysis.productName, instructions);

        try {
          // Preprocess primary
          let processedBuffer: Buffer;
          try {
            const pp = await preprocessImage(primary.buffer);
            processedBuffer = pp.buffer;
          } catch {
            processedBuffer = primary.buffer;
          }

          const gen = await openaiGenerateImage({
            inputImageBuffer: processedBuffer,
            prompt,
            referenceImageBuffers: referenceImageBuffers.length > 0 ? referenceImageBuffers : undefined,
            model: imageModel as OpenAIModelId,
          });

          // Upload to Supabase
          const outputPath = `admin-openai-${imageModel}-${Date.now()}.jpg`;
          const outputUrl = await uploadFile(Buckets.PROCESSED_IMAGES, outputPath, gen.imageBuffer, 'image/jpeg');

          return {
            style,
            outputUrl,
            tier: 3,
            model: imageModel,
            pipeline: `openai-${imageModel}`,
            costInr: imageModel === 'gpt-image-2' ? 21.00 : 10.00,
            durationMs: Date.now() - styleStart,
            prompt,
            error: null as string | null,
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          app.log.error({ err, style }, 'Admin test: OpenAI generation failed');
          return {
            style,
            outputUrl: null as string | null,
            tier: null,
            model: imageModel,
            pipeline: null,
            costInr: imageModel === 'gpt-image-2' ? 21.00 : 10.00,
            durationMs: Date.now() - styleStart,
            prompt,
            error: errMsg,
          };
        }
      });

      const results = await Promise.all(generationTasks);
      const totalCostInr = Number(results.reduce((sum, r) => sum + (r.costInr ?? 0), 0).toFixed(2));
      const marginInr = Number((99 - totalCostInr).toFixed(2));
      const marginPct = Number(((marginInr / 99) * 100).toFixed(1));

      return reply.send({
        analysis,
        results,
        costSummary: {
          totalCostInr,
          marginInr,
          marginPct,
          needsRefund: false,
        },
      });
    }

    // ---- Production chain path (Pro → NB2 → GPT-2) ---------------------------

    // Preprocess primary buffer
    let primaryBuffer: Buffer;
    try {
      const pp = await preprocessImage(primary.buffer);
      primaryBuffer = pp.buffer;
    } catch {
      primaryBuffer = primary.buffer;
    }

    // Upload primary to Supabase (needed for imageUrl in params)
    const storagePath = `admin-test-${Date.now()}.jpg`;
    let imageUrl: string;
    try {
      imageUrl = await uploadFile('raw-images', storagePath, primary.buffer, primary.mimetype);
    } catch (err) {
      app.log.error({ err }, 'Admin test: failed to upload primary photo');
      return reply.code(500).send({
        error: 'Failed to upload photo to storage',
        code: 'STORAGE_UPLOAD_FAILED',
      });
    }

    // Run production chain
    let productionResult;
    try {
      productionResult = await processOrderProduction({
        imageUrl,
        imageBuffers: [primaryBuffer, ...referenceImageBuffers],
        styles,
        userInstructions: instructions,
        voiceInstructions: instructions,
        productCategory: analysis.productCategory,
      });
    } catch (err) {
      app.log.error({ err }, 'Admin test: processOrderProduction failed');
      return reply.code(500).send({
        error: err instanceof Error ? err.message : 'Production pipeline failed',
        code: 'PIPELINE_FAILED',
      });
    }

    // Map StyleResult[] → API response shape (matches what renderImageResult expects)
    const results = productionResult.styleResults.map(r => ({
      style: r.style,
      outputUrl: r.outputUrl,
      tier: r.tier === 'refund' ? null : r.tier,
      model: r.model,
      pipeline: r.model,
      costInr: r.costInr,
      durationMs: r.durationMs,
      prompt: r.prompt,
      error: r.error,
    }));

    app.log.info(
      {
        styles,
        imageUrl,
        resultCount: results.length,
        successCount: results.filter(r => !r.error).length,
        totalCostInr: productionResult.totalCostInr,
        marginInr: productionResult.marginInr,
      },
      'Admin test: generation complete',
    );

    return reply.send({
      analysis,
      creativeBrief: productionResult.creativeBrief,
      parsedInstructions: productionResult.parsedInstructions,
      results,
      costSummary: {
        totalCostInr: productionResult.totalCostInr,
        marginInr: productionResult.marginInr,
        marginPct: productionResult.marginPct,
        needsRefund: productionResult.needsRefund,
      },
    });
  });
}
