import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JulesResources } from '../mcp/resources.js';
import type { JulesClient } from '../api/jules-client.js';
import type { ScheduleStorage } from '../storage/schedule-store.js';
import type { CronEngine } from '../scheduler/cron-engine.js';
import type { Activity } from '../types/jules-api.js';

describe('JulesResources — extended coverage', () => {
  let clientMock: JulesClient;
  let storageMock: ScheduleStorage;
  let schedulerMock: CronEngine;
  let resources: JulesResources;

  beforeEach(() => {
    clientMock = {
      listSessions: vi.fn(),
      getSession: vi.fn(),
      listActivities: vi.fn(),
      listSources: vi.fn(),
    } as unknown as JulesClient;

    storageMock = {
      listTasks: vi.fn().mockResolvedValue([]),
    } as unknown as ScheduleStorage;

    schedulerMock = {
      getNextInvocation: vi.fn().mockReturnValue(null),
    } as unknown as CronEngine;

    resources = new JulesResources(clientMock, storageMock, schedulerMock);
  });

  describe('getSources', () => {
    it('returns formatted source list', async () => {
      (clientMock.listSources as ReturnType<typeof vi.fn>).mockResolvedValue({
        sources: [
          {
            name: 'sources/github/owner/repo',
            githubRepo: {
              owner: 'owner',
              repo: 'repo',
              defaultBranch: { displayName: 'main' },
              branches: [{ displayName: 'main' }, { displayName: 'develop' }],
              htmlUrl: 'https://github.com/owner/repo',
            },
          },
        ],
      });

      const result = JSON.parse(await resources.getSources()) as {
        count: number;
        sources: { repository: string; defaultBranch: string; branches: string[] }[];
      };
      expect(result.count).toBe(1);
      expect(result.sources[0].repository).toBe('owner/repo');
      expect(result.sources[0].defaultBranch).toBe('main');
      expect(result.sources[0].branches).toEqual(['main', 'develop']);
    });
  });

  describe('getSessionActivities', () => {
    it('returns activity list', async () => {
      (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
        activities: [{ type: 'planGenerated', timestamp: '2026-01-01T00:00:00Z' }],
      });

      const result = JSON.parse(await resources.getSessionActivities('sess-1')) as { sessionId: string; count: number };
      expect(result.sessionId).toBe('sess-1');
      expect(result.count).toBe(1);
    });
  });

  describe('getSessionFull', () => {
    it('returns combined session and activities', async () => {
      (clientMock.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        title: 'Test Session',
        state: 'COMPLETED',
        prompt: 'fix the tests',
        createTime: '2026-01-01T00:00:00Z',
      });
      (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
        activities: [
          {
            type: 'sessionCompleted',
            timestamp: '2026-01-01T01:00:00Z',
            sessionCompleted: { success: true, message: 'Done' },
          },
        ],
      });

      const result = JSON.parse(await resources.getSessionFull('sess-1')) as { session: { id: string }; activities: unknown[] };
      expect(result.session.id).toBe('sess-1');
      expect(result.activities).toHaveLength(1);
    });

    it('formats modern Jules activity payloads', async () => {
      (clientMock.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        title: 'Test Session',
        state: 'IN_PROGRESS',
        prompt: 'fix the tests',
        createTime: '2026-01-01T00:00:00Z',
      });
      (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
        activities: [
          {
            name: 'activities/plan',
            createTime: '2026-01-01T01:00:00Z',
            originator: 'agent',
            planGenerated: {
              plan: {
                id: 'plan-1',
                steps: [{ title: 'Do the thing', description: 'Details' }],
              },
            },
          },
          {
            name: 'activities/progress',
            createTime: '2026-01-01T01:05:00Z',
            originator: 'agent',
            progressUpdated: {
              title: 'Created branch.',
              description: 'Created branch fix/example.',
            },
          },
        ],
      });

      const result = JSON.parse(await resources.getSessionFull('sess-1')) as {
        activities: { type: string; timestamp: string; stepCount?: number; message?: string }[];
      };
      expect(result.activities[0]).toMatchObject({
        type: 'PLAN_GENERATED',
        timestamp: '2026-01-01T01:00:00Z',
        stepCount: 1,
      });
      expect(result.activities[1]).toMatchObject({
        type: 'PROGRESS_UPDATED',
        message: 'Created branch.',
      });
    });
  });

  describe('getSessionDiff', () => {
    it('returns changeset when available', async () => {
      const activity: Activity = {
        type: 'PLAN_GENERATED',
        name: 'activities/plan-generated-1',
        timestamp: '2026-01-01T00:00:00Z',
        planGenerated: {
          plan: 'Fix the thing',
          changeSet: {
            patch: 'diff --git a/file.ts',
            changes: [{ path: 'file.ts', diff: '@@-1+1@@' }],
          },
        },
      };
      (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
        activities: [activity],
      });

      const result = JSON.parse(await resources.getSessionDiff('sess-1')) as { patch: string; fileCount: number };
      expect(result.patch).toContain('diff --git');
      expect(result.fileCount).toBe(1);
    });

    it('returns artifact-backed git patches from modern activities', async () => {
      (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
        activities: [
          {
            name: 'activities/progress',
            createTime: '2026-01-01T00:00:00Z',
            progressUpdated: { title: 'Updated file' },
            artifacts: [
              {
                changeSet: {
                  gitPatch: {
                    baseCommitId: 'abc123',
                    unidiffPatch: 'diff --git a/file.ts b/file.ts\n@@ -1 +1 @@',
                  },
                },
              },
            ],
          },
        ],
      });

      const result = JSON.parse(await resources.getSessionDiff('sess-1')) as {
        patch: string;
        fileCount: number;
        baseCommitId: string;
      };
      expect(result.patch).toContain('diff --git');
      expect(result.fileCount).toBe(1);
      expect(result.baseCommitId).toBe('abc123');
    });

    it('returns no-changeset message when none available', async () => {
      (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
        activities: [],
      });

      const result = JSON.parse(await resources.getSessionDiff('sess-1')) as { message: string };
      expect(result.message).toContain('No changeSet');
    });
  });

  describe('getScheduleHistory', () => {
    it('returns history sorted by lastRun', async () => {
      (storageMock.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 't1',
          name: 'task-a',
          cron: '0 0 * * *',
          enabled: true,
          lastRun: '2026-01-02T00:00:00Z',
          lastSessionId: 's1',
          taskPayload: { prompt: 'a prompt', source: 'sources/github/o/r', automationMode: 'AUTO_CREATE_PR' },
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 't2',
          name: 'task-b',
          cron: '0 0 * * *',
          enabled: true,
          lastRun: '2026-01-03T00:00:00Z',
          lastSessionId: 's2',
          taskPayload: { prompt: 'b prompt', source: 'sources/github/o/r', automationMode: 'AUTO_CREATE_PR' },
          createdAt: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = JSON.parse(await resources.getScheduleHistory()) as {
        count: number;
        history: { taskName: string; executedAt: string }[];
      };
      expect(result.count).toBe(2);
      // Most recent first
      expect(result.history[0].taskName).toBe('task-b');
    });

    it('filters tasks without lastRun', async () => {
      (storageMock.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 't1',
          name: 'no-run-yet',
          cron: '0 0 * * *',
          enabled: true,
          taskPayload: { prompt: 'test', source: 'sources/github/o/r', automationMode: 'AUTO_CREATE_PR' },
          createdAt: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = JSON.parse(await resources.getScheduleHistory()) as { count: number };
      expect(result.count).toBe(0);
    });
  });
});
