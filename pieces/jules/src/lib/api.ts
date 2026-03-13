/**
 * Lightweight HTTP client for Jules API calls within Activepieces Piece actions.
 * Mirrors the patterns from the MCP server's JulesClient but uses
 * the Activepieces runtime fetch (no external dependencies).
 */

import { httpClient, HttpMethod, type HttpRequest } from '@activepieces/pieces-common';
import type { JulesAuthValue } from './auth';

/**
 * Base URL for the Jules v1alpha API.
 */
const BASE_URL = 'https://jules.googleapis.com/v1alpha';

/**
 * Internal helper to make an authenticated request to the Jules API.
 * 
 * @template T - The expected JSON response type.
 * @param auth - Authentication value containing the API key.
 * @param endpoint - API endpoint path (including leading slash).
 * @param method - HTTP method for the request.
 * @param body - Optional JSON body for the request.
 * @returns {Promise<T>} A promise resolving to the parsed JSON response body.
 */
async function request<T>(
  auth: JulesAuthValue,
  endpoint: string,
  method: HttpMethod = HttpMethod.GET,
  body?: any
): Promise<T> {
  const requestConfig: HttpRequest = {
    method,
    url: `${BASE_URL}${endpoint}`,
    headers: {
      'X-Goog-Api-Key': auth.apiKey,
    },
    body,
  };

  const response = await httpClient.sendRequest<T>(requestConfig);
  return response.body;
}

/**
 * Configuration for a repository source.
 */
export interface SourceContext {
  /** The resource name of the source (e.g., "sources/github/owner/repo") */
  source: string;
  /** Optional GitHub-specific context */
  githubRepoContext?: { 
    /** The branch name to target */
    startingBranch: string 
  };
}

/**
 * Automation modes for a session.
 */
export type AutomationMode = 'AUTO_CREATE_PR' | 'AUTOMATION_MODE_UNSPECIFIED';

/**
 * Possible states for a Jules session.
 */
export type SessionState =
  | 'SESSION_STATE_UNSPECIFIED'
  | 'QUEUED'
  | 'PLANNING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'AWAITING_USER_FEEDBACK'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

/**
 * Represents a Jules coding session.
 */
export interface Session {
  /** Resource name format: sessions/{id} */
  name: string;
  /** Unique session ID */
  id: string;
  /** Optional human-readable title */
  title?: string;
  /** Public monitor URL */
  url?: string;
  /** Source repository context */
  sourceContext?: SourceContext;
  /** The natural language prompt */
  prompt: string;
  /** Current state of the session */
  state?: SessionState;
  /** Automation configuration */
  automationMode?: AutomationMode;
  /** Whether plan approval is required before execution */
  requirePlanApproval?: boolean;
  /** ISO timestamp when created */
  createTime?: string;
  /** ISO timestamp when last updated */
  updateTime?: string;
  /** Outputs from the session (e.g., Pull Requests) */
  outputs?: Array<{
    /** Generated pull request metadata */
    pullRequest?: { 
      /** URL of the pull request */
      url: string; 
      /** Pull request title */
      title?: string; 
      /** Pull request description */
      description?: string 
    };
  }>;
}

/**
 * Represents an entry in the session activity log.
 */
export interface Activity {
  /** Resource name of the activity */
  name: string;
  /** The type of activity */
  type: string;
  /** ISO timestamp when the activity occurred */
  timestamp?: string;
  /** Payload for PLAN_GENERATED type */
  planGenerated?: { plan: string };
  /** Payload for PROGRESS_UPDATED type */
  progressUpdated?: { message: string; percentage?: number };
  /** Payload for SESSION_COMPLETED type */
  sessionCompleted?: {
    success: boolean;
    message?: string;
    pullRequestUrl?: string;
  };
  /** Payload for MESSAGE_SENT type */
  messageSent?: { prompt: string; sender: string };
  /** Payload for AGENT_MESSAGED type */
  agentMessaged?: { message: string };
}

/**
 * Creates a new Jules coding session.
 * 
 * @param auth - Authentication value.
 * @param body - Session creation parameters (prompt, source, etc).
 * @returns {Promise<Session>} The created session object.
 */
export async function createSession(
  auth: JulesAuthValue,
  body: {
    prompt: string;
    sourceContext?: SourceContext;
    title?: string;
    automationMode?: AutomationMode;
    requirePlanApproval?: boolean;
  }
): Promise<Session> {
  return request<Session>(auth, '/sessions', HttpMethod.POST, body);
}

/**
 * Retrieves the status and details of a specific session.
 * 
 * @param auth - Authentication value.
 * @param sessionId - Unique session identifier.
 * @returns {Promise<Session>} The session object.
 */
export async function getSession(
  auth: JulesAuthValue,
  sessionId: string
): Promise<Session> {
  return request<Session>(auth, `/sessions/${sessionId}`);
}

/**
 * Lists sessions with optional pagination.
 * 
 * @param auth - Authentication value.
 * @param pageSize - Number of sessions to return.
 * @param pageToken - Token for the next page of results.
 * @returns {Promise<{ sessions: Session[]; nextPageToken?: string }>} List of sessions and pagination token.
 */
export async function listSessions(
  auth: JulesAuthValue,
  pageSize = 20,
  pageToken?: string
): Promise<{ sessions: Session[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) params.set('pageToken', pageToken);
  return request(auth, `/sessions?${params.toString()}`);
}

/**
 * Approves the generated plan for a session in AWAITING_PLAN_APPROVAL state.
 * 
 * @param auth - Authentication value.
 * @param sessionId - Unique session identifier.
 * @returns {Promise<Session>} The updated session object.
 */
export async function approvePlan(
  auth: JulesAuthValue,
  sessionId: string
): Promise<Session> {
  return request<Session>(auth, `/sessions/${sessionId}:approvePlan`, HttpMethod.POST, {});
}

/**
 * Sends a message/feedback to an active Jules session.
 * 
 * @param auth - Authentication value.
 * @param sessionId - Unique session identifier.
 * @param prompt - The message content.
 * @returns {Promise<Session>} The updated session object.
 */
export async function sendMessage(
  auth: JulesAuthValue,
  sessionId: string,
  prompt: string
): Promise<Session> {
  return request<Session>(auth, `/sessions/${sessionId}:sendMessage`, HttpMethod.POST, { prompt });
}

/**
 * Retrieves the activity log for a specific session.
 * 
 * @param auth - Authentication value.
 * @param sessionId - Unique session identifier.
 * @param pageSize - Maximum number of activities to return.
 * @returns {Promise<{ activities: Activity[]; nextPageToken?: string }>} List of activities.
 */
export async function listActivities(
  auth: JulesAuthValue,
  sessionId: string,
  pageSize = 50
): Promise<{ activities: Activity[]; nextPageToken?: string }> {
  return request(
    auth,
    `/sessions/${sessionId}/activities?pageSize=${pageSize}`
  );
}
