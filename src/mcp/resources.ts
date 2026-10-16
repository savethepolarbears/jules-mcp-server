/**
 * MCP Resources - Read-only context exposure for the LLM
 * Resources provide "grounding" - helping the LLM understand the current state
 */

import type { JulesClient } from "../api/jules-client.js";
import type { ScheduleStorage } from "../storage/schedule-store.js";
import type { CronEngine } from "../scheduler/cron-engine.js";
import type { Activity, ChangeSet, Session } from "../types/jules-api.js";
import { smartTruncate, extractBranchName } from "../utils/security.js";

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
    private readonly scheduler: CronEngine,
  ) {}

  /**
   * Returns a normalized repository label.
   * @param session - Session payload from the Jules API.
   * @returns Repository resource name or a repoless label.
   */
  private getRepositoryLabel(session: Session): string {
    return session.sourceContext?.source || "repoless";
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
    return (session.outputs || []).flatMap((output) =>
      output.pullRequest ? [output.pullRequest] : [],
    );
  }

  /**
   * Extracts changed file paths from a unified git diff string.
   * @param unidiff - Unified diff text.
   * @returns Deduplicated array of file change entries.
   */
  private extractChangesFromUnidiff(unidiff?: string): { path: string }[] {
    if (!unidiff) {
      return [];
    }
    const seen = new Set<string>();
    const changes: { path: string }[] = [];
    for (const line of unidiff.split("\n")) {
      const gitMatch = /^diff --git a\/.+ b\/(.+)$/.exec(line.trim());
      if (gitMatch?.[1] && !seen.has(gitMatch[1])) {
        seen.add(gitMatch[1]);
        changes.push({ path: gitMatch[1] });
      }
    }
    return changes;
  }

  /**
   * Infers a normalized activity type label from a raw v1alpha Activity object.
   * @param activity - Raw activity from the Jules API.
   * @returns Normalized activity type string.
   */
  private inferActivityType(activity: Activity): NonNullable<Activity["type"]> {
    if (activity.type) {
      return activity.type;
    }
    if (activity.agentMessaged) return "AGENT_MESSAGED";
    if (activity.userMessaged) return "USER_MESSAGED";
    if (activity.planGenerated) return "PLAN_GENERATED";
    if (activity.progressUpdated) return "PROGRESS_UPDATED";
    if (activity.sessionCompleted) return "SESSION_COMPLETED";
    if (activity.sessionFailed) return "SESSION_FAILED";
    if (activity.planApproved) return "PLAN_APPROVED";
    if (activity.messageSent) return "MESSAGE_SENT";
    return "ACTIVITY_TYPE_UNSPECIFIED";
  }

  /**
   * Finds the most recent change set attached to session activities or v1alpha artifacts.
   * @param activities - Activity list in chronological order.
   * @returns The latest change set, normalized patch, changes list, and source activity metadata.
   */
  private getLatestChangeSet(activities: Activity[]): {
    changeSet?: ChangeSet;
    patch?: string;
    changes: NonNullable<ChangeSet["changes"]>;
    activityType?: Activity["type"];
    timestamp?: string;
  } {
    for (let index = activities.length - 1; index >= 0; index -= 1) {
      const activity = activities[index];

      // 1. Inspect v1alpha top-level activity.artifacts[] (newest artifact first)
      if (Array.isArray(activity.artifacts)) {
        for (
          let artIdx = activity.artifacts.length - 1;
          artIdx >= 0;
          artIdx -= 1
        ) {
          const artifactChangeSet = activity.artifacts[artIdx]?.changeSet;
          const patch =
            artifactChangeSet?.gitPatch?.unidiffPatch ??
            artifactChangeSet?.patch;
          if (
            artifactChangeSet &&
            (patch || artifactChangeSet.changes !== undefined)
          ) {
            const changes = Array.isArray(artifactChangeSet.changes)
              ? artifactChangeSet.changes
              : this.extractChangesFromUnidiff(patch);
            return {
              changeSet: artifactChangeSet,
              patch,
              changes,
              activityType: this.inferActivityType(activity),
              timestamp: activity.createTime || activity.timestamp,
            };
          }
        }
      }

      // 2. Fallback to legacy sessionCompleted.changeSet or planGenerated.changeSet
      const changeSet =
        activity.sessionCompleted?.changeSet ||
        activity.planGenerated?.changeSet;

      if (changeSet) {
        const patch = changeSet.gitPatch?.unidiffPatch ?? changeSet.patch;
        const changes = Array.isArray(changeSet.changes)
          ? changeSet.changes
          : this.extractChangesFromUnidiff(patch);
        return {
          changeSet,
          patch,
          changes,
          activityType:
            activity.type ||
            (activity.sessionCompleted
              ? "SESSION_COMPLETED"
              : "PLAN_GENERATED"),
          timestamp: activity.createTime || activity.timestamp,
        };
      }
    }

    return { changes: [] };
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
    const sources = response.sources || [];

    const formatted = sources.map((source) => ({
      name: source.name,
      repository: source.githubRepo
        ? `${source.githubRepo.owner}/${source.githubRepo.repo}`
        : "Unknown",
      defaultBranch: extractBranchName(source.githubRepo?.defaultBranch),
      url: source.githubRepo?.htmlUrl,
    }));

    return JSON.stringify(
      {
        description:
          "Connected GitHub repositories available for Jules tasks. Note: For safe integration from AI agents (OpenClaw/Codex), always use require_plan_approval: true when targeting these repos.",
        count: formatted.length,
        sources: formatted,
      },
      null,
      2,
    );
  }

  /**
   * Resource: jules://sessions/list
   * Returns a summary of recent sessions. Falls back to the local session ledger
   * if the upstream GET /v1alpha/sessions endpoint returns 503 or times out.
   *
   * @returns {Promise<string>} A JSON string representing a summary of recent sessions.
   */
  async getSessionsList(): Promise<string> {
    try {
      const response = await this.client.listSessions(50);
      const sessions = response.sessions || [];

      const formatted = sessions.map((session) => ({
        id: session.id,
        title: session.title || "Untitled Task",
        state: session.state || "UNKNOWN",
        prompt: smartTruncate(session.prompt, 100),
        repository: this.getRepositoryLabel(session),
        created: session.createTime,
      }));

      for (const item of formatted.slice(0, 25)) {
        await this.storage.recordSession?.({
          id: item.id,
          title: item.title,
          state: item.state,
          prompt: item.prompt,
          repository: item.repository,
          created: item.created,
        });
      }

      return JSON.stringify(
        {
          description:
            "Recent Jules sessions (tasks). Be mindful of API quotas when querying session history frequently.",
          count: formatted.length,
          sessions: formatted,
        },
        null,
        2,
      );
    } catch (error) {
      const ledgerEntries = (await this.storage.listRecentSessions?.()) || [];
      const tasks = (await this.storage.listTasks?.()) || [];
      const seenIds = new Set(ledgerEntries.map((item) => item.id));

      for (const task of tasks) {
        if (task.lastSessionId && !seenIds.has(task.lastSessionId)) {
          seenIds.add(task.lastSessionId);
          ledgerEntries.push({
            id: task.lastSessionId,
            title: task.taskPayload.title || task.name,
            state: "UNKNOWN",
            prompt: task.taskPayload.prompt,
            repository: task.taskPayload.source,
            created: task.lastRun,
          });
        }
      }

      const fallbackSessions = ledgerEntries.map((entry) => ({
        id: entry.id,
        title: entry.title || "Untitled Task",
        state: entry.state || "UNKNOWN",
        prompt: smartTruncate(entry.prompt || "", 100),
        repository: entry.repository || "repoless",
        created: entry.created,
      }));

      return JSON.stringify(
        {
          description:
            "Recent Jules sessions (served from local session ledger because upstream sessions.list returned an error).",
          status: "degraded",
          source: "local_session_ledger",
          error: error instanceof Error ? error.message : "Unknown API failure",
          count: fallbackSessions.length,
          sessions: fallbackSessions,
        },
        null,
        2,
      );
    }
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
    const activities = response.activities || [];
    return JSON.stringify(
      {
        sessionId,
        count: activities.length,
        activities,
      },
      null,
      2,
    );
  }

  /**
   * Formats v1alpha activity artifacts (`changeSet`, `bashOutput`, `media`) for concise LLM consumption.
   * @param activity - Activity containing optional artifacts.
   * @returns Summarized artifacts array or undefined when empty.
   */
  private formatActivityArtifacts(activity: Activity):
    | {
        changeSet?: {
          source?: string;
          baseCommitId?: string;
          suggestedCommitMessage?: string;
          fileCount: number;
          hasPatch: boolean;
        };
        bashOutput?: {
          command?: string;
          exitCode?: number;
          output?: string;
        };
        media?: {
          mimeType?: string;
          url?: string;
          description?: string;
        };
      }[]
    | undefined {
    if (!Array.isArray(activity.artifacts) || activity.artifacts.length === 0) {
      return undefined;
    }

    return activity.artifacts.map((artifact) => {
      const formatted: {
        changeSet?: {
          source?: string;
          baseCommitId?: string;
          suggestedCommitMessage?: string;
          fileCount: number;
          hasPatch: boolean;
        };
        bashOutput?: {
          command?: string;
          exitCode?: number;
          output?: string;
        };
        media?: {
          mimeType?: string;
          url?: string;
          description?: string;
        };
      } = {};

      if (artifact.changeSet) {
        const patch =
          artifact.changeSet.gitPatch?.unidiffPatch ?? artifact.changeSet.patch;
        const changes = Array.isArray(artifact.changeSet.changes)
          ? artifact.changeSet.changes
          : this.extractChangesFromUnidiff(patch);
        formatted.changeSet = {
          source: artifact.changeSet.source,
          baseCommitId: artifact.changeSet.gitPatch?.baseCommitId,
          suggestedCommitMessage:
            artifact.changeSet.gitPatch?.suggestedCommitMessage,
          fileCount: changes.length,
          hasPatch: Boolean(patch),
        };
      }

      if (artifact.bashOutput) {
        formatted.bashOutput = {
          command: artifact.bashOutput.command,
          exitCode: artifact.bashOutput.exitCode,
          output: artifact.bashOutput.output
            ? smartTruncate(artifact.bashOutput.output, 1000)
            : undefined,
        };
      }

      if (artifact.media) {
        formatted.media = {
          mimeType: artifact.media.mimeType,
          url: artifact.media.url,
          description: artifact.media.description,
        };
      }

      return formatted;
    });
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

    await this.storage.recordSession?.({
      id: session.id || sessionId,
      title: session.title,
      state: session.state,
      prompt: session.prompt,
      repository: this.getRepositoryLabel(session),
      created: session.createTime,
      updated: session.updateTime,
    });

    const activities = activitiesResponse.activities || [];

    // Format activities for readability
    const formattedActivities = activities.map((activity) => {
      const artifacts = this.formatActivityArtifacts(activity);
      const base = {
        type: this.inferActivityType(activity),
        timestamp: activity.createTime || activity.timestamp,
        media: activity.media,
        ...(artifacts ? { artifacts } : {}),
      };

      // Add type-specific details
      if (activity.planGenerated) {
        const planObj = activity.planGenerated.plan;
        let planText = "";
        if (typeof planObj === "string") {
          planText = planObj;
        } else if (planObj?.steps && Array.isArray(planObj.steps)) {
          planText = planObj.steps
            .map((s, idx) => {
              const stepNumber = s.index !== undefined ? s.index : idx + 1;
              const title = s.title
                ? `${stepNumber}. ${s.title}`
                : `${stepNumber}. Step`;
              return s.description ? `${title}\n   ${s.description}` : title;
            })
            .join("\n\n");
        }

        return {
          ...base,
          plan: planText,
          structuredPlan:
            typeof planObj === "object" && planObj !== null
              ? planObj
              : undefined,
          changesPreview: activity.planGenerated.changeSet
            ? `${activity.planGenerated.changeSet.changes?.length || 0} files`
            : "No changes",
        };
      }

      if (activity.progressUpdated) {
        return {
          ...base,
          message:
            activity.progressUpdated.message ||
            activity.progressUpdated.description ||
            activity.progressUpdated.title ||
            "",
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

      if (activity.sessionFailed) {
        return {
          ...base,
          reason: activity.sessionFailed.reason,
        };
      }

      if (activity.messageSent) {
        return {
          ...base,
          prompt: activity.messageSent.prompt,
          sender: activity.messageSent.sender,
        };
      }

      if (activity.userMessaged) {
        return {
          ...base,
          userMessage: activity.userMessaged.userMessage,
        };
      }

      if (activity.agentMessaged) {
        return {
          ...base,
          message:
            activity.agentMessaged.agentMessage ||
            activity.agentMessaged.message ||
            "",
        };
      }

      if (activity.planApproved) {
        return {
          ...base,
          approvedAt:
            activity.planApproved.approvedAt ||
            activity.createTime ||
            activity.timestamp,
        };
      }

      return base;
    });

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
            session.sourceContext?.githubRepoContext?.startingBranch || "main",
          automationMode: session.automationMode,
          requirePlanApproval: session.requirePlanApproval,
          created: session.createTime,
          updated: session.updateTime,
          pullRequests,
        },
        activities: formattedActivities,
      },
      null,
      2,
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
    const latest = this.getLatestChangeSet(response.activities || []);

    if (!latest.changeSet) {
      return JSON.stringify(
        {
          sessionId,
          message:
            "No changeSet is available yet. The session may still be in progress or has not produced a diff.",
        },
        null,
        2,
      );
    }

    return JSON.stringify(
      {
        sessionId,
        activityType: latest.activityType,
        timestamp: latest.timestamp,
        source: latest.changeSet.source,
        baseCommitId: latest.changeSet.gitPatch?.baseCommitId,
        suggestedCommitMessage:
          latest.changeSet.gitPatch?.suggestedCommitMessage,
        patch: latest.patch,
        fileCount: latest.changes.length,
        changes: latest.changes,
      },
      null,
      2,
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
        nextRun: nextRun?.toISOString() || "Not scheduled",
        lastRun: task.lastRun || "Never",
        lastSessionId: task.lastSessionId,
      };
    });

    return JSON.stringify(
      {
        description:
          "Locally-managed scheduled Jules tasks. Ensure new schedules are quota-aware (at most once per hour).",
        count: formatted.length,
        schedules: formatted,
      },
      null,
      2,
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
          new Date(b.lastRun!).getTime() - new Date(a.lastRun!).getTime(),
      )
      .map((task) => ({
        taskName: task.name,
        executedAt: task.lastRun,
        sessionId: task.lastSessionId,
        prompt: smartTruncate(task.taskPayload.prompt, 100),
      }));

    return JSON.stringify(
      {
        description: "Execution history of scheduled tasks",
        count: history.length,
        history,
      },
      null,
      2,
    );
  }
}
