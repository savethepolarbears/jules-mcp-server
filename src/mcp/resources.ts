/**
 * MCP Resources - Read-only context exposure for the LLM
 * Resources provide "grounding" - helping the LLM understand the current state
 */

import type { JulesClient } from '../api/jules-client.js';
import type { ScheduleStorage } from '../storage/schedule-store.js';
import type { CronEngine } from '../scheduler/cron-engine.js';
import { smartTruncate } from '../utils/security.js';

/**
 * Manages the exposure of Jules resources via the MCP protocol.
 */
export class JulesResources {
  constructor(
    private readonly client: JulesClient,
    private readonly storage: ScheduleStorage,
    private readonly scheduler: CronEngine
  ) {}

  /**
   * Resource: jules://sources
   * Returns a list of all connected GitHub repositories.
   * @returns A JSON string representing the connected sources.
   */
  async getSources(): Promise<string> {
    const response = await this.client.listSources();

    const formatted = response.sources.map((source) => ({
      name: source.name,
      repository: source.githubRepo
        ? `${source.githubRepo.owner}/${source.githubRepo.repo}`
        : 'Unknown',
      defaultBranch: source.githubRepo?.defaultBranch || 'main',
      url: source.githubRepo?.htmlUrl,
    }));

    return JSON.stringify(
      {
        description: 'Connected GitHub repositories available for Jules tasks',
        count: formatted.length,
        sources: formatted,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://sessions/list
   * Returns a summary of recent sessions.
   * @returns A JSON string representing a summary of recent sessions.
   */
  async getSessionsList(): Promise<string> {
    const response = await this.client.listSessions(50);

    const formatted = response.sessions.map((session) => ({
      id: session.id,
      title: session.title || 'Untitled Task',
      state: session.state || 'UNKNOWN',
      prompt: smartTruncate(session.prompt, 100),
      repository: session.sourceContext.source,
      created: session.createTime,
    }));

    return JSON.stringify(
      {
        description: 'Recent Jules sessions (tasks)',
        count: formatted.length,
        sessions: formatted,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://sessions/{id}/full
   * Returns complete session details including activities.
   * @param sessionId - The ID of the session to retrieve.
   * @returns A JSON string representing the full session details.
   */
  async getSessionFull(sessionId: string): Promise<string> {
    // Fetch session and activities in parallel
    const [session, activitiesResponse] = await Promise.all([
      this.client.getSession(sessionId),
      this.client.listActivities(sessionId),
    ]);

    // Format activities for readability
    const formattedActivities = activitiesResponse.activities.map(
      (activity) => {
        const base = {
          type: activity.type,
          timestamp: activity.timestamp,
        };

        // Add type-specific details
        if (activity.planGenerated) {
          return {
            ...base,
            plan: activity.planGenerated.plan,
            changesPreview: activity.planGenerated.changeSet
              ? `${activity.planGenerated.changeSet.changes?.length || 0} files`
              : 'No changes',
          };
        }

        if (activity.progressUpdated) {
          return {
            ...base,
            message: activity.progressUpdated.message,
            percentage: activity.progressUpdated.percentage,
          };
        }

        if (activity.sessionCompleted) {
          return {
            ...base,
            success: activity.sessionCompleted.success,
            message: activity.sessionCompleted.message,
            pullRequestUrl: activity.sessionCompleted.pullRequestUrl,
          };
        }

        return base;
      }
    );

    return JSON.stringify(
      {
        session: {
          id: session.id,
          title: session.title,
          state: session.state,
          prompt: session.prompt,
          repository: session.sourceContext.source,
          branch:
            session.sourceContext.githubRepoContext?.startingBranch || 'main',
          automationMode: session.automationMode,
          requirePlanApproval: session.requirePlanApproval,
          created: session.createTime,
          updated: session.updateTime,
        },
        activities: formattedActivities,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://schedules
   * Returns all locally-managed scheduled tasks.
   * @returns A JSON string representing all scheduled tasks.
   */
  async getSchedules(): Promise<string> {
    const tasks = await this.storage.listTasks();

    const formatted = tasks.map((task) => {
      const nextRun = this.scheduler.getNextInvocation(task.id);
      return {
        id: task.id,
        name: task.name,
        cron: task.cron,
        enabled: task.enabled,
        repository: task.taskPayload.source,
        prompt: smartTruncate(task.taskPayload.prompt, 80),
        nextRun: nextRun?.toISOString() || 'Not scheduled',
        lastRun: task.lastRun || 'Never',
        lastSessionId: task.lastSessionId,
      };
    });

    return JSON.stringify(
      {
        description: 'Locally-managed scheduled Jules tasks',
        count: formatted.length,
        schedules: formatted,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://schedules/history
   * Returns execution history of scheduled tasks.
   * @returns A JSON string representing the execution history of scheduled tasks.
   */
  async getScheduleHistory(): Promise<string> {
    const tasks = await this.storage.listTasks();

    const history = tasks
      .filter((task) => task.lastRun)
      .sort(
        (a, b) =>
          new Date(b.lastRun!).getTime() - new Date(a.lastRun!).getTime()
      )
      .map((task) => ({
        taskName: task.name,
        executedAt: task.lastRun,
        sessionId: task.lastSessionId,
        prompt: smartTruncate(task.taskPayload.prompt, 100),
      }));

    return JSON.stringify(
      {
        description: 'Execution history of scheduled tasks',
        count: history.length,
        history,
      },
      null,
      2
    );
  }
}
