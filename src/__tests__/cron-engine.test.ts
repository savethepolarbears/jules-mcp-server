import { describe, it, expect, vi, beforeEach } from "vitest";
import { CronEngine } from "../scheduler/cron-engine.js";
import { ScheduleStorage } from "../storage/schedule-store.js";
import { JulesClient } from "../api/jules-client.js";
import type { ScheduledTask } from "../types/schedule.js";
import { randomUUID } from "crypto";
import schedule from "node-schedule";

vi.mock("../storage/schedule-store.js");
vi.mock("../api/jules-client.js");

describe("CronEngine", () => {
  let storage: ScheduleStorage;
  let client: JulesClient;
  let engine: CronEngine;
  let mockLogger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new ScheduleStorage();
    client = new JulesClient();
    mockLogger = vi.fn();
    engine = new CronEngine(
      storage,
      client,
      mockLogger as unknown as (message: string) => void,
    );
  });

  describe("isQuotaAwareSchedule", () => {
    it("should return false for schedules more frequent than once an hour (e.g. every minute)", () => {
      // "* * * * *" runs every minute
      expect(CronEngine.isQuotaAwareSchedule("* * * * *")).toBe(false);
    });

    it("should return false for schedules more frequent than once an hour (e.g. every 30 minutes)", () => {
      // "*/30 * * * *" runs every 30 minutes
      expect(CronEngine.isQuotaAwareSchedule("*/30 * * * *")).toBe(false);
    });

    it("should return true for hourly schedules", () => {
      // "0 * * * *" runs once every hour
      expect(CronEngine.isQuotaAwareSchedule("0 * * * *")).toBe(true);
    });

    it("should return true for daily schedules", () => {
      // "0 0 * * *" runs once every day
      expect(CronEngine.isQuotaAwareSchedule("0 0 * * *")).toBe(true);
    });

    it("should return true for weekly schedules", () => {
      // "0 9 * * 1" runs once a week
      expect(CronEngine.isQuotaAwareSchedule("0 9 * * 1")).toBe(true);
    });

    it("should return false for invalid cron expressions", () => {
      expect(CronEngine.isQuotaAwareSchedule("invalid_cron")).toBe(false);
    });

    it("should correctly handle 6-part cron expressions (with seconds)", () => {
      // "0 * * * * *" runs every minute at the 0th second (too frequent)
      expect(CronEngine.isQuotaAwareSchedule("0 * * * * *")).toBe(false);

      // "0 0 * * * *" runs every hour at the 0th minute and 0th second (safe)
      expect(CronEngine.isQuotaAwareSchedule("0 0 * * * *")).toBe(true);
    });

    it("should return false if minute is out of bounds", () => {
      expect(CronEngine.isQuotaAwareSchedule("60 0 * * *")).toBe(false);
      expect(CronEngine.isQuotaAwareSchedule("-1 0 * * *")).toBe(false);
    });
  });

  describe("validateCronExpression", () => {
    it("returns true for valid expression", () => {
      expect(CronEngine.validateCronExpression("0 0 * * *")).toBe(true);
    });
    it("returns false for invalid expression", () => {
      expect(CronEngine.validateCronExpression("invalid")).toBe(false);
    });
  });

  describe("scheduleTask", () => {
    it("should throw an error if the schedule is too frequent", () => {
      const task: ScheduledTask = {
        id: randomUUID(),
        name: "test-frequent-task",
        cron: "* * * * *", // Every minute
        taskPayload: {
          prompt: "test",
          source: "sources/github/owner/repo",
          automationMode: "AUTO_CREATE_PR",
        },
        createdAt: new Date().toISOString(),
        enabled: true,
      };

      expect(() => engine.scheduleTask(task)).toThrowError(/is too frequent/);
    });

    it("should schedule correctly if the schedule is quota-aware", () => {
      const task: ScheduledTask = {
        id: randomUUID(),
        name: "test-valid-task",
        cron: "0 0 * * *", // Daily
        taskPayload: {
          prompt: "test",
          source: "sources/github/owner/repo",
          automationMode: "AUTO_CREATE_PR",
        },
        createdAt: new Date().toISOString(),
        enabled: true,
      };

      const spyCancel = vi.spyOn(engine, "cancelTask");
      const spySchedule = vi.spyOn(schedule, "scheduleJob");

      expect(() => engine.scheduleTask(task)).not.toThrow();
      expect(spyCancel).toHaveBeenCalledWith(task.id);
      expect(spySchedule).toHaveBeenCalled();
    });
  });

  describe("initialize", () => {
    it("should load tasks from storage and schedule them if enabled", async () => {
      const task: ScheduledTask = {
        id: "task-1",
        name: "test-task",
        cron: "0 0 * * *",
        taskPayload: { prompt: "test", source: "sources/github/owner/repo", automationMode: "AUTO_CREATE_PR" },
        createdAt: new Date().toISOString(),
        enabled: true,
      };
      vi.spyOn(storage, "listTasks").mockResolvedValue([task]);
      const spySchedule = vi.spyOn(engine, "scheduleTask");
      await engine.initialize();
      expect(spySchedule).toHaveBeenCalledWith(task);
    });
    
    it("should ignore disabled tasks", async () => {
      const task: ScheduledTask = {
        id: "task-2",
        name: "test-task",
        cron: "0 0 * * *",
        taskPayload: { prompt: "test", source: "sources/github/owner/repo", automationMode: "AUTO_CREATE_PR" },
        createdAt: new Date().toISOString(),
        enabled: false,
      };
      vi.spyOn(storage, "listTasks").mockResolvedValue([task]);
      const spySchedule = vi.spyOn(engine, "scheduleTask");
      await engine.initialize();
      expect(spySchedule).not.toHaveBeenCalled();
    });

    it("should catch scheduling errors during initialization", async () => {
      const task: ScheduledTask = {
        id: "task-3",
        name: "err-task",
        cron: "* * * * *", // Invalid quota
        taskPayload: { prompt: "test", source: "s", automationMode: "AUTO_CREATE_PR" },
        createdAt: new Date().toISOString(),
        enabled: true,
      };
      vi.spyOn(storage, "listTasks").mockResolvedValue([task]);
      await engine.initialize();
      expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining("Failed to schedule err-task"));
    });
  });

  describe("cancelTask and getNextInvocation", () => {
    it("should manage task cancellation and expose next invocation", () => {
      const task: ScheduledTask = {
        id: "123",
        name: "invoke-test",
        cron: "0 0 * * *",
        taskPayload: { prompt: "t", source: "s", automationMode: "AUTO_CREATE_PR" },
        createdAt: new Date().toISOString(),
        enabled: true
      };
      engine.scheduleTask(task);
      expect(engine.getNextInvocation("123")).not.toBeNull();
      engine.cancelTask("123");
      expect(engine.getNextInvocation("123")).toBeNull();
    });
  });

  describe("rescheduleTask and shutdown", () => {
    it("rescheduleTask cancels and schedules again", async () => {
      const task: ScheduledTask = {
        id: "123",
        name: "invoke-test",
        cron: "0 0 * * *",
        taskPayload: { prompt: "t", source: "s", automationMode: "AUTO_CREATE_PR" },
        createdAt: new Date().toISOString(),
        enabled: true
      };
      const spyCancel = vi.spyOn(engine, "cancelTask");
      const spySchedule = vi.spyOn(engine, "scheduleTask");
      await engine.rescheduleTask(task);
      expect(spyCancel).toHaveBeenCalledWith("123");
      expect(spySchedule).toHaveBeenCalledWith(task);
    });

    it("shutdown cancels all and calls gracefulShutdown", () => {
      const task: ScheduledTask = {
        id: "123",
        name: "invoke-test",
        cron: "0 0 * * *",
        taskPayload: { prompt: "t", source: "s", automationMode: "AUTO_CREATE_PR" },
        createdAt: new Date().toISOString(),
        enabled: true
      };
      engine.scheduleTask(task);
      const spyGraceful = vi.spyOn(schedule, "gracefulShutdown");
      engine.shutdown();
      expect(engine.getNextInvocation("123")).toBeNull();
      expect(spyGraceful).toHaveBeenCalled();
    });
  });
});
