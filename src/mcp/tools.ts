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
import { RepositoryValidator, smartTruncate } from '../utils/security.js';

// Input validation schemas
export const CreateTaskSchema = z.object({
  prompt: z
    .string()
    .min(10, 'Prompt must be at least 10 characters')
    .max(10000, 'Prompt must not exceed 10,000 characters')
    .refine((val) => val.trim().length > 0, 'Prompt cannot be empty or whitespace only')
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
    .enum(['approve_plan', 'send_message'])
    .describe('Action to perform on the session'),
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message must not exceed 5,000 characters')
    .optional()
    .describe('Message content (required for send_message action)'),
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

export class JulesTools {
  constructor(
    private readonly client: JulesClient,
    private readonly storage: ScheduleStorage,
    private readonly scheduler: CronEngine
  ) {}

  /**
   * Helper: Execute tool with consistent error handling
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
      return JSON.stringify({
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }

  /**
   * Tool: create_coding_task
   * Creates an immediate Jules session
   */
  async createCodingTask(
    args: z.infer<typeof CreateTaskSchema>
  ): Promise<string> {
    return this.executeWithErrorHandling(async () => {
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
        monitorUrl: `https://jules.google/sessions/${session.id}`,
      };
    });
  }

  /**
   * Tool: manage_session
   * Manages session lifecycle (approve plan, send feedback)
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
   * Polls for session status and returns current state
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
        repository: session.sourceContext.source,
        updated: session.updateTime,
        nextSteps: this.getNextStepsForState(session.state || 'UNKNOWN'),
      };
    });
  }

  /**
   * Tool: schedule_recurring_task
   * Schedules a task to run on a cron schedule
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
   * Returns all active schedules
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
   * Removes a scheduled task
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
   * Helper: Provides guidance based on session state
   */
  private getNextStepsForState(state: string): string {
    const stateGuide: Record<string, string> = {
      QUEUED: 'Session is queued. Wait for it to start planning.',
      PLANNING: 'Jules is generating a plan. Wait for plan completion.',
      AWAITING_PLAN_APPROVAL:
        'Plan is ready. Read jules://sessions/{id}/full to review the plan, then call manage_session with action=approve_plan to proceed.',
      IN_PROGRESS:
        'Session is executing. Monitor progress via jules://sessions/{id}/full.',
      COMPLETED:
        'Session completed. Check the final activity for Pull Request URL or artifacts.',
      FAILED:
        'Session failed. Review activities to diagnose the issue.',
      CANCELED: 'Session was canceled.',
    };

    return stateGuide[state] || 'Unknown state. Check session activities.';
  }
}
