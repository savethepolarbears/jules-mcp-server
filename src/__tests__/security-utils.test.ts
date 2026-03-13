import { describe, it, expect, vi } from 'vitest';
import { containsSecret, RateLimiter } from '../utils/security.js';

// Tests for containsSecret() — covers all pattern branches
describe('containsSecret', () => {
  it('returns false for empty string', () => {
    expect(containsSecret('')).toBe(false);
  });

  it('returns false for clean text', () => {
    expect(containsSecret('This is a normal coding task prompt')).toBe(false);
  });

  it('detects OpenAI key pattern (sk-)', () => {
    expect(containsSecret('Use key sk-abcdefghijklmnopqrstu')).toBe(true);
  });

  it('detects Google API key pattern (AIza)', () => {
    expect(containsSecret('key: AIzaSyA1234567890bCdEfGhIjKlMnOpQr12345')).toBe(true);
  });

  it('detects GitHub PAT (ghp_)', () => {
    expect(containsSecret('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh1234')).toBe(true);
  });

  it('detects GitHub server token (ghs_)', () => {
    expect(containsSecret('ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh1234')).toBe(true);
  });

  it('detects AWS access key (AKIA)', () => {
    expect(containsSecret('AWS key: AKIA1234567890ABCDEF')).toBe(true);
  });

  it('detects Anthropic key (sk-ant-)', () => {
    const key = 'sk-ant-' + 'a'.repeat(93);
    expect(containsSecret(`use key: ${key}`)).toBe(true);
  });

  it('detects HuggingFace token (hf_)', () => {
    const token = 'hf_' + 'a'.repeat(37);
    expect(containsSecret(`token ${token}`)).toBe(true);
  });

  it('returns false for null/undefined via falsy check', () => {
    // Cast to exercise the early return for falsy input
    expect(containsSecret(null as unknown as string)).toBe(false);
  });
});

// Tests for RateLimiter
describe('RateLimiter', () => {
  it('allows requests up to the limit', () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.isAllowed()).toBe(true);
    expect(limiter.isAllowed()).toBe(true);
    expect(limiter.isAllowed()).toBe(true);
  });

  it('blocks after limit is reached', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.isAllowed();
    limiter.isAllowed();
    expect(limiter.isAllowed()).toBe(false);
  });

  it('resets after time window expires', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(1, 1000);

    expect(limiter.isAllowed()).toBe(true);
    expect(limiter.isAllowed()).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(limiter.isAllowed()).toBe(true);
    vi.useRealTimers();
  });
});
