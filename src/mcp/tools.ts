/**
 * MCP Tools - Executable functions for LLM interaction with Jules
 * Tools allow the LLM to trigger actions (create tasks, approve plans, schedule)
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { JulesClient } from '../api/jules-client.js';
import type { ScheduleStorage } from '../storage/schedule-store.js';
import { CronEngine } from '../scheduler/cron-engine.js';
import type { ScheduledTask } from '../types/schedule.js';
import type { Session, SessionState } from '../types/jules-api.js';
import { RepositoryValidator, smartTruncate, containsSecret, RateLimiter } from '../utils/security.js';

// Input validation schemas
export const CreateTaskSchema = z.object({
  prompt: z
    .string()
    .min(10, 'Prompt must be at least 10 characters')
    .max(10000, 'Prompt must not exceed 10,000 characters')
    .refine((val) => val.trim().length > 0, 'Prompt cannot be empty or whitespace only')
    .refine((val) => !containsSecret(val), 'Prompt contains potential secrets (e.g., API keys). Please remove them.')
    .describe(
      'Natural language instruction for the coding task. Be specific about files, goals, and constraints.'
    ),
  source: z
    .string()
    .regex(
      /^sources\/github\/[\w-]+\/[\w-]+$/,
      'Source must be in format sources/github/owner/repo'
    )
    .describe(
      'Repository resource name (format: sources/github/owner/repo). Check jules://sources resource first.'
    ),
  branch: z
    .string()
    .regex(/^[\w/-]+$/, 'Branch name contains invalid characters')
    .default('main')
    .describe('Git branch to base changes on'),
  auto_create_pr: z
    .boolean()
    .default(true)
    .describe('If true, automatically creates a Pull Request upon completion'),
  require_plan_approval: z
    .boolean()
    .default(false)
    .describe(
      'If true, pauses at AWAITING_PLAN_APPROVAL state for manual review'
    ),
  title: z
    .string()
    .max(200, 'Title must not exceed 200 characters')
    .optional()
    .describe('Optional human-readable session title'),
});

export const ManageSessionSchema = z.object({
  session_id: z
    .string()
    .regex(/^[\w-]+$/, 'Session ID contains invalid characters')
    .describe('The ID of the session to manage'),
  action: z
    .enum(['approve_plan', 'send_message', 'reject_plan'])
    .describe('Action to perform on the session'),
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message must not exceed 5,000 characters')
    .refine((val) => !containsSecret(val), 'Message contains potential secrets. Please remove them.')
    .optional()
    .describe('Message content (required for send_message action)'),
});

export const CreateRepolessTaskSchema = z.object({
  prompt: z
    .string()
    .min(10, 'Prompt must be at least 10 characters')
    .max(10000, 'Prompt must not exceed 10,000 characters')
    .refine((val) => val.trim().length > 0, 'Prompt cannot be empty or whitespace only')
    .refine((val) => !containsSecret(val), 'Prompt contains potential secrets (e.g., API keys). Please remove them.')
    .describe('Natural language instruction for a repoless Jules task.'),
  title: z
    .string()
    .max(200, 'Title must not exceed 200 characters')
    .optional()
    .describe('Optional human-readable session title'),
});

const waitTargetStateSchema = z.enum([
  'COMPLETED',
  'FAILED',
  'CANCELED',
  'AWAITING_PLAN_APPROVAL',
  'AWAITING_USER_FEEDBACK',
]);

export const WaitForSessionSchema = z.object({
  session_id: z
    .string()
    .regex(/^[\w-]+$/, 'Session ID contains invalid characters')
    .describe('The ID of the session to wait for'),
  timeout_seconds: z
    .number()
    .min(30, 'timeout_seconds must be at least 30')
    .max(1800, 'timeout_seconds must not exceed 1800')
    .default(300)
    .describe('Maximum time to wait before timing out'),
  poll_interval_seconds: z
    .number()
    .min(5, 'poll_interval_seconds must be at least 5')
    .max(60, 'poll_interval_seconds must not exceed 60')
    .default(10)
    .describe('Polling interval while waiting for the target state'),
  target_states: z
    .array(waitTargetStateSchema)
    .default(['COMPLETED', 'FAILED', 'CANCELED'])
    .describe('States that should stop the polling loop'),
});

export const GetActivitiesSinceSchema = z.object({
  session_id: z
    .string()
    .regex(/^[\w-]+$/, 'Session ID contains invalid characters')
    .describe('The ID of the session to inspect'),
  since: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'since must be a valid ISO 8601 timestamp')
    .describe('ISO 8601 timestamp used as the lower bound'),
  page_size: z
    .number()
    .min(1, 'page_size must be at least 1')
    .max(200, 'page_size must not exceed 200')
    .default(50)
    .optional()
    .describe('Maximum number of activities to return'),
});

export const GetSessionStatusSchema = z.object({
  session_id: z.string().describe('The ID of the session to check'),
});

export const ScheduleTaskSchema = z.object({
  task_name: z
    .string()
    .min(1, 'Task name cannot be empty')
    .max(100, 'Task name must not exceed 100 characters')
    .regex(/^[\w\s-]+$/, 'Task name can only contain letters, numbers, spaces, hyphens, and underscores')
    .describe('Unique name for this schedule (e.g., "Weekly Dependency Update")'),
  cron_expression: z
    .string()
    .regex(/^[\d\s*,/-]+$/, 'Cron expression contains invalid characters')
    .describe(
      'Standard cron expression (e.g., "0 9 * * 1" for Mondays at 9 AM). Format: minute hour day month weekday'
    ),
  prompt: z
    .string()
    .min(10, 'Prompt must be at least 10 characters')
    .max(10000, 'Prompt must not exceed 10,000 characters')
    .refine((val) => !containsSecret(val), 'Prompt contains potential secrets (e.g., API keys). Please remove them.')
    .describe('The coding task instruction to execute'),
  source: z
    .string()
    .regex(
      /^sources\/github\/[\w-]+\/[\w-]+$/,
      'Source must be in format sources/github/owner/repo'
    )
    .describe('Repository resource name (sources/github/owner/repo)'),
  branch: z
    .string()
    .regex(/^[\w/-]+$/, 'Branch name contains invalid characters')
    .default('main')
    .describe('Git branch to target'),
  auto_create_pr: z
    .boolean()
    .default(true)
    .describe('Whether to auto-create PRs'),
  require_plan_approval: z
    .boolean()
    .default(false)
    .describe('Whether to require manual plan approval'),
  timezone: z
    .string()
    .optional()
    .describe('Timezone for cron execution (e.g., "America/New_York")'),
});

export const DeleteScheduleSchema = z.object({
  task_name: z.string().describe('Name of the scheduled task to delete'),
});

export const DeleteSessionSchema = z.object({
  session_id: z.string().describe('The ID of the session to delete or cancel'),
});

export const GetSourceDetailsSchema = z.object({
  source_name: z
    .string()
    .regex(
      /^sources\/github\/[\w-]+\/[\w-]+$/,
      'Source name must be in format sources/github/owner/repo'
    )
    .describe('The resource name of the source (e.g., sources/github/owner/repo)'),
});

/**
 * Manages the available tools for the Jules MCP server.
 */
export class JulesTools {
  private readonly rateLimiter: RateLimiter;

  /**
   * Creates an instance of JulesTools.
   *
   * @param client - The Jules API client used to execute tool operations.
   * @param storage - The storage engine for persisting scheduled tasks.
   * @param scheduler - The cron engine managing recurring execution.
   */
  constructor(
    private readonly client: JulesClient,
    private readonly storage: ScheduleStorage,
    private readonly scheduler: CronEngine
  ) {
    // Limit to 10 requests per minute to prevent accidental runaway execution
    this.rateLimiter = new RateLimiter(10, 60000);
  }

  /**
   * Returns the preferred session monitor URL.
   * @param session - Session payload returned by the Jules API.
   * @returns Public monitor URL for the session.
   */
  private getMonitorUrl(session: Session): string {
    return session.url || `https://jules.google.com/sessions/${session.id}`;
  }

  /**
   * Returns the first pull request URL exposed in session outputs.
   * @param session - Session payload returned by the Jules API.
   * @returns Pull request URL when available.
   */
  private getPullRequestUrl(session: Session): string | undefined {
    return session.outputs?.find((output) => output.pullRequest?.url)?.pullRequest?.url;
  }

  /**
   * Returns the repository identifier for a session or a repoless fallback.
   * @param session - Session payload returned by the Jules API.
   * @returns Repository resource name or a repoless label.
   */
  private getRepositoryLabel(session: Session): string {
    return session.sourceContext?.source || 'repoless';
  }

  /**
   * Sleeps for the requested duration.
   * @param milliseconds - Delay duration in milliseconds.
   * @returns Promise resolving after the delay.
   */
  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  /**
   * Helper: Executes a tool operation with consistent error handling and formatting.
   * Catches exceptions and returns them as a structured JSON error string, allowing
   * the LLM to gracefully handle failures.
   *
   * @template T The expected return type of the operation.
   * @param operation - The asynchronous operation to execute.
   * @param successTransform - An optional function to transform the result into a specific JSON structure on success.
   * @returns {Promise<string>} A JSON string representing the structured result or error.
   */
  private async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    successTransform?: (result: T) => Record<string, unknown>
  ): Promise<string> {
    try {
      const result = await operation();

      if (successTransform) {
        return JSON.stringify({ success: true, ...successTransform(result) });
      }

      return JSON.stringify(result);
    } catch (error) {
      const isValidationError = error instanceof z.ZodError || (error instanceof Error && error.message.includes('Validation'));
      
      // Log full error internally
      console.error('Tool execution error:', error);
      
      const errorMsg = isValidationError && error instanceof Error 
        ? error.message 
        : (error instanceof Error && error.message.includes('Security Error')) 
          ? error.message
          : (error instanceof Error && error.message.includes('Rate limit'))
            ? error.message
            : 'An internal error occurred. Please check server logs.';
          
      return JSON.stringify({
        success: false,
        error: errorMsg,
      });
    }
  }

  /**
   * Tool: create_coding_task
   * Creates an immediate Jules coding session to execute a specific task.
   *
   * @param args - The structured arguments matching `CreateTaskSchema`.
   * @returns {Promise<string>} A JSON string representing the created session details, including its ID and status.
   */
  async createCodingTask(
    args: z.infer<typeof CreateTaskSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      if (!this.rateLimiter.isAllowed()) {
        throw new Error('Rate limit exceeded. Please wait before creating more tasks.');
      }

      // SECURITY: Validate repository allowlist
      RepositoryValidator.validateRepository(args.source);

      const session = await this.client.createSession({
        prompt: args.prompt,
        sourceContext: {
          source: args.source,
          githubRepoContext: {
            startingBranch: args.branch,
          },
        },
        automationMode: args.auto_create_pr
          ? 'AUTO_CREATE_PR'
          : 'AUTOMATION_MODE_UNSPECIFIED',
        requirePlanApproval: args.require_plan_approval,
        title: args.title,
      });

      const statusMsg = args.require_plan_approval
        ? 'Session created and waiting for plan approval. Use jules://sessions/{id}/full to review the plan, then call manage_session with action=approve_plan.'
        : 'Session created and executing automatically.';

      return {
        sessionId: session.id,
        state: session.state,
        message: statusMsg,
        monitorUrl: this.getMonitorUrl(session),
        prUrl: this.getPullRequestUrl(session),
      };
    });
  }

  /**
   * Tool: create_repoless_task
   * Creates a Jules session without a repository source context.
   *
   * @param args - The structured arguments matching `CreateRepolessTaskSchema`.
   * @returns {Promise<string>} A JSON string representing the created session details.
   */
  async createRepolessTask(
    args: z.infer<typeof CreateRepolessTaskSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      if (!this.rateLimiter.isAllowed()) {
        throw new Error('Rate limit exceeded. Please wait before creating more tasks.');
      }

      const session = await this.client.createSession({
        prompt: args.prompt,
        title: args.title,
      });

      return {
        sessionId: session.id,
        state: session.state,
        monitorUrl: this.getMonitorUrl(session),
        prUrl: this.getPullRequestUrl(session),
      };
    });
  }

  /**
   * Tool: manage_session
   * Manages the lifecycle of an active Jules session, such as approving generated plans
   * or sending feedback messages to the agent.
   *
   * @param args - The structured arguments matching `ManageSessionSchema`.
   * @returns {Promise<string>} A JSON string representing the result of the management action.
   */
  async manageSession(
    args: z.infer<typeof ManageSessionSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      if (args.action === 'approve_plan') {
        const session = await this.client.approvePlan(args.session_id);
        return {
          message: 'Plan approved. Session is now executing.',
          newState: session.state,
        };
      }

      if (args.action === 'reject_plan') {
        await this.client.rejectPlan(args.session_id);
        return {
          message: 'Plan rejected. Session has been canceled.',
          newState: 'CANCELED',
        };
      }

      if (args.action === 'send_message') {
        if (!args.message) {
          throw new Error('Message is required for send_message action');
        }

        const session = await this.client.sendMessage(args.session_id, {
          prompt: args.message,
        });

        return {
          message: 'Feedback sent to session',
          newState: session.state,
        };
      }

      throw new Error('Invalid action');
    });
  }

  /**
   * Tool: get_session_status
   * Retrieves the current status and state of a given Jules session.
   * Provides guidance on what next steps to take based on the state.
   *
   * @param args - The structured arguments matching `GetSessionStatusSchema`.
   * @returns {Promise<string>} A JSON string representing the session status.
   */
  async getSessionStatus(
    args: z.infer<typeof GetSessionStatusSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      const session = await this.client.getSession(args.session_id);

      return {
        sessionId: session.id,
        title: session.title,
        state: session.state,
        prompt: session.prompt,
        repository: this.getRepositoryLabel(session),
        updated: session.updateTime,
        nextSteps: this.getNextStepsForState(session.state || 'UNKNOWN'),
      };
    });
  }

  /**
   * Tool: wait_for_session
   * Polls the Jules API until the target state is reached or the timeout expires.
   *
   * @param args - The structured arguments matching `WaitForSessionSchema`.
   * @returns {Promise<string>} A JSON string representing the final observed session state.
   */
  async waitForSession(
    args: z.infer<typeof WaitForSessionSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      const startedAt = Date.now();
      const timeoutMs = args.timeout_seconds * 1000;
      const targetStates = new Set<SessionState>(args.target_states);

      while (true) {
        const session = await this.client.getSession(args.session_id);
        const currentState = session.state;
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

        if (currentState && targetStates.has(currentState)) {
          return {
            sessionId: session.id,
            title: session.title,
            finalState: currentState,
            elapsedSeconds,
            nextSteps: this.getNextStepsForState(currentState),
            prUrl: this.getPullRequestUrl(session),
          };
        }

        if (Date.now() - startedAt >= timeoutMs) {
          throw new Error(
            `Timed out waiting for session "${args.session_id}" after ${elapsedSeconds} seconds`
          );
        }

        await this.delay(args.poll_interval_seconds * 1000);
      }
    });
  }

  /**
   * Tool: get_activities_since
   * Returns activities newer than the provided timestamp.
   *
   * @param args - The structured arguments matching `GetActivitiesSinceSchema`.
   * @returns {Promise<string>} A JSON string containing recent activities.
   */
  async getActivitiesSince(
    args: z.infer<typeof GetActivitiesSinceSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      const response = await this.client.listActivitiesSince(
        args.session_id,
        args.since,
        args.page_size ?? 50
      );

      return {
        sessionId: args.session_id,
        since: args.since,
        count: response.activities.length,
        activities: response.activities,
      };
    });
  }

  /**
   * Tool: schedule_recurring_task
   * Configures a new automated task to run on a specified cron schedule.
   * Persists the schedule locally so it survives server restarts.
   *
   * @param args - The structured arguments matching `ScheduleTaskSchema`.
   * @returns {Promise<string>} A JSON string representing the scheduling result, including the task ID and next run time.
   */
  async scheduleRecurringTask(
    args: z.infer<typeof ScheduleTaskSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      // Validate cron expression
      if (!CronEngine.validateCronExpression(args.cron_expression)) {
        throw new Error(
          `Invalid cron expression: ${args.cron_expression}. Format: minute hour day month weekday`
        );
      }

      // Check for name collision
      const existing = await this.storage.getTaskByName(args.task_name);
      if (existing) {
        throw new Error(
          `A schedule named "${args.task_name}" already exists. Use delete_schedule first or choose a different name.`
        );
      }

      // SECURITY: Validate repository allowlist
      RepositoryValidator.validateRepository(args.source);

      // Create scheduled task
      const task: ScheduledTask = {
        id: randomUUID(),
        name: args.task_name,
        cron: args.cron_expression,
        taskPayload: {
          prompt: args.prompt,
          source: args.source,
          branch: args.branch,
          automationMode: args.auto_create_pr
            ? 'AUTO_CREATE_PR'
            : 'AUTOMATION_MODE_UNSPECIFIED',
          requirePlanApproval: args.require_plan_approval,
        },
        timezone: args.timezone,
        createdAt: new Date().toISOString(),
        enabled: true,
      };

      // Persist and schedule
      await this.storage.upsertTask(task);
      this.scheduler.scheduleTask(task);

      const nextRun = this.scheduler.getNextInvocation(task.id);

      return {
        message: `Task "${args.task_name}" scheduled successfully`,
        scheduleId: task.id,
        cron: args.cron_expression,
        nextExecution: nextRun?.toISOString() || 'Unknown',
      };
    });
  }

  /**
   * Tool: list_schedules
   * Retrieves a list of all active locally-managed scheduled tasks.
   *
   * @returns {Promise<string>} A JSON string representing all active schedules and their next execution times.
   */
  async listSchedules(): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      const tasks = await this.storage.listTasks();

      const formatted = tasks.map((task) => {
        const nextRun = this.scheduler.getNextInvocation(task.id);
        return {
          id: task.id,
          name: task.name,
          cron: task.cron,
          enabled: task.enabled,
          repository: task.taskPayload.source,
          prompt: smartTruncate(task.taskPayload.prompt, 60),
          nextRun: nextRun?.toISOString() || 'Not scheduled',
          lastRun: task.lastRun || 'Never',
          lastSessionId: task.lastSessionId,
        };
      });

      return {
        count: formatted.length,
        schedules: formatted,
      };
    });
  }

  /**
   * Tool: delete_schedule
   * Removes an existing scheduled task, stopping future executions and deleting it from storage.
   *
   * @param args - The structured arguments matching `DeleteScheduleSchema`.
   * @returns {Promise<string>} A JSON string confirming the deletion result.
   */
  async deleteSchedule(
    args: z.infer<typeof DeleteScheduleSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      const task = await this.storage.getTaskByName(args.task_name);

      if (!task) {
        throw new Error(`No schedule found with name: ${args.task_name}`);
      }

      // Cancel in-memory job
      this.scheduler.cancelTask(task.id);

      // Remove from storage
      await this.storage.deleteTask(task.id);

      return {
        message: `Schedule "${args.task_name}" deleted successfully`,
      };
    });
  }

  /**
   * Tool: delete_session
   * Deletes or cancels an active Jules session.
   *
   * @param args - The structured arguments matching `DeleteSessionSchema`.
   * @returns {Promise<string>} A JSON string confirming the deletion.
   */
  async deleteSession(
    args: z.infer<typeof DeleteSessionSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      const session = await this.client.getSession(args.session_id);
      await this.client.deleteSession(args.session_id);
      const activeStates: SessionState[] = [
        'QUEUED',
        'PLANNING',
        'IN_PROGRESS',
        'AWAITING_PLAN_APPROVAL',
        'AWAITING_USER_FEEDBACK',
      ];
      const action = session.state && activeStates.includes(session.state)
        ? 'canceled'
        : 'deleted';
      return {
        message: `Session "${args.session_id}" ${action} successfully`,
      };
    });
  }

  /**
   * Tool: get_source_details
   * Retrieves detailed information about a specific source repository.
   *
   * @param args - The structured arguments matching `GetSourceDetailsSchema`.
   * @returns {Promise<string>} A JSON string representing the source details.
   */
  async getSourceDetails(
    args: z.infer<typeof GetSourceDetailsSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      const source = await this.client.getSource(args.source_name);
      return {
        name: source.name,
        repository: source.githubRepo
          ? `${source.githubRepo.owner}/${source.githubRepo.repo}`
          : 'Unknown',
        defaultBranch: source.githubRepo?.defaultBranch || 'main',
        url: source.githubRepo?.htmlUrl,
        metadata: source.githubRepo,
      };
    });
  }

  /**
   * Helper: Provides actionable guidance based on a session's current state.
   * Helps the LLM understand what to do next (e.g., approve a plan, wait, or review failures).
   *
   * @param state - The current state string of the session.
   * @returns {string} A string describing the recommended next steps.
   */
  private getNextStepsForState(state: string): string {
    const stateGuide: Record<string, string> = {
      QUEUED: 'Session is queued. Wait for it to start planning.',
      PLANNING: 'Jules is generating a plan. Wait for plan completion.',
      AWAITING_PLAN_APPROVAL:
        'Plan is ready. Read jules://sessions/{id}/full to review the plan, then call manage_session with action=approve_plan to proceed.',
      AWAITING_USER_FEEDBACK:
        'Jules asked a clarifying question. Read jules://sessions/{id}/full to see the agentMessaged activity, then call manage_session with action=send_message to answer it.',
      IN_PROGRESS:
        'Session is executing. Monitor progress via jules://sessions/{id}/full.',
      PAUSED:
        'Session is paused. Use manage_session with action=send_message to resume.',
      COMPLETED:
        'Session completed. Check the final activity for Pull Request URL or artifacts.',
      FAILED:
        'Session failed. Review activities to diagnose the issue.',
      CANCELED: 'Session was canceled.',
    };

    return stateGuide[state] || 'Unknown state. Check session activities.';
  }
}
