/**
 * Jules API Client - Abstraction layer for Google Jules REST API
 * Handles authentication, rate limiting, and type-safe API calls
 */

import type {
  Source,
  ListSourcesResponse,
  Session,
  CreateSessionRequest,
  ListSessionsResponse,
  Activity,
  ListActivitiesResponse,
  SendMessageRequest,
} from '../types/jules-api.js';

/**
 * Custom error class for Jules API interactions.
 */
export class JulesAPIError extends Error {
  /**
   * Creates an instance of JulesAPIError.
   * @param message - The error message.
   * @param statusCode - The HTTP status code returned by the API (optional).
   * @param response - The response body returned by the API (optional).
   */
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'JulesAPIError';
  }
}

/**
 * Client for interacting with the Google Jules REST API.
 */
export class JulesClient {
  private readonly baseURL = 'https://jules.googleapis.com/v1alpha';
  private readonly apiKey: string;

  /**
   * Creates an instance of JulesClient.
   * @param apiKey - The API key for authentication. If not provided, it falls back to the JULES_API_KEY environment variable.
   * @throws Error if no API key is provided or found in environment variables.
   */
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.JULES_API_KEY || '';
    if (!this.apiKey) {
      throw new Error(
        'JULES_API_KEY environment variable is required. ' +
          'Generate a key at https://jules.google/settings'
      );
    }
  }

  /**
   * Generic HTTP request handler with authentication and error handling.
   * @param endpoint - The API endpoint to call (relative to the base URL).
   * @param options - The fetch options (method, headers, body, etc.).
   * @returns A promise that resolves with the parsed JSON response.
   * @throws JulesAPIError if the API returns an error or a network error occurs.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'X-Goog-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new JulesAPIError(
          `Jules API error: ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof JulesAPIError) {
        throw error;
      }
      throw new JulesAPIError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * List all connected GitHub repositories.
   * GET /v1alpha/sources
   * @param pageSize - The maximum number of sources to return (default: 100).
   * @returns A promise that resolves with the list of sources.
   */
  async listSources(pageSize = 100): Promise<ListSourcesResponse> {
    return this.request<ListSourcesResponse>(
      `/sources?pageSize=${pageSize}`
    );
  }

  /**
   * Get details for a specific source.
   * GET /v1alpha/sources/{name}
   * @param sourceName - The resource name of the source to retrieve.
   * @returns A promise that resolves with the source details.
   */
  async getSource(sourceName: string): Promise<Source> {
    return this.request<Source>(`/${sourceName}`);
  }

  /**
   * Create a new coding session.
   * POST /v1alpha/sessions
   * @param request - The request body for creating a session.
   * @returns A promise that resolves with the created session.
   */
  async createSession(request: CreateSessionRequest): Promise<Session> {
    return this.request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * List all sessions with pagination.
   * GET /v1alpha/sessions
   * @param pageSize - The maximum number of sessions to return (default: 20).
   * @returns A promise that resolves with the list of sessions.
   */
  async listSessions(pageSize = 20): Promise<ListSessionsResponse> {
    return this.request<ListSessionsResponse>(
      `/sessions?pageSize=${pageSize}`
    );
  }

  /**
   * Get details for a specific session.
   * GET /v1alpha/sessions/{id}
   * @param sessionId - The ID of the session to retrieve.
   * @returns A promise that resolves with the session details.
   */
  async getSession(sessionId: string): Promise<Session> {
    return this.request<Session>(`/sessions/${sessionId}`);
  }

  /**
   * Approve the plan for a session in AWAITING_PLAN_APPROVAL state.
   * POST /v1alpha/sessions/{id}:approvePlan
   * @param sessionId - The ID of the session to approve the plan for.
   * @returns A promise that resolves with the updated session.
   */
  async approvePlan(sessionId: string): Promise<Session> {
    return this.request<Session>(`/sessions/${sessionId}:approvePlan`, {
      method: 'POST',
      body: '{}',
    });
  }

  /**
   * Send feedback message to an active session.
   * POST /v1alpha/sessions/{id}:sendMessage
   * @param sessionId - The ID of the session to send the message to.
   * @param request - The request body containing the message prompt.
   * @returns A promise that resolves with the updated session.
   */
  async sendMessage(
    sessionId: string,
    request: SendMessageRequest
  ): Promise<Session> {
    return this.request<Session>(`/sessions/${sessionId}:sendMessage`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * List activities for a session (the event stream/log).
   * GET /v1alpha/sessions/{id}/activities
   * @param sessionId - The ID of the session to list activities for.
   * @param pageSize - The maximum number of activities to return (default: 50).
   * @returns A promise that resolves with the list of activities.
   */
  async listActivities(
    sessionId: string,
    pageSize = 50
  ): Promise<ListActivitiesResponse> {
    return this.request<ListActivitiesResponse>(
      `/sessions/${sessionId}/activities?pageSize=${pageSize}`
    );
  }
}
