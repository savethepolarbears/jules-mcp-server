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

  it('getSources returns formatted sources', async () => {
    (clientMock.listSources as ReturnType<typeof vi.fn>).mockResolvedValue({
      sources: [
        {
          name: 'sources/github/owner/repo',
          githubRepo: {
            owner: 'owner',
            repo: 'repo',
            defaultBranch: 'main',
            htmlUrl: 'https://github.com/owner/repo',
          },
        },
        {
          name: 'sources/unknown',
        }
      ],
    });

    const result = JSON.parse(await resources.getSources());
    expect(result.count).toBe(2);
    expect(result.sources[0].name).toBe('sources/github/owner/repo');
    expect(result.sources[0].repository).toBe('owner/repo');
    expect(result.sources[0].url).toBe('https://github.com/owner/repo');
    expect(result.sources[1].repository).toBe('Unknown');
  });

  it('getSessionActivities returns formatted activities', async () => {
    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
      activities: [
        {
          type: 'PLAN_GENERATED',
          timestamp: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const result = JSON.parse(await resources.getSessionActivities('sess1'));
    expect(result.count).toBe(1);
    expect(result.activities[0].type).toBe('PLAN_GENERATED');
  });

  it('getSessionFull returns complete session with activities formatted correctly', async () => {
    (clientMock.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-full',
      state: 'COMPLETED',
      outputs: [
        {
          pullRequest: {
            url: 'https://github.com/owner/repo/pull/1',
            title: 'Fix issue',
          }
        }
      ]
    });

    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
      activities: [
        {
          type: 'PLAN_GENERATED',
          timestamp: '2026-01-01T00:00:00Z',
          planGenerated: {
            plan: 'Step 1: Code',
            changeSet: { changes: [{ file: 'test.ts' }] }
          }
        },
        {
          type: 'PROGRESS_UPDATED',
          progressUpdated: { message: 'working', percentage: 50 }
        },
        {
          type: 'SESSION_COMPLETED',
          sessionCompleted: { success: true, message: 'done', pullRequestUrl: 'https://github.com/owner/repo/pull/1' }
        },
        {
          type: 'MESSAGE_SENT',
          messageSent: { prompt: 'do this', sender: 'USER' }
        },
        {
          type: 'AGENT_MESSAGED',
          agentMessaged: { message: 'I am doing this' }
        },
        {
          type: 'PLAN_APPROVED',
          planApproved: { approvedAt: '2026-01-01T00:00:00Z' }
        },
        {
          type: 'UNKNOWN_TYPE',
        }
      ],
    });

    const result = JSON.parse(await resources.getSessionFull('sess-full'));
    expect(result.session.id).toBe('sess-full');
    expect(result.session.pullRequests).toHaveLength(1);

    // Check activities mapping
    expect(result.activities).toHaveLength(7);
    expect(result.activities[0].plan).toBe('Step 1: Code');
    expect(result.activities[0].changesPreview).toBe('1 files');
    expect(result.activities[1].message).toBe('working');
    expect(result.activities[2].success).toBe(true);
    expect(result.activities[3].prompt).toBe('do this');
    expect(result.activities[4].message).toBe('I am doing this');
    expect(result.activities[5].approvedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('getSessionFull handles null changes in planGenerated', async () => {
    (clientMock.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-full-2',
      state: 'PLANNING',
    });

    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
      activities: [
        {
          type: 'PLAN_GENERATED',
          planGenerated: {
            plan: 'Step 1: Null changes',
            changeSet: { changes: null }
          }
        },
        {
          type: 'PLAN_GENERATED',
          planGenerated: {
            plan: 'Step 2: No changeset',
          }
        }
      ],
    });

    const result = JSON.parse(await resources.getSessionFull('sess-full-2'));
    expect(result.activities[0].changesPreview).toBe('0 files');
    expect(result.activities[1].changesPreview).toBe('No changes');
  });
});
