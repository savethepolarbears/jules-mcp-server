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

export class JulesAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'JulesAPIError';
  }
}

export class JulesClient {
  private readonly baseURL = 'https://jules.googleapis.com/v1alpha';
  private readonly apiKey: string;

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
   * Generic HTTP request handler with authentication and error handling
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
   * List all connected GitHub repositories
   * GET /v1alpha/sources
   */
  async listSources(pageSize = 100): Promise<ListSourcesResponse> {
    return this.request<ListSourcesResponse>(
      `/sources?pageSize=${pageSize}`
    );
  }

  /**
   * Get details for a specific source
   * GET /v1alpha/sources/{name}
   */
  async getSource(sourceName: string): Promise<Source> {
    return this.request<Source>(`/${sourceName}`);
  }

  /**
   * Create a new coding session
   * POST /v1alpha/sessions
   */
  async createSession(request: CreateSessionRequest): Promise<Session> {
    return this.request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * List all sessions with pagination
   * GET /v1alpha/sessions
   */
  async listSessions(pageSize = 20): Promise<ListSessionsResponse> {
    return this.request<ListSessionsResponse>(
      `/sessions?pageSize=${pageSize}`
    );
  }

  /**
   * Get details for a specific session
   * GET /v1alpha/sessions/{id}
   */
  async getSession(sessionId: string): Promise<Session> {
    return this.request<Session>(`/sessions/${sessionId}`);
  }

  /**
   * Approve the plan for a session in AWAITING_PLAN_APPROVAL state
   * POST /v1alpha/sessions/{id}:approvePlan
   */
  async approvePlan(sessionId: string): Promise<Session> {
    return this.request<Session>(`/sessions/${sessionId}:approvePlan`, {
      method: 'POST',
      body: '{}',
    });
  }

  /**
   * Send feedback message to an active session
   * POST /v1alpha/sessions/{id}:sendMessage
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
   * List activities for a session (the event stream/log)
   * GET /v1alpha/sessions/{id}/activities
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
