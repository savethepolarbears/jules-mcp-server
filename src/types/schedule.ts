/**
 * Type definitions for local scheduling persistence
 * This implements the "Thick Server" pattern - local state management
 * since the Jules API does not natively support scheduling.
 */

export interface TaskPayload {
  /** The natural language instruction for Jules */
  prompt: string;
  /** Repository resource name (sources/github/owner/repo) */
  source: string;
  /** Target branch (defaults to main) */
  branch?: string;
  /** Whether to auto-create PR on completion */
  automationMode: 'AUTO_CREATE_PR' | 'AUTOMATION_MODE_UNSPECIFIED';
  /** Whether to require plan approval */
  requirePlanApproval?: boolean;
  /** Optional session title */
  title?: string;
}

export interface ScheduledTask {
  /** Unique identifier (UUID) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Cron expression (e.g., "0 9 * * 1" for Mondays at 9 AM) */
  cron: string;
  /** The payload to send to Jules API when triggered */
  taskPayload: TaskPayload;
  /** Timezone for cron execution (defaults to system timezone) */
  timezone?: string;
  /** ISO timestamp when schedule was created */
  createdAt: string;
  /** ISO timestamp of last execution */
  lastRun?: string;
  /** Session ID from last execution */
  lastSessionId?: string;
  /** Whether this schedule is currently active */
  enabled: boolean;
}

export interface ScheduleStore {
  /** Map of schedule ID to ScheduledTask */
  schedules: Record<string, ScheduledTask>;
  /** Schema version for future migrations */
  version: string;
}
