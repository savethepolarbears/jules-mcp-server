import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { JulesTools } from "../mcp/tools.js";
import { JulesClient } from "../api/jules-client.js";
import { ScheduleStorage } from "../storage/schedule-store.js";
import { CronEngine } from "../scheduler/cron-engine.js";
import { SecurityError } from "../utils/security.js";
import type { RateLimiter } from "../utils/security.js";
import { z } from "zod";
import type { Session } from "../types/jules-api.js";
import type { ScheduledTask } from "../types/schedule.js";

vi.mock("../api/jules-client.js");
vi.mock("../storage/schedule-store.js");
vi.mock("../scheduler/cron-engine.js");
vi.mock("../utils/security.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    RepositoryValidator: {
      validateRepository: vi.fn(),
      initialize: vi.fn(),
    },
  };
});

// ─── helpers ────────────────────────────────────────────────────────────
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-abc",
    state: "COMPLETED",
    prompt: "test prompt",
    createTime: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Session;
}

function makeScheduledTask(
  overrides: Partial<ScheduledTask> = {},
): ScheduledTask {
  return {
    id: "task-1",
    name: "weekly-update",
    cron: "0 0 * * 1",
    taskPayload: {
      prompt: "run weekly update",
      source: "sources/github/owner/repo",
      automationMode: "AUTO_CREATE_PR",
    },
    createdAt: "2026-01-01T00:00:00Z",
    enabled: true,
    ...overrides,
  };
}

// ─── suite ──────────────────────────────────────────────────────────────
describe("JulesTools", () => {
  let tools: JulesTools;
  let client: JulesClient;
  let storage: ScheduleStorage;
  let scheduler: CronEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    const sec = await import("../utils/security.js");
    (sec.RepositoryValidator.validateRepository as Mock).mockReset();

    client = new JulesClient("test-key");
    storage = new ScheduleStorage();
    scheduler = new CronEngine(storage, client);
    vi.mocked(CronEngine.validateCronExpression).mockImplementation(
      (cron) => cron !== "- - - - -",
    );
    tools = new JulesTools(client, storage, scheduler);
  });

  // ── executeWithErrorHandling ──────────────────────────────────────────

  describe("executeWithErrorHandling", () => {
    it("SecurityError message passes through", async () => {
      const sec = await import("../utils/security.js");
      (sec.RepositoryValidator.validateRepository as Mock).mockImplementation(
        () => {
          throw new SecurityError("Security Error: repo not allowed");
        },
      );

      const result = await tools.createCodingTask({
        prompt: "test prompt long enough",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });

      const parsed: { success: boolean; error: string } = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Security Error: repo not allowed");
    });

    it("RateLimitError message passes through", async () => {
      // Force the rate limiter to deny requests
      const limiterField = tools as unknown as { rateLimiter: RateLimiter };
      limiterField.rateLimiter.isAllowed = vi.fn().mockReturnValue(false);

      const result = await tools.createCodingTask({
        prompt: "test prompt long enough",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });

      const parsed: { success: boolean; error: string } = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Rate limit exceeded");
    });

    it("ZodError message passes through", async () => {
      // Access the private helper through a type-safe cast
      const toolsPrivate = tools as unknown as {
        executeWithErrorHandling: <T>(
          operation: () => Promise<T>,
          successTransform?: (result: T) => Record<string, unknown>,
        ) => Promise<string>;
      };

      const result = await toolsPrivate.executeWithErrorHandling(() => {
        const schema = z.string().min(10);
        schema.parse("short");
        return Promise.resolve("unreachable");
      });

      const parsed: { success: boolean; error: string } = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain(">=10 characters");
    });

    it("Arbitrary Error returns generic message", async () => {
      vi.mocked(client.createSession).mockRejectedValue(
        new Error("Internal Database Error"),
      );

      const result = await tools.createCodingTask({
        prompt: "test prompt long enough",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });

      const parsed: { success: boolean; error: string } = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(
        "An internal error occurred. Please check server logs.",
      );
    });

    it("console.error is called with just the message string", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      vi.mocked(client.createSession).mockRejectedValue(
        new Error("Connection failed"),
      );

      await tools.createCodingTask({
        prompt: "test prompt long enough",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Tool execution error: Connection failed",
      );
      consoleSpy.mockRestore();
    });
  });

  // ── createRepolessTask ──────────────────────────────────────────────────

  describe("createRepolessTask", () => {

    it("handles API failure correctly via executeWithErrorHandling", async () => {
      vi.mocked(client.createSession).mockRejectedValue(new Error("API Down"));

      const resultStr = await tools.createRepolessTask({
        prompt: "test prompt",
      });

      const parsed = JSON.parse(resultStr);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("An internal error occurred. Please check server logs.");
    });

    it("creates a repoless task and returns formatted response", async () => {
      vi.mocked(client.createSession).mockResolvedValue({
        id: "sess-1",
        name: "sessions/sess-1",
        prompt: "test",
        state: "QUEUED",
      });

      const resultStr = await tools.createRepolessTask({
        prompt: "test prompt long enough",
      });
      const parsed = JSON.parse(resultStr);

      expect(parsed.sessionId).toBe("sess-1");
      expect(parsed.state).toBe("QUEUED");
      expect(client.createSession).toHaveBeenCalledWith({
        prompt: "test prompt long enough",
      });
    });

    it("denies if rate limited", async () => {
      const rl = (tools as unknown as { rateLimiter: RateLimiter }).rateLimiter;
      vi.spyOn(rl, "isAllowed").mockReturnValue(false);
      const resultStr = await tools.createRepolessTask({
        prompt: "test test test test",
      });
      const parsed = JSON.parse(resultStr);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Rate limit exceeded");
      vi.spyOn(rl, "isAllowed").mockReturnValue(true);
    });
  });

  // ── createCodingTask ──────────────────────────────────────────────────

  describe("createCodingTask", () => {

    it("maps auto_create_pr and require_plan_approval correctly", async () => {
      vi.mocked(client.createSession).mockResolvedValue(
        makeSession({ id: "sess-new", state: "QUEUED" }),
      );

      await tools.createCodingTask({
        prompt: "implement feature X",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: true,
      });

      expect(client.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          automationMode: "AUTO_CREATE_PR",
          requirePlanApproval: true,
        })
      );

      await tools.createCodingTask({
        prompt: "implement feature X",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: false,
        require_plan_approval: false,
      });

      expect(client.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          automationMode: "AUTOMATION_MODE_UNSPECIFIED",
          requirePlanApproval: false,
        })
      );
    });

    it("handles API failure correctly via executeWithErrorHandling for createCodingTask", async () => {
      vi.mocked(client.createSession).mockRejectedValue(new Error("API Down"));

      const resultStr = await tools.createCodingTask({
        prompt: "test prompt long enough",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });

      const parsed = JSON.parse(resultStr);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("An internal error occurred. Please check server logs.");
    });

    it("returns session details on success", async () => {
      vi.mocked(client.createSession).mockResolvedValue(
        makeSession({ id: "sess-new", state: "QUEUED" }),
      );

      const result = await tools.createCodingTask({
        prompt: "implement feature X",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.sessionId).toBe("sess-new");
    });
  });

  // ── createRepolessTask ────────────────────────────────────────────────

  describe("createRepolessTask", () => {
    it("returns session details on success", async () => {
      vi.mocked(client.createSession).mockResolvedValue(
        makeSession({ id: "sess-repoless", state: "QUEUED" }),
      );

      const result = await tools.createRepolessTask({
        prompt: "generate a helpful script",
      });

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.sessionId).toBe("sess-repoless");
    });
  });

  // ── manageSession ─────────────────────────────────────────────────────

  describe("manageSession", () => {
    it("approve_plan returns success", async () => {
      vi.mocked(client.approvePlan).mockResolvedValue(
        makeSession({ state: "IN_PROGRESS" }),
      );

      const result = await tools.manageSession({
        session_id: "sess-1",
        action: "approve_plan",
      });

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.newState).toBe("IN_PROGRESS");
    });

    it("send_message with a message", async () => {
      vi.mocked(client.sendMessage).mockResolvedValue({
        id: "1",
        name: "1",
        prompt: "test",
        state: "IN_PROGRESS",
      });

      const resultStr = await tools.manageSession({
        session_id: "sess-1",
        action: "send_message",
        message: "Here is some feedback",
      });
      const parsed = JSON.parse(resultStr);

      expect(client.sendMessage).toHaveBeenCalledWith("sess-1", {
        prompt: "Here is some feedback",
      });
      expect(parsed.message).toBe("Feedback sent to session");
      expect(parsed.newState).toBe("IN_PROGRESS");
    });

    it("send_message without message throws", async () => {
      const resultStr = await tools.manageSession({
        session_id: "sess-1",
        action: "send_message",
      });
      const parsed = JSON.parse(resultStr);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(
        "An internal error occurred. Please check server logs.",
      );
    });

    it("throws on invalid action", async () => {
      const resultStr = await tools.manageSession({
        session_id: "sess-1",
        // @ts-expect-error Testing invalid action behavior
        action: "invalid_action",
      });
      const parsed = JSON.parse(resultStr);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(
        "An internal error occurred. Please check server logs.",
      );
    });

    it("reject_plan returns canceled state", async () => {
      vi.mocked(client.rejectPlan).mockResolvedValue({});

      const result = await tools.manageSession({
        session_id: "sess-1",
        action: "reject_plan",
      });

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.newState).toBe("CANCELED");
    });
  });

  // ── getSessionStatus ──────────────────────────────────────────────────

  describe("getSessionStatus", () => {
    it("returns formatted status with nextSteps", async () => {
      vi.mocked(client.getSession).mockResolvedValue(
        makeSession({
          id: "sess-status",
          state: "AWAITING_PLAN_APPROVAL",
          title: "My Task",
        }),
      );

      const result = await tools.getSessionStatus({
        session_id: "sess-status",
      });
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.state).toBe("AWAITING_PLAN_APPROVAL");
      expect(parsed.nextSteps).toBeDefined();
    });
  });

  // ── waitForSession ────────────────────────────────────────────────────

  describe("waitForSession", () => {

    it("throws error for polling failure on Jules API", async () => {
      vi.mocked(client.getSession).mockRejectedValue(new Error("Polling API Error"));

      const resultStr = await tools.waitForSession({
        session_id: "sess-1",
        timeout_seconds: 30,
        poll_interval_seconds: 5,
        target_states: ["COMPLETED"],
      });

      const parsed = JSON.parse(resultStr);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("An internal error occurred. Please check server logs.");
    });

    it("resolves when target state reached", async () => {
      const toolsPrivate = tools as unknown as {
        delay: (ms: number) => Promise<void>;
      };
      vi.spyOn(toolsPrivate, "delay").mockResolvedValue(undefined);

      vi.mocked(client.getSession)
        .mockResolvedValueOnce(makeSession({ id: "sess-1", state: "PLANNING" }))
        .mockResolvedValueOnce(
          makeSession({ id: "sess-1", state: "COMPLETED" }),
        );

      const result = await tools.waitForSession({
        session_id: "sess-1",
        timeout_seconds: 60,
        poll_interval_seconds: 1,
        target_states: ["COMPLETED"],
      });

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.finalState).toBe("COMPLETED");
      expect(client.getSession).toHaveBeenCalledTimes(2);
    });

    it("throws timeout when state never reached", async () => {
      vi.useFakeTimers();
      const toolsPrivate = tools as unknown as {
        delay: (ms: number) => Promise<void>;
      };
      vi.spyOn(toolsPrivate, "delay").mockImplementation((ms: number) => {
        vi.advanceTimersByTime(ms);
        return Promise.resolve();
      });

      vi.mocked(client.getSession).mockResolvedValue(
        makeSession({ id: "sess-1", state: "IN_PROGRESS" }),
      );

      const result = await tools.waitForSession({
        session_id: "sess-1",
        timeout_seconds: 30,
        poll_interval_seconds: 5,
        target_states: ["COMPLETED"],
      });

      const parsed: { success: boolean; error: string } = JSON.parse(result);
      expect(parsed.success).toBe(false);

      vi.useRealTimers();
    });
  });

  // ── scheduleRecurringTask ─────────────────────────────────────────────

  describe("scheduleRecurringTask", () => {

    it("maps auto_create_pr and require_plan_approval to payload correctly", async () => {
      vi.mocked(CronEngine.validateCronExpression).mockReturnValue(true);
      vi.mocked(storage.getTaskByName).mockResolvedValue(undefined);

      await tools.scheduleRecurringTask({
        task_name: "test task mapping",
        cron_expression: "0 9 * * 1",
        prompt: "update dependencies in repo",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: true,
      });

      expect(storage.upsertTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskPayload: expect.objectContaining({
            automationMode: "AUTO_CREATE_PR",
            requirePlanApproval: true,
          })
        })
      );
    });

    it("creates and schedules a task", async () => {
      vi.mocked(CronEngine.validateCronExpression).mockReturnValue(true);
      vi.mocked(storage.getTaskByName).mockResolvedValue(undefined);
      vi.mocked(scheduler.getNextInvocation).mockReturnValue(
        new Date("2026-02-01"),
      );

      const result = await tools.scheduleRecurringTask({
        task_name: "weekly deps",
        cron_expression: "0 9 * * 1",
        prompt: "update dependencies in repo",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.message).toContain("scheduled successfully");
      expect(storage.upsertTask).toHaveBeenCalled();
      expect(scheduler.scheduleTask).toHaveBeenCalled();
      expect(parsed.message).toContain("scheduled successfully");
      expect(parsed.scheduleId).toBeDefined();
    });

    it("rejects invalid cron expression", async () => {
      const resultStr = await tools.scheduleRecurringTask({
        task_name: "bad-cron",
        cron_expression: "- - - - -",
        prompt: "Long enough prompt",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });
      const parsed = JSON.parse(resultStr);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(
        "An internal error occurred. Please check server logs.",
      );
    });

    it("rejects duplicate task name", async () => {
      vi.mocked(CronEngine.validateCronExpression).mockReturnValue(true);
      vi.mocked(storage.getTaskByName).mockResolvedValue(makeScheduledTask());

      const result = await tools.scheduleRecurringTask({
        task_name: "weekly-update",
        cron_expression: "0 9 * * 1",
        prompt: "update dependencies in repo",
        source: "sources/github/owner/repo",
        branch: "main",
        auto_create_pr: true,
        require_plan_approval: false,
      });

      const parsed: { success: boolean; error: string } = JSON.parse(result);
      expect(parsed.success).toBe(false);
    });
  });

  // ── deleteSchedule ────────────────────────────────────────────────────

  describe("deleteSchedule", () => {
    it("deletes an existing schedule", async () => {
      vi.mocked(storage.getTaskByName).mockResolvedValue(makeScheduledTask());

      const result = await tools.deleteSchedule({ task_name: "weekly-update" });
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.message).toContain("deleted successfully");
      expect(scheduler.cancelTask).toHaveBeenCalledWith("task-1");
      expect(storage.deleteTask).toHaveBeenCalledWith("task-1");
    });

    it("returns error for unknown schedule", async () => {
      vi.mocked(storage.getTaskByName).mockResolvedValue(undefined);

      const result = await tools.deleteSchedule({ task_name: "nonexistent" });
      const parsed: { success: boolean; error: string } = JSON.parse(result);
      expect(parsed.success).toBe(false);
    });
  });

  // ── listSchedules ─────────────────────────────────────────────────────

  describe("listSchedules", () => {
    it("returns formatted list", async () => {
      vi.mocked(storage.listTasks).mockResolvedValue([makeScheduledTask()]);
      vi.mocked(scheduler.getNextInvocation).mockReturnValue(null);

      const result = await tools.listSchedules();
      const parsed = JSON.parse(result) as {
        count: number;
        schedules: unknown[];
      };
      expect(parsed.count).toBe(1);
      expect(parsed.schedules).toHaveLength(1);
    });
  });

  // ── deleteSession ─────────────────────────────────────────────────────

  describe("deleteSession", () => {
    it("reports canceled for active sessions", async () => {
      vi.mocked(client.getSession).mockResolvedValue(
        makeSession({ id: "sess-active", state: "IN_PROGRESS" }),
      );
      vi.mocked(client.deleteSession).mockResolvedValue({});

      const result = await tools.deleteSession({ session_id: "sess-active" });
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.message).toContain("canceled");
    });

    it("reports deleted for completed sessions", async () => {
      vi.mocked(client.getSession).mockResolvedValue(
        makeSession({ id: "sess-done", state: "COMPLETED" }),
      );
      vi.mocked(client.deleteSession).mockResolvedValue({});

      const result = await tools.deleteSession({ session_id: "sess-done" });
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.message).toContain("deleted");
    });
  });

  // ── getSourceDetails ──────────────────────────────────────────────────

  describe("getSourceDetails", () => {
    it("returns source info", async () => {
      vi.mocked(client.getSource).mockResolvedValue({
        name: "sources/github/owner/repo",
        githubRepo: {
          owner: "owner",
          repo: "repo",
          defaultBranch: "main",
          htmlUrl: "https://github.com/owner/repo",
        },
      });

      const result = await tools.getSourceDetails({
        source_name: "sources/github/owner/repo",
      });
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed.repository).toBe("owner/repo");
    });
  });

  // ── getActivitiesSince ────────────────────────────────────────────────

  describe("getActivitiesSince", () => {
    it("returns activities for session", async () => {
      vi.mocked(client.listActivitiesSince).mockResolvedValue({
        activities: [
          {
            type: "PLAN_GENERATED",
            name: "activities/1",
            timestamp: "2026-01-01T00:00:00Z",
          },
        ],
      });

      const result = await tools.getActivitiesSince({
        session_id: "sess-1",
        since: "2025-12-31T00:00:00Z",
      });
      const parsed = JSON.parse(result) as { count: number };
      expect(parsed.count).toBe(1);
    });
  });
});
