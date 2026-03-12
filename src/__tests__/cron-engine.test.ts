import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronEngine } from '../scheduler/cron-engine.js';
import { ScheduleStorage } from '../storage/schedule-store.js';
import { JulesClient } from '../api/jules-client.js';
import type { ScheduledTask } from '../types/schedule.js';
import { randomUUID } from 'crypto';
import schedule from 'node-schedule';

vi.mock('../storage/schedule-store.js');
vi.mock('../api/jules-client.js');

describe('CronEngine', () => {
  let storage: ScheduleStorage;
  let client: JulesClient;
  let engine: CronEngine;
  let mockLogger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new ScheduleStorage();
    client = new JulesClient();
    mockLogger = vi.fn();
    engine = new CronEngine(storage, client, mockLogger);
  });

  describe('isQuotaAwareSchedule', () => {
    it('should return false for schedules more frequent than once an hour (e.g. every minute)', () => {
      // "* * * * *" runs every minute
      expect(CronEngine.isQuotaAwareSchedule('* * * * *')).toBe(false);
    });

    it('should return false for schedules more frequent than once an hour (e.g. every 30 minutes)', () => {
      // "*/30 * * * *" runs every 30 minutes
      expect(CronEngine.isQuotaAwareSchedule('*/30 * * * *')).toBe(false);
    });

    it('should return true for hourly schedules', () => {
      // "0 * * * *" runs once every hour
      expect(CronEngine.isQuotaAwareSchedule('0 * * * *')).toBe(true);
    });

    it('should return true for daily schedules', () => {
      // "0 0 * * *" runs once every day
      expect(CronEngine.isQuotaAwareSchedule('0 0 * * *')).toBe(true);
    });

    it('should return true for weekly schedules', () => {
      // "0 9 * * 1" runs once a week
      expect(CronEngine.isQuotaAwareSchedule('0 9 * * 1')).toBe(true);
    });

    it('should return false for invalid cron expressions', () => {
      expect(CronEngine.isQuotaAwareSchedule('invalid_cron')).toBe(false);
    });

    it('should correctly handle 6-part cron expressions (with seconds)', () => {
      // "0 * * * * *" runs every minute at the 0th second (too frequent)
      expect(CronEngine.isQuotaAwareSchedule('0 * * * * *')).toBe(false);

      // "0 0 * * * *" runs every hour at the 0th minute and 0th second (safe)
      expect(CronEngine.isQuotaAwareSchedule('0 0 * * * *')).toBe(true);
    });
  });

  describe('scheduleTask', () => {
    it('should throw an error if the schedule is too frequent', () => {
      const task: ScheduledTask = {
        id: randomUUID(),
        name: 'test-frequent-task',
        cron: '* * * * *', // Every minute
        taskPayload: {
          prompt: 'test',
          source: 'sources/github/owner/repo',
          automationMode: 'AUTO_CREATE_PR',
        },
        createdAt: new Date().toISOString(),
        enabled: true,
      };

      expect(() => engine.scheduleTask(task)).toThrowError(/is too frequent/);
    });

    it('should schedule correctly if the schedule is quota-aware', () => {
      const task: ScheduledTask = {
        id: randomUUID(),
        name: 'test-valid-task',
        cron: '0 0 * * *', // Daily
        taskPayload: {
          prompt: 'test',
          source: 'sources/github/owner/repo',
          automationMode: 'AUTO_CREATE_PR',
        },
        createdAt: new Date().toISOString(),
        enabled: true,
      };

      const spyCancel = vi.spyOn(engine, 'cancelTask');
      const spySchedule = vi.spyOn(schedule, 'scheduleJob');

      expect(() => engine.scheduleTask(task)).not.toThrow();
      expect(spyCancel).toHaveBeenCalledWith(task.id);
      expect(spySchedule).toHaveBeenCalled();
    });
  });
});
