import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RepositoryValidator, smartTruncate, retryWithBackoff } from '../utils/security.js';

describe('RepositoryValidator', () => {
  beforeEach(() => {
    // Reset private static property for isolated tests
    // @ts-expect-error - testing private property
    RepositoryValidator.allowedRepos = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('initialize', () => {
    it('should set allowedRepos to null if JULES_ALLOWED_REPOS is not set', () => {
      vi.stubEnv('JULES_ALLOWED_REPOS', '');
      RepositoryValidator.initialize();
      expect(RepositoryValidator.getAllowedRepositories()).toBeNull();
      expect(RepositoryValidator.isAllowlistEnabled()).toBe(false);
    });

    it('should parse comma-separated JULES_ALLOWED_REPOS', () => {
      vi.stubEnv('JULES_ALLOWED_REPOS', 'owner1/repo1, owner2/repo2 , owner3/repo3');
      RepositoryValidator.initialize();
      expect(RepositoryValidator.getAllowedRepositories()).toEqual([
        'owner1/repo1',
        'owner2/repo2',
        'owner3/repo3'
      ]);
      expect(RepositoryValidator.isAllowlistEnabled()).toBe(true);
    });

    it('should ignore empty entries in JULES_ALLOWED_REPOS', () => {
      vi.stubEnv('JULES_ALLOWED_REPOS', 'owner/repo,,owner/repo2, ');
      RepositoryValidator.initialize();
      expect(RepositoryValidator.getAllowedRepositories()).toEqual([
        'owner/repo',
        'owner/repo2'
      ]);
    });
  });

  describe('validateRepository', () => {
    it('should throw if allowlist is not enabled', () => {
      vi.stubEnv('JULES_ALLOWED_REPOS', '');
      RepositoryValidator.initialize();

      expect(() => {
        RepositoryValidator.validateRepository('sources/github/owner/repo');
      }).toThrow('Security Error: No repositories are allowed. Set JULES_ALLOWED_REPOS environment variable.');
    });

    it('should throw for invalid source format', () => {
      vi.stubEnv('JULES_ALLOWED_REPOS', 'owner/repo');
      RepositoryValidator.initialize();

      expect(() => {
        RepositoryValidator.validateRepository('invalid/format');
      }).toThrow('Invalid source format: invalid/format. Expected sources/github/owner/repo');
    });

    it('should not throw if repository is in allowlist', () => {
      vi.stubEnv('JULES_ALLOWED_REPOS', 'owner/repo');
      RepositoryValidator.initialize();

      expect(() => {
        RepositoryValidator.validateRepository('sources/github/owner/repo');
      }).not.toThrow();
    });

    it('should throw if repository is not in allowlist', () => {
      vi.stubEnv('JULES_ALLOWED_REPOS', 'owner/repo1');
      RepositoryValidator.initialize();

      expect(() => {
        RepositoryValidator.validateRepository('sources/github/owner/repo2');
      }).toThrow(/Repository "owner\/repo2" is not in the allowed list/);
    });

    it('should not reveal allowed list contents in error message', () => {
      process.env.JULES_ALLOWED_REPOS = 'secret-owner/private-repo,another-secret/repo';
      RepositoryValidator.initialize();
      try {
        expect(() =>
          RepositoryValidator.validateRepository('sources/github/attacker/probe')
        ).toThrow(
          expect.not.stringContaining('secret-owner')
        );
      } finally {
        delete process.env.JULES_ALLOWED_REPOS;
      }
    });
  });
});

describe('smartTruncate', () => {
  it('should not truncate string shorter than maxLength', () => {
    expect(smartTruncate('hello world', 20)).toBe('hello world');
  });

  it('should truncate and add ellipsis for long string', () => {
    const text = 'this is a very long string that should be truncated';
    const truncated = smartTruncate(text, 20);
    expect(truncated.length).toBeLessThanOrEqual(23); // 20 + 3 for ellipsis
    expect(truncated.endsWith('...')).toBe(true);
  });
});

describe('retryWithBackoff', () => {
  it('should return result if function succeeds on first try', async () => {
    const fn = async () => 'success';
    const result = await retryWithBackoff(fn, 3, 10);
    expect(result).toBe('success');
  });

  it('should return result if function succeeds after retries', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('failed');
      }
      return 'success';
    };

    const result = await retryWithBackoff(fn, 3, 10);
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw error if all retries fail', async () => {
    const fn = async () => {
      throw new Error('persistent failure');
    };

    await expect(retryWithBackoff(fn, 3, 10)).rejects.toThrow('persistent failure');
  });
});
