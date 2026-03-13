/**
 * MCP Resources - Read-only context exposure for the LLM
 * Resources provide "grounding" - helping the LLM understand the current state
 */

import type { JulesClient } from '../api/jules-client.js';
import type { ScheduleStorage } from '../storage/schedule-store.js';
import type { CronEngine } from '../scheduler/cron-engine.js';
import type { Activity, ChangeSet, Session } from '../types/jules-api.js';
import { smartTruncate } from '../utils/security.js';

/**
 * Manages the exposure of Jules resources via the MCP protocol.
 */
export class JulesResources {
  /**
   * Creates an instance of JulesResources.
   *
   * @param client - The Jules API client used to fetch resource data.
   * @param storage - The storage engine used for accessing scheduled task data.
   * @param scheduler - The cron engine used to retrieve next execution times.
   */
  constructor(
    private readonly client: JulesClient,
    private readonly storage: ScheduleStorage,
    private readonly scheduler: CronEngine
  ) {}

  /**
   * Returns a normalized repository label.
   * @param session - Session payload from the Jules API.
   * @returns Repository resource name or a repoless label.
   */
  private getRepositoryLabel(session: Session): string {
    return session.sourceContext?.source || 'repoless';
  }

  /**
   * Returns all pull request URLs exposed on session outputs.
   * @param session - Session payload from the Jules API.
   * @returns Pull request metadata from the session outputs.
   */
  private getPullRequests(session: Session): {
    url: string;
    title?: string;
    description?: string;
  }[] {
    return (session.outputs || [])
      .flatMap((output) => (output.pullRequest ? [output.pullRequest] : []));
  }

  /**
   * Finds the most recent change set attached to session activities.
   * @param activities - Activity list in chronological order.
   * @returns The latest change set and its source activity, if available.
   */
  private getLatestChangeSet(activities: Activity[]): {
    changeSet?: ChangeSet;
    activityType?: Activity['type'];
    timestamp?: string;
  } {
    for (let index = activities.length - 1; index >= 0; index -= 1) {
      const activity = activities[index];
      const changeSet =
        activity.sessionCompleted?.changeSet || activity.planGenerated?.changeSet;

      if (changeSet) {
        return {
          changeSet,
          activityType: activity.type,
          timestamp: activity.timestamp,
        };
      }
    }

    return {};
  }

  /**
   * Resource: jules://sources
   * Returns a list of all connected GitHub repositories. This provides grounding for
   * the LLM to know what repositories are available for tasks.
   *
   * @returns {Promise<string>} A JSON string representing the connected sources.
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
        description: 'Connected GitHub repositories available for Jules tasks. Note: For safe integration from AI agents (OpenClaw/Codex), always use require_plan_approval: true when targeting these repos.',
        count: formatted.length,
        sources: formatted,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://sessions/list
   * Returns a summary of recent sessions. This gives the LLM context of what
   * tasks have been run recently.
   *
   * @returns {Promise<string>} A JSON string representing a summary of recent sessions.
   */
  async getSessionsList(): Promise<string> {
    const response = await this.client.listSessions(50);

    const formatted = response.sessions.map((session) => ({
      id: session.id,
      title: session.title || 'Untitled Task',
      state: session.state || 'UNKNOWN',
      prompt: smartTruncate(session.prompt, 100),
      repository: this.getRepositoryLabel(session),
      created: session.createTime,
    }));

    return JSON.stringify(
      {
        description: 'Recent Jules sessions (tasks). Be mindful of API quotas when querying session history frequently.',
        count: formatted.length,
        sessions: formatted,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://sessions/{id}/activities
   * Returns raw activity log for a specific session.
   *
   * @param sessionId - The ID of the session.
   * @returns {Promise<string>} A JSON string representing the activities.
   */
  async getSessionActivities(sessionId: string): Promise<string> {
    const response = await this.client.listActivities(sessionId);
    return JSON.stringify(
      {
        sessionId,
        count: response.activities.length,
        activities: response.activities,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://sessions/{id}/full
   * Returns complete session details including activities. This allows the LLM
   * to review plans generated by Jules, monitor progress, and get pull request URLs.
   *
   * @param sessionId - The ID of the session to retrieve.
   * @returns {Promise<string>} A JSON string representing the full session details.
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
          media: activity.media,
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
            changeSet: activity.sessionCompleted.changeSet,
          };
        }

        if (activity.messageSent) {
          return {
            ...base,
            prompt: activity.messageSent.prompt,
            sender: activity.messageSent.sender,
          };
        }

        if (activity.agentMessaged) {
          return {
            ...base,
            message: activity.agentMessaged.message,
          };
        }

        if (activity.planApproved) {
          return {
            ...base,
            approvedAt: activity.planApproved.approvedAt,
          };
        }

        return base;
      }
    );

    const pullRequests = this.getPullRequests(session);

    return JSON.stringify(
      {
        session: {
          id: session.id,
          title: session.title,
          state: session.state,
          prompt: session.prompt,
          url: session.url,
          repository: this.getRepositoryLabel(session),
          branch:
            session.sourceContext?.githubRepoContext?.startingBranch || 'main',
          automationMode: session.automationMode,
          requirePlanApproval: session.requirePlanApproval,
          created: session.createTime,
          updated: session.updateTime,
          pullRequests,
        },
        activities: formattedActivities,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://sessions/{id}/diff
   * Returns the latest change set surfaced by Jules for the session.
   *
   * @param sessionId - The ID of the session to inspect.
   * @returns {Promise<string>} A JSON string representing the latest patch and file-level changes.
   */
  async getSessionDiff(sessionId: string): Promise<string> {
    const response = await this.client.listActivities(sessionId);
    const latest = this.getLatestChangeSet(response.activities);

    if (!latest.changeSet) {
      return JSON.stringify(
        {
          sessionId,
          message:
            'No changeSet is available yet. The session may still be in progress or has not produced a diff.',
        },
        null,
        2
      );
    }

    return JSON.stringify(
      {
        sessionId,
        activityType: latest.activityType,
        timestamp: latest.timestamp,
        patch: latest.changeSet.patch,
        fileCount: latest.changeSet.changes?.length || 0,
        changes: latest.changeSet.changes || [],
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://schedules
   * Returns all locally-managed scheduled tasks. This lets the LLM know what
   * tasks are currently configured to run automatically.
   *
   * @returns {Promise<string>} A JSON string representing all scheduled tasks.
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
        description: 'Locally-managed scheduled Jules tasks. Ensure new schedules are quota-aware (at most once per hour).',
        count: formatted.length,
        schedules: formatted,
      },
      null,
      2
    );
  }

  /**
   * Resource: jules://schedules/history
   * Returns execution history of scheduled tasks. This is useful for auditing
   * and ensuring that automated jobs are running correctly.
   *
   * @returns {Promise<string>} A JSON string representing the execution history of scheduled tasks.
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
