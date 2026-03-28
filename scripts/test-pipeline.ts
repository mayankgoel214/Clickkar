import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually
function loadEnv(envPath: string): void {
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf-8");
  } catch {
    console.error(`[env] Could not read ${envPath}`);
    return;
  }
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv(resolve("/Users/lending/WhatsAds/.env"));

import { fal } from "@fal-ai/client";

const IMAGE_URL =
  "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=800";
const SCENE_PROMPT =
  "Clean white studio background with soft diffused lighting and subtle shadow, professional product photography";

// Model IDs to try in order if one fails
const MODEL_IDS = [
  "fal-ai/bria/product-shot",
  "fal-ai/bria-product-shot",
  "fal-ai/product-photo",
];

async function runTest(modelId: string): Promise<void> {
  console.log(`\n[test] Model:       ${modelId}`);
  console.log(`[test] Image URL:   ${IMAGE_URL}`);
  console.log(`[test] Scene:       ${SCENE_PROMPT}\n`);

  const start = Date.now();

  const result = await fal.subscribe(modelId, {
    input: {
      image_url: IMAGE_URL,
      scene_description: SCENE_PROMPT,
    },
    logs: true,
    onQueueUpdate(update) {
      if (update.status === "IN_QUEUE") {
        console.log(`[queue] Position: ${update.queue_position ?? "unknown"}`);
      } else if (update.status === "IN_PROGRESS") {
        if (update.logs?.length) {
          for (const log of update.logs) {
            console.log(`[progress] ${log.message}`);
          }
        } else {
          console.log("[progress] Processing...");
        }
      }
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\n[result] Completed in ${elapsed}s`);
  console.log(`[result] Raw output:`, JSON.stringify(result.data, null, 2));

  // Extract image URLs from common output shapes
  const data = result.data as Record<string, unknown>;
  const imageUrl =
    (data?.images as Array<{ url: string }>)?.[0]?.url ??
    (data?.image as { url: string })?.url ??
    (data?.output as string) ??
    null;

  if (imageUrl) {
    console.log(`\n[result] Output image URL:\n  ${imageUrl}`);
  } else {
    console.log(
      "[result] Could not extract image URL from output — see raw output above."
    );
  }
}

async function main(): Promise<void> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error("[error] FAL_KEY not found in environment");
    process.exit(1);
  }

  fal.config({ credentials: falKey });
  console.log("[init] fal.ai client configured");

  for (const modelId of MODEL_IDS) {
    try {
      await runTest(modelId);
      return; // success — stop trying
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isNotFound =
        message.includes("404") ||
        message.includes("not found") ||
        message.includes("does not exist") ||
        message.toLowerCase().includes("invalid") ||
        message.toLowerCase().includes("unknown model");

      if (isNotFound) {
        console.warn(`[warn] Model "${modelId}" not found, trying next...\n`);
        continue;
      }

      // Non-404 error — report and stop
      console.error(`[error] Request failed for model "${modelId}":`, message);
      process.exit(1);
    }
  }

  console.error(
    "[error] All model IDs failed. Check https://fal.ai/models for the correct Bria product shot model ID."
  );
  process.exit(1);
}

main();
