import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

export type MusicCategory = 'upbeat' | 'elegant' | 'trendy' | 'calm' | 'modern' | 'festive' | 'neutral';

const CATEGORY_MAP: Record<string, MusicCategory> = {
  food: 'upbeat',
  jewellery: 'elegant',
  garment: 'trendy',
  skincare: 'calm',
  electronics: 'modern',
  candle: 'calm',
  bag: 'trendy',
  home_goods: 'neutral',
  handicraft: 'neutral',
  other: 'neutral',
};

export function getMusicCategory(productCategory: string): MusicCategory {
  return CATEGORY_MAP[productCategory] ?? 'neutral';
}

/**
 * Generate a silent audio track of the specified duration.
 * This is a placeholder until real royalty-free music is added.
 */
export async function generateSilentTrack(durationSec: number): Promise<Buffer> {
  const tmpPath = join(tmpdir(), `silent_${Date.now()}.aac`);
  try {
    execSync(
      `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t ${durationSec} -c:a aac -b:a 64k "${tmpPath}" -y`,
      { stdio: 'pipe' },
    );
    const buf = readFileSync(tmpPath);
    return buf;
  } finally {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  }
}
