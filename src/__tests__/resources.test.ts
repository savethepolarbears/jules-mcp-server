import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JulesResources } from '../mcp/resources.js';
import type { JulesClient } from '../api/jules-client.js';
import type { ScheduleStorage } from '../storage/schedule-store.js';
import type { CronEngine } from '../scheduler/cron-engine.js';

describe('JulesResources', () => {
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

  it('getSessionsList returns formatted sessions', async () => {
    (clientMock.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [
        {
          id: 'abc123',
          title: 'Test Task',
          state: 'COMPLETED',
          prompt: 'Fix the bug',
          sourceContext: { source: 'sources/github/owner/repo' },
          createTime: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const result = JSON.parse(await resources.getSessionsList());
    expect(result.count).toBe(1);
    expect(result.sessions[0].id).toBe('abc123');
    expect(result.sessions[0].repository).toBe('sources/github/owner/repo');
  });

  it('getSessionsList uses repoless label when sourceContext is absent', async () => {
    (clientMock.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [
        {
          id: 'def456',
          prompt: 'Generate a script',
          state: 'COMPLETED',
        },
      ],
    });

    const result = JSON.parse(await resources.getSessionsList());
    expect(result.sessions[0].repository).toBe('repoless');
  });

  it('getSchedules returns empty list when no tasks', async () => {
    const result = JSON.parse(await resources.getSchedules());
    expect(result.count).toBe(0);
    expect(result.schedules).toEqual([]);
  });
});
