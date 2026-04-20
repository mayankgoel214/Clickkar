import { describe, expect, it } from 'vitest';
import { classifyFailure, extractErrorCode } from './classify.js';

describe('classifyFailure', () => {
  it('maps 429 → rate_limited', () => {
    expect(classifyFailure({ errorCode: 429 })).toBe('rate_limited');
  });

  it('maps 401/403 → auth_error', () => {
    expect(classifyFailure({ errorCode: 401 })).toBe('auth_error');
    expect(classifyFailure({ errorCode: 403 })).toBe('auth_error');
  });

  it('maps 5xx → server_error', () => {
    expect(classifyFailure({ errorCode: 500 })).toBe('server_error');
    expect(classifyFailure({ errorCode: 503 })).toBe('server_error');
    expect(classifyFailure({ errorCode: 599 })).toBe('server_error');
  });

  it('maps string node codes starting with E → network', () => {
    expect(classifyFailure({ errorCode: 'ECONNRESET' })).toBe('network');
    expect(classifyFailure({ errorCode: 'ETIMEDOUT' })).toBe('network');
  });

  it('returns unknown when errorCode is missing', () => {
    expect(classifyFailure({})).toBe('unknown');
  });

  it('honors explicit reason override', () => {
    expect(classifyFailure({ reason: 'auth_error', errorCode: 500 })).toBe('auth_error');
  });
});

describe('extractErrorCode', () => {
  it('reads .status from fetch-like errors', () => {
    expect(extractErrorCode({ status: 429 })).toBe(429);
  });

  it('reads .statusCode', () => {
    expect(extractErrorCode({ statusCode: 403 })).toBe(403);
  });

  it('reads .code (string — node net errors)', () => {
    expect(extractErrorCode({ code: 'ECONNRESET' })).toBe('ECONNRESET');
  });

  it('reads nested response.status', () => {
    expect(extractErrorCode({ response: { status: 429 } })).toBe(429);
  });

  it('reads @google/genai-style error.error.code', () => {
    expect(extractErrorCode({ error: { code: 429 } })).toBe(429);
  });

  it('returns undefined for plain errors', () => {
    expect(extractErrorCode(new Error('boom'))).toBeUndefined();
    expect(extractErrorCode(null)).toBeUndefined();
    expect(extractErrorCode('string')).toBeUndefined();
  });
});
