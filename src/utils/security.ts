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
