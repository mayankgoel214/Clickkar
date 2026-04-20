import { describe, expect, it } from 'vitest';
import { readKeysFromEnv } from './env.js';

describe('readKeysFromEnv', () => {
  it('prefers plural (GOOGLE_AI_API_KEYS) when present', () => {
    const env = { GOOGLE_AI_API_KEYS: 'a,b,c', GOOGLE_AI_API_KEY: 'single' };
    expect(readKeysFromEnv('gemini', env)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to singular (GOOGLE_AI_API_KEY)', () => {
    const env = { GOOGLE_AI_API_KEY: 'single-key' };
    expect(readKeysFromEnv('gemini', env)).toEqual(['single-key']);
  });

  it('falls back to alt singular (GOOGLE_GENAI_API_KEY)', () => {
    const env = { GOOGLE_GENAI_API_KEY: 'alt-key' };
    expect(readKeysFromEnv('gemini', env)).toEqual(['alt-key']);
  });

  it('strips whitespace in comma-split', () => {
    const env = { GOOGLE_AI_API_KEYS: '  a , b ,c  ' };
    expect(readKeysFromEnv('gemini', env)).toEqual(['a', 'b', 'c']);
  });

  it('drops empty entries from comma-split', () => {
    const env = { GOOGLE_AI_API_KEYS: 'a,,b,' };
    expect(readKeysFromEnv('gemini', env)).toEqual(['a', 'b']);
  });

  it('returns empty array when no keys configured', () => {
    expect(readKeysFromEnv('gemini', {})).toEqual([]);
  });

  it('handles FAL_KEY and FAL_API_KEY alts', () => {
    expect(readKeysFromEnv('fal', { FAL_API_KEY: 'fal-alt' })).toEqual(['fal-alt']);
    expect(readKeysFromEnv('fal', { FAL_KEYS: 'f1,f2' })).toEqual(['f1', 'f2']);
  });

  it('handles groq and sarvam with plural + singular', () => {
    expect(readKeysFromEnv('groq', { GROQ_API_KEYS: 'g1,g2' })).toEqual(['g1', 'g2']);
    expect(readKeysFromEnv('groq', { GROQ_API_KEY: 'g0' })).toEqual(['g0']);
    expect(readKeysFromEnv('sarvam', { SARVAM_API_KEY: 's0' })).toEqual(['s0']);
  });

  it('treats an all-whitespace plural as unset', () => {
    const env = { GOOGLE_AI_API_KEYS: '   ', GOOGLE_AI_API_KEY: 'single' };
    expect(readKeysFromEnv('gemini', env)).toEqual(['single']);
  });
});
