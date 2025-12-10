/**
 * Cron Engine - Scheduling engine using node-schedule
 * Manages in-memory timers for scheduled Jules tasks
 */

import schedule, { Job } from 'node-schedule';
import type { ScheduledTask } from '../types/schedule.js';
import type { JulesClient } from '../api/jules-client.js';
import type { ScheduleStorage } from '../storage/schedule-store.js';
import { retryWithBackoff } from '../utils/security.js';

/**
 * Manages the scheduling and execution of cron jobs for Jules tasks.
 */
export class CronEngine {
  private jobs: Map<string, Job> = new Map();
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
   * Schedules a task in memory.
   * Cancels any existing job for the task ID before scheduling.
   * @param task - The task to schedule.
   * @throws Error if the schedule creation fails.
   */
  scheduleTask(task: ScheduledTask): void {
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
    schedule.gracefulShutdown();
  }
}
