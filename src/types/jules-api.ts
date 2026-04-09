/**
 * Type definitions for Google Jules v1alpha REST API
 * Based on: https://jules.google/docs/api/reference/
 */

/**
 * Represents a source repository for Jules.
 */
export interface GitHubBranch {
  /** Branch name as displayed by Jules. */
  displayName: string;
}

/**
 * GitHub repository metadata returned by Jules.
 */
export interface GitHubRepo {
  /** The owner of the GitHub repository. */
  owner: string;
  /** The name of the GitHub repository. */
  repo: string;
  /** Optional repository URL when exposed by the API. */
  htmlUrl?: string;
  /** Whether the repository is private. */
  isPrivate?: boolean;
  /** The default branch for the repository. */
  defaultBranch?: GitHubBranch | string;
  /** Active branches that Jules can target. */
  branches?: GitHubBranch[];
}

export interface Source {
  /** Resource name format: sources/github/{owner}/{repo} */
  name: string;
  /** Unique source identifier. */
  id?: string;
  /** GitHub repository details */
  githubRepo?: GitHubRepo;
}

/**
 * Response object for listing sources.
 */
export interface ListSourcesResponse {
  /** A list of source repositories. */
  sources: Source[];
  /** A token for the next page of results. */
  nextPageToken?: string;
}

/**
 * Context for a GitHub repository.
 */
interface GitHubRepoContext {
  /** Branch to base changes on */
  startingBranch: string;
}

/**
 * Context for a source repository.
 */
export interface SourceContext {
  /** Resource name of the source */
  source: string;
  /** GitHub repository context details. */
  githubRepoContext?: GitHubRepoContext;
  /** Whether repository environment variables are exposed in the session. */
  environmentVariablesEnabled?: boolean;
}

/**
 * Automation mode for a session.
 * - `AUTO_CREATE_PR`: Automatically create a pull request.
 * - `AUTOMATION_MODE_UNSPECIFIED`: Unspecified automation mode.
 */
export type AutomationMode =
  | 'AUTO_CREATE_PR'
  | 'AUTOMATION_MODE_UNSPECIFIED';

/**
 * State of a session.
 * - `SESSION_STATE_UNSPECIFIED`: Unspecified state.
 * - `QUEUED`: Session is queued.
 * - `PLANNING`: Session is planning the changes.
 * - `AWAITING_PLAN_APPROVAL`: Session is waiting for plan approval.
 * - `IN_PROGRESS`: Session is in progress.
 * - `COMPLETED`: Session has completed.
 * - `FAILED`: Session has failed.
 * - `CANCELED`: Session was canceled.
 */
export type SessionState =
  | 'SESSION_STATE_UNSPECIFIED'
  | 'STATE_UNSPECIFIED'
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
 * Represents a Jules session.
 */
export interface Session {
  /** Resource name format: sessions/{id} */
  name: string;
  /** Unique session identifier */
  id: string;
  /** Optional human-readable title */
  title?: string;
  /** Optional monitor URL returned by the Jules API */
  url?: string;
  /** Source context for the session */
  sourceContext?: SourceContext;
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
  /** Session outputs such as generated pull requests */
  outputs?: {
    /** Pull request created by the session, if available */
    pullRequest?: {
      /** Pull request URL */
      url: string;
      /** Optional pull request title */
      title?: string;
      /** Optional pull request description */
      description?: string;
    };
  }[];
}

/**
 * Request object for creating a new session.
 */
export interface CreateSessionRequest {
  /** Natural language task prompt */
  prompt: string;
  /** Source context for the session */
  sourceContext?: SourceContext;
  /** Optional human-readable title */
  title?: string;
  /** Automation configuration */
  automationMode?: AutomationMode;
  /** Whether plan approval is required */
  requirePlanApproval?: boolean;
}

/**
 * Response object for listing sessions.
 */
export interface ListSessionsResponse {
  /** A list of sessions. */
  sessions: Session[];
  /** A token for the next page of results. */
  nextPageToken?: string;
}

/**
 * Type of activity in a session.
 * - `PLAN_GENERATED`: A plan was generated.
 * - `PROGRESS_UPDATED`: Progress was updated.
 * - `SESSION_COMPLETED`: Session was completed.
 * - `MESSAGE_SENT`: A message was sent.
 * - `ACTIVITY_TYPE_UNSPECIFIED`: Unspecified activity type.
 */
export type ActivityType =
  | 'PLAN_GENERATED'
  | 'PROGRESS_UPDATED'
  | 'SESSION_COMPLETED'
  | 'SESSION_FAILED'
  | 'MESSAGE_SENT'
  | 'USER_MESSAGED'
  | 'AGENT_MESSAGED'
  | 'PLAN_APPROVED'
  | 'ACTIVITY_TYPE_UNSPECIFIED';

/**
 * Represents a Git patch produced by Jules.
 */
export interface GitPatch {
  /** The commit the patch is based on. */
  baseCommitId?: string;
  /** Unified diff patch content. */
  unidiffPatch?: string;
  /** Suggested commit message for the patch. */
  suggestedCommitMessage?: string;
}

/**
 * Represents a set of changes in a plan.
 */
export interface ChangeSet {
  /** Source repository the change set applies to. */
  source?: string;
  /** Git-native patch payload returned by current Jules API responses. */
  gitPatch?: GitPatch;
  /** Unified patch for the full change set */
  patch?: string;
  /** Array of file changes */
  changes?: {
    /** The path of the file changed. */
    path: string;
    /** The diff of the changes. */
    diff?: string;
    /** The old content of the file. */
    oldContent?: string;
    /** The new content of the file. */
    newContent?: string;
  }[];
}

/**
 * Single artifact emitted by a Jules activity.
 */
export interface Artifact {
  /** Code changes emitted by the activity. */
  changeSet?: ChangeSet;
  /** Command output emitted by the activity. */
  bashOutput?: {
    /** Command that was executed. */
    command?: string;
    /** Combined stdout/stderr output. */
    output?: string;
    /** Exit code for the command. */
    exitCode?: number;
  };
  /** Media file emitted by the activity. */
  media?: {
    /** Optional media URL. */
    url?: string;
    /** Media MIME type. */
    mimeType?: string;
    /** Optional human-readable description. */
    description?: string;
    /** Base64 payload when the API returns inline media. */
    data?: string;
  };
}

/**
 * Structured plan emitted by Jules.
 */
export interface Plan {
  /** Plan identifier. */
  id?: string;
  /** Ordered plan steps. */
  steps?: {
    /** Unique step identifier. */
    id?: string;
    /** Zero-based step index. */
    index?: number;
    /** Short step title. */
    title: string;
    /** Expanded step description. */
    description?: string;
  }[];
  /** When the plan was created. */
  createTime?: string;
}

/**
 * Represents an activity within a session.
 */
export interface Activity {
  /** Resource name format: sessions/{session_id}/activities/{activity_id} */
  name: string;
  /** Unique activity identifier. */
  id?: string;
  /** Activity type */
  type?: ActivityType | (string & {});
  /** Entity that created the activity. */
  originator?: string;
  /** Optional human-readable summary. */
  description?: string;
  /** Timestamp when activity occurred */
  timestamp?: string;
  /** Timestamp used by the live Jules API. */
  createTime?: string;
  /** Artifacts emitted by the activity. */
  artifacts?: Artifact[];
  /** Activity-specific payload */
  planGenerated?: {
    /** The generated plan. */
    plan: Plan | string;
    /** The set of changes proposed in the plan. */
    changeSet?: ChangeSet;
  };
  progressUpdated?: {
    /** Short title emitted by the live Jules API. */
    title?: string;
    /** Longer description emitted by the live Jules API. */
    description?: string;
    /** The progress message. */
    message?: string;
    /** The completion percentage. */
    percentage?: number;
  };
  sessionCompleted?: {
    /** Whether the session completed successfully. */
    success?: boolean;
    /** A message describing the completion. */
    message?: string;
    /** The URL of the created pull request, if any. */
    pullRequestUrl?: string;
    /** The final set of changes for the session, if available. */
    changeSet?: ChangeSet;
  };
  sessionFailed?: {
    /** A message describing why the session failed. */
    reason?: string;
  };
  messageSent?: {
    /** The message content. */
    prompt: string;
    /** The sender of the message. */
    sender: 'USER' | 'AGENT';
  };
  userMessaged?: {
    /** The message content emitted by the current Jules API. */
    userMessage: string;
  };
  planApproved?: {
    /** When the plan was approved. */
    approvedAt?: string;
    /** Plan identifier emitted by the current Jules API. */
    planId?: string;
  };
  agentMessaged?: {
    /** Agent-authored message requiring user attention. */
    message?: string;
    /** Agent-authored message emitted by the current Jules API. */
    agentMessage?: string;
  };
  media?: {
    /** Optional media URL. */
    url?: string;
    /** Media MIME type. */
    mimeType?: string;
    /** Optional human-readable description. */
    description?: string;
    /** Base64 payload when the API returns inline media. */
    data?: string;
  };
}

/**
 * Response object for listing activities.
 */
export interface ListActivitiesResponse {
  /** A list of activities. */
  activities: Activity[];
  /** A token for the next page of results. */
  nextPageToken?: string;
}

/**
 * Request object for sending a message.
 */
export interface SendMessageRequest {
  /** The message content to send. */
  prompt: string;
}
