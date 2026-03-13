/**
 * Security utilities for repository access control and validation.
 */

/**
 * Validates repository access based on an optional allowlist.
 * Ensures that operations are only performed on authorized repositories.
 */
export class RepositoryValidator {
  /**
   * The list of allowed repositories, or null if no allowlist is configured.
   */
  private static allowedRepos: string[] | null = null;

  /**
   * Initializes the validator with allowed repositories from the environment.
   * Reads the JULES_ALLOWED_REPOS environment variable to set up the allowlist.
   *
   * @returns {void} No return value.
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
   * Validates that a repository is allowed to be accessed.
   *
   * @param source - The source repository string in the format "sources/github/owner/repo"
   * @returns {void} No return value.
   * @throws {Error} if the source format is invalid or if the repository is not in the allowlist.
   */
  static validateRepository(source: string): void {
    // SECURE: Default to DENY if no allowlist is configured
    if (!this.allowedRepos || this.allowedRepos.length === 0) {
      throw new Error(
        "Security Error: No repositories are allowed. Set JULES_ALLOWED_REPOS environment variable."
      );
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
   * Checks if an allowlist is currently configured and enabled.
   *
   * @returns {boolean} True if an allowlist is configured, false otherwise.
   */
  static isAllowlistEnabled(): boolean {
    return this.allowedRepos !== null && this.allowedRepos.length > 0;
  }

  /**
   * Gets the list of currently allowed repositories.
   *
   * @returns {string[] | null} The list of allowed repositories, or null if no allowlist is configured.
   */
  static getAllowedRepositories(): string[] | null {
    return this.allowedRepos;
  }
}

/**
 * Utility for safe string truncation at word boundaries.
 * Truncates text to a specified maximum length, prioritizing breaking at spaces to avoid cutting words in half.
 *
 * @param text - The text to truncate.
 * @param maxLength - The maximum length of the string.
 * @returns {string} The truncated string, with "..." appended if it was truncated.
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
 * Retries an asynchronous operation with exponential backoff.
 *
 * @template T
 * @param fn - The async function to retry.
 * @param maxRetries - The maximum number of retries. Defaults to 3.
 * @param baseDelay - The base delay in milliseconds. Defaults to 1000.
 * @returns {Promise<T>} A promise that resolves with the result of the function.
 * @throws {Error} The last error encountered if all retries fail.
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

/**
 * A simple in-memory rate limiter to prevent abuse.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindowMs: number;

  constructor(maxRequests: number, timeWindowMs: number) {
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
  }

  /**
   * Checks if a request is allowed according to the rate limit.
   * @returns {boolean} True if allowed, false if rate limit exceeded.
   */
  isAllowed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.timeWindowMs);
    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
}

/**
 * Basic secret scanning utility to detect common API key patterns.
 * @param text The text to scan.
 * @returns {boolean} True if a potential secret is detected.
 */
export function containsSecret(text: string): boolean {
  if (!text) return false;
  // Look for common patterns like sk-..., AIza..., generic high-entropy strings might be too noisy
  const patterns = [
    /sk-[a-zA-Z0-9]{20,}/,    // OpenAI / general secret keys
    /AIza[0-9A-Za-z-_]{35}/, // Google API keys
    /(xox[p|b|o|a]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-z0-9]{32})/ // Slack tokens
  ];
  return patterns.some(pattern => pattern.test(text));
}
