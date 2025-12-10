/**
 * Security utilities for repository access control and validation
 */

export class RepositoryValidator {
  private static allowedRepos: string[] | null = null;

  /**
   * Initialize the validator with allowed repositories from environment
   */
  static initialize(): void {
    const allowList = process.env.JULES_ALLOWED_REPOS;
    if (allowList) {
      this.allowedRepos = allowList
        .split(',')
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
    }
  }

  /**
   * Validates that a repository is allowed to be accessed
   * @throws Error if repository is not in allowlist
   */
  static validateRepository(source: string): void {
    // If no allowlist configured, allow all
    if (!this.allowedRepos) {
      return;
    }

    // Extract owner/repo from source format: sources/github/owner/repo
    const match = source.match(/^sources\/github\/(.+)$/);
    if (!match) {
      throw new Error(
        `Invalid source format: ${source}. Expected sources/github/owner/repo`
      );
    }

    const repoPath = match[1];

    if (!this.allowedRepos.includes(repoPath)) {
      throw new Error(
        `Repository "${repoPath}" is not in the allowed repositories list. ` +
          `Allowed: ${this.allowedRepos.join(', ')}. ` +
          `Set JULES_ALLOWED_REPOS environment variable to modify this list.`
      );
    }
  }

  /**
   * Check if allowlist is configured
   */
  static isAllowlistEnabled(): boolean {
    return this.allowedRepos !== null && this.allowedRepos.length > 0;
  }

  /**
   * Get the list of allowed repositories
   */
  static getAllowedRepositories(): string[] | null {
    return this.allowedRepos;
  }
}

/**
 * Utility for safe string truncation at word boundaries
 */
export function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to break at a word boundary
  let truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    // If we can break at a word within 80% of max length, do it
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated.trim() + '...';
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
