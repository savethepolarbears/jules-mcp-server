/**
 * Type definitions for Google Jules v1alpha REST API
 * Based on: https://jules.google/docs/api/reference/
 */

export interface Source {
  /** Resource name format: sources/github/{owner}/{repo} */
  name: string;
  /** GitHub repository details */
  githubRepo?: {
    owner: string;
    repo: string;
    htmlUrl: string;
    defaultBranch: string;
  };
}

export interface ListSourcesResponse {
  sources: Source[];
  nextPageToken?: string;
}

export interface GitHubRepoContext {
  /** Branch to base changes on */
  startingBranch: string;
}

export interface SourceContext {
  /** Resource name of the source */
  source: string;
  githubRepoContext?: GitHubRepoContext;
}

export type AutomationMode =
  | 'AUTO_CREATE_PR'
  | 'AUTOMATION_MODE_UNSPECIFIED';

export type SessionState =
  | 'SESSION_STATE_UNSPECIFIED'
  | 'QUEUED'
  | 'PLANNING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export interface Session {
  /** Resource name format: sessions/{id} */
  name: string;
  /** Unique session identifier */
  id: string;
  /** Optional human-readable title */
  title?: string;
  /** Source context for the session */
  sourceContext: SourceContext;
  /** Natural language task prompt */
  prompt: string;
  /** Current session state */
  state?: SessionState;
  /** Automation configuration */
  automationMode?: AutomationMode;
  /** Whether plan approval is required */
  requirePlanApproval?: boolean;
  /** Timestamp when created */
  createTime?: string;
  /** Timestamp when last updated */
  updateTime?: string;
}

export interface CreateSessionRequest {
  prompt: string;
  sourceContext: SourceContext;
  title?: string;
  automationMode?: AutomationMode;
  requirePlanApproval?: boolean;
}

export interface ListSessionsResponse {
  sessions: Session[];
  nextPageToken?: string;
}

export type ActivityType =
  | 'PLAN_GENERATED'
  | 'PROGRESS_UPDATED'
  | 'SESSION_COMPLETED'
  | 'MESSAGE_SENT'
  | 'ACTIVITY_TYPE_UNSPECIFIED';

export interface ChangeSet {
  /** Array of file changes */
  changes?: Array<{
    path: string;
    diff?: string;
    oldContent?: string;
    newContent?: string;
  }>;
}

export interface Activity {
  /** Resource name format: sessions/{session_id}/activities/{activity_id} */
  name: string;
  /** Activity type */
  type: ActivityType;
  /** Timestamp when activity occurred */
  timestamp?: string;
  /** Activity-specific payload */
  planGenerated?: {
    plan: string;
    changeSet?: ChangeSet;
  };
  progressUpdated?: {
    message: string;
    percentage?: number;
  };
  sessionCompleted?: {
    success: boolean;
    message?: string;
    pullRequestUrl?: string;
  };
  messageSent?: {
    prompt: string;
    sender: 'USER' | 'AGENT';
  };
}

export interface ListActivitiesResponse {
  activities: Activity[];
  nextPageToken?: string;
}

export interface SendMessageRequest {
  prompt: string;
}

export interface ApprovePlanRequest {
  // Empty body per API spec
}
