/**
 * Env parsing. Accepts:
 *   FOO_KEYS=key1,key2,key3   (comma-separated plural — preferred)
 *   FOO_KEY=key1              (single, backwards compatible)
 *
 * Strips whitespace, drops empties, dedupes, preserves order.
 */

import type { Provider } from './types.js';

interface ProviderEnvSpec {
  /** Plural env var, comma-separated. */
  plural: string;
  /** Single-key env var, backwards compatible. */
  singular: string;
  /** Alternative singulars checked if the main one is missing. */
  altSingulars?: string[];
}

const PROVIDER_ENV: Record<Provider, ProviderEnvSpec> = {
  gemini: {
    plural: 'GOOGLE_AI_API_KEYS',
    singular: 'GOOGLE_AI_API_KEY',
    altSingulars: ['GOOGLE_GENAI_API_KEY'],
  },
  fal: {
    plural: 'FAL_KEYS',
    singular: 'FAL_KEY',
    altSingulars: ['FAL_API_KEY'],
  },
  groq: {
    plural: 'GROQ_API_KEYS',
    singular: 'GROQ_API_KEY',
  },
  sarvam: {
    plural: 'SARVAM_API_KEYS',
    singular: 'SARVAM_API_KEY',
  },
};

export function readKeysFromEnv(provider: Provider, env: NodeJS.ProcessEnv = process.env): string[] {
  const spec = PROVIDER_ENV[provider];
  const plural = env[spec.plural];
  if (plural && plural.trim()) {
    return plural
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }
  const single = env[spec.singular];
  if (single && single.trim()) return [single.trim()];
  for (const alt of spec.altSingulars ?? []) {
    const v = env[alt];
    if (v && v.trim()) return [v.trim()];
  }
  return [];
}

export function providerEnvSpec(provider: Provider): ProviderEnvSpec {
  return PROVIDER_ENV[provider];
}
