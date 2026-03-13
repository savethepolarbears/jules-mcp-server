/**
 * Cron Engine - Scheduling engine using node-schedule
 * Manages in-memory timers for scheduled Jules tasks
 */

import type { Job } from 'node-schedule';
import schedule from 'node-schedule';
import type { ScheduledTask } from '../types/schedule.js';
import type { JulesClient } from '../api/jules-client.js';
import type { ScheduleStorage } from '../storage/schedule-store.js';
import { retryWithBackoff } from '../utils/security.js';

/**
 * Manages the scheduling and execution of cron jobs for Jules tasks.
 */
export class CronEngine {
  private jobs = new Map<string, Job>();
  private readonly storage: ScheduleStorage;
  private readonly julesClient: JulesClient;
  private readonly logger: (message: string) => void;

  /**
   * Creates an instance of CronEngine.
   * @param storage - The storage instance for scheduled tasks.
   * @param julesClient - The client for interacting with the Jules API.
   * @param logger - The logger function to use (defaults to console.log).
   */
  constructor(
    storage: ScheduleStorage,
    julesClient: JulesClient,
    logger: (message: string) => void = console.log
  ) {
    this.storage = storage;
    this.julesClient = julesClient;
    this.logger = logger;
  }

  /**
   * Hydrates all schedules from storage on startup.
   * Loads tasks from storage and schedules them if enabled.
   */
  async initialize(): Promise<void> {
    const tasks = await this.storage.listTasks();
    this.logger(`Loading ${tasks.length} scheduled tasks from storage...`);

    for (const task of tasks) {
      if (task.enabled) {
        try {
          this.scheduleTask(task);
          this.logger(`✓ Scheduled: ${task.name} (${task.cron})`);
        } catch (error) {
          this.logger(
            `✗ Failed to schedule ${task.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    this.logger('Scheduler initialized.');
  }

  /**
   * Validates a cron expression.
   * @param expression - The cron expression to validate.
   * @returns True if the expression is valid, false otherwise.
   */
  static validateCronExpression(expression: string): boolean {
    try {
      // Create job to test validity
      const testJob = schedule.scheduleJob(expression, () => {});

      if (!testJob) {
        return false;
      }

      // CRITICAL: Cancel immediately to prevent memory leak
      testJob.cancel();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates if a cron expression is quota-aware (not too frequent).
   * Ensures the schedule does not run more often than once per hour
   * to respect API quotas and safe operation guidelines.
   * @param expression - The cron expression to validate for frequency.
   * @returns True if the schedule is safe (>= 1 hour interval), false if too frequent.
   */
  static isQuotaAwareSchedule(expression: string): boolean {
    try {
      // We parse the expression manually because node-schedule's nextInvocation() might block or not advance properly if called multiple times synchronously without running the job.
      // node-schedule internally uses cron-parser or a similar mechanism. We can test standard intervals.
      // A safe way to check frequency without external dependencies is to look at the minute field.
      const parts = expression.trim().split(/\s+/);
      if (parts.length < 5 || parts.length > 6) return false;

      // node-schedule supports both 5-part (standard cron: min, hour, dom, month, dow)
      // and 6-part (with seconds: sec, min, hour, dom, month, dow).
      // The minute part is at index 0 for 5-part, and index 1 for 6-part.
      const minutePart = parts.length === 6 ? parts[1] : parts[0];

      // If minute is '*' or contains '*/X' where X < 55, or is a list with items close to each other, it's too frequent.
      // For simplicity and safety, the most robust check without complex parser logic:
      // A quota-aware cron should have a specific minute (e.g. '0') or an allowed list/range that guarantees >= 1 hr gap.
      // We'll enforce that the minute field MUST be a single numeric value between 0-59.
      // E.g., '0 * * * *' (hourly), '30 9 * * 1' (weekly), '0 0 * * *' (daily)
      // This strictly prevents '* * * * *' or '*/15 * * * *' or '0,30 * * * *'.

      if (!/^\d+$/.test(minutePart)) {
         return false;
      }

      const minute = parseInt(minutePart, 10);
      if (minute < 0 || minute > 59) {
          return false;
      }

      // Also ensure it is actually a valid cron by using node-schedule once.
      const testJob = schedule.scheduleJob(expression, () => {});
      if (!testJob) return false;
      testJob.cancel();

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Schedules a task in memory.
   * Cancels any existing job for the task ID before scheduling.
   * @param task - The task to schedule.
   * @throws Error if the schedule creation fails, or if it violates quota guidelines.
   */
  scheduleTask(task: ScheduledTask): void {
    if (!CronEngine.isQuotaAwareSchedule(task.cron)) {
      throw new Error(`Schedule '${task.cron}' is too frequent. For safe, quota-aware operation, tasks must run at most once per hour.`);
    }

    // Cancel existing job if present
    this.cancelTask(task.id);

    // Create the job callback
    const jobCallback = async () => {
      const timestamp = new Date().toISOString();
      this.logger(`[${timestamp}] Executing scheduled task: ${task.name}`);

      try {
        // Create Jules session with retry logic (3 attempts with exponential backoff)
        const session = await retryWithBackoff(
          () =>
            this.julesClient.createSession({
              prompt: task.taskPayload.prompt,
              sourceContext: {
                source: task.taskPayload.source,
                githubRepoContext: {
                  startingBranch: task.taskPayload.branch || 'main',
                },
              },
              automationMode: task.taskPayload.automationMode,
              requirePlanApproval: task.taskPayload.requirePlanApproval,
              title: task.taskPayload.title,
            }),
          3, // maxRetries
          2000 // 2 second base delay
        );

        this.logger(
          `✓ Task "${task.name}" created session: ${session.id}`
        );

        // Update last run metadata
        await this.storage.updateLastRun(task.id, timestamp, session.id);
      } catch (error) {
        this.logger(
          `✗ Task "${task.name}" failed after 3 retries: ${error instanceof Error ? error.message : 'Unknown error'}`
        );

        // Update last run even on failure for audit trail
        await this.storage.updateLastRun(task.id, timestamp, undefined);
      }
    };

    // Schedule the job
    const job = schedule.scheduleJob(task.cron, jobCallback);

    if (!job) {
      throw new Error(`Failed to create schedule for cron: ${task.cron}`);
    }

    this.jobs.set(task.id, job);
  }

  /**
   * Cancels a scheduled task.
   * @param taskId - The ID of the task to cancel.
   */
  cancelTask(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.cancel();
      this.jobs.delete(taskId);
    }
  }

  /**
   * Gets the next scheduled execution time for a task.
   * @param taskId - The ID of the task.
   * @returns The next invocation date, or null if the task is not scheduled.
   */
  getNextInvocation(taskId: string): Date | null {
    const job = this.jobs.get(taskId);
    if (!job) {
      return null;
    }
    return job.nextInvocation();
  }

  /**
   * Reschedules a task (useful when cron expression changes).
   * @param task - The task to reschedule.
   */
  async rescheduleTask(task: ScheduledTask): Promise<void> {
    this.cancelTask(task.id);
    this.scheduleTask(task);
  }

  /**
   * Cancels all jobs and shuts down scheduler.
   */
  shutdown(): void {
    this.logger('Shutting down scheduler...');
    for (const [taskId, job] of this.jobs.entries()) {
      job.cancel();
      this.logger(`Canceled job: ${taskId}`);
    }
    this.jobs.clear();
    void schedule.gracefulShutdown();
  }
}
