import { describe, expect, it } from 'vitest';
import { maskKey } from './mask.js';

describe('maskKey', () => {
  it('masks a typical API key to first3...last3', () => {
    expect(maskKey('AIzaSyA12345678xyz')).toBe('AIz...xyz');
  });

  it('returns "***" for short keys', () => {
    expect(maskKey('short12')).toBe('***');
    expect(maskKey('12345678')).toBe('***'); // boundary: 8 chars
  });

  it('returns "(empty)" for empty and whitespace', () => {
    expect(maskKey('')).toBe('(empty)');
    expect(maskKey('   ')).toBe('(empty)');
  });

  it('trims whitespace before masking', () => {
    expect(maskKey('  AIzaSyA12345678xyz  ')).toBe('AIz...xyz');
  });
});
