import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JulesClient, JulesAPIError } from '../api/jules-client.js';

describe('JulesClient Resiliency', () => {
  let client: JulesClient;

  beforeEach(() => {
    vi.stubEnv('JULES_API_KEY', 'test-key');
    // We override timeout and retries via environment variables just for testing
    vi.stubEnv('JULES_API_TIMEOUT_MS', '500');
    vi.stubEnv('JULES_API_MAX_RETRIES', '2');
    client = new JulesClient();

    // Mock fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should retry on transient 5xx errors and eventually succeed', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

    // Fail first time with 500, succeed second time
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue('Server is busy'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ sources: [] }),
      });

    const response = await client.listSources();
    expect(response).toEqual({ sources: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should retry on AbortError (timeout) and eventually succeed', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

    // Fail first time with timeout, succeed second time
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    mockFetch
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ sources: [] }),
      });

    const response = await client.listSources();
    expect(response).toEqual({ sources: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw an error if max retries are exceeded', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: vi.fn().mockResolvedValue('Offline'),
    });

    await expect(client.listSources()).rejects.toThrow(JulesAPIError);
    // 1 initial attempt + 2 retries (from env var) = 3 total attempts
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should not retry on 4xx errors', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: vi.fn().mockResolvedValue('Invalid prompt'),
    });

    await expect(client.listSources()).rejects.toThrow(JulesAPIError);
    // Should fail immediately without retrying
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
