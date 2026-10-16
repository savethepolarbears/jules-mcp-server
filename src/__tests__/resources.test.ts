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

  it('getSources handles empty responses without crashing', async () => {
    (clientMock.listSources as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const result = JSON.parse(await resources.getSources());
    expect(result.count).toBe(0);
    expect(result.sources).toEqual([]);
  });

  it('getSessionsList handles empty responses without crashing', async () => {
    (clientMock.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const result = JSON.parse(await resources.getSessionsList());
    expect(result.count).toBe(0);
    expect(result.sessions).toEqual([]);
  });

  it('getSessionActivities handles empty activities in response', async () => {
    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const result = JSON.parse(await resources.getSessionActivities('sess-empty'));
    expect(result.count).toBe(0);
    expect(result.activities).toEqual([]);
  });

  it('getSources extracts displayName from defaultBranch object', async () => {
    (clientMock.listSources as ReturnType<typeof vi.fn>).mockResolvedValue({
      sources: [
        {
          name: 'sources/github/owner/repo',
          githubRepo: {
            owner: 'owner',
            repo: 'repo',
            defaultBranch: { displayName: 'develop' },
            htmlUrl: 'https://github.com/owner/repo',
          },
        },
      ],
    });
    const result = JSON.parse(await resources.getSources());
    expect(result.sources[0].defaultBranch).toBe('develop');
  });

  it('getSessionFull handles v1alpha activities with createTime, agentMessage, and missing type', async () => {
    (clientMock.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-v1alpha',
      state: 'COMPLETED',
    });
    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
      activities: [
        {
          name: 'sessions/sess-v1alpha/activities/act-1',
          createTime: '2026-08-12T18:39:05.760234Z',
          originator: 'agent',
          agentMessaged: { agentMessage: 'I have run the project test suite' },
          id: 'act-1',
        },
      ],
    });
    const result = JSON.parse(await resources.getSessionFull('sess-v1alpha'));
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].type).toBe('AGENT_MESSAGED');
    expect(result.activities[0].timestamp).toBe('2026-08-12T18:39:05.760234Z');
    expect(result.activities[0].message).toBe('I have run the project test suite');
  });

  it('getSessionDiff handles empty activities response gracefully', async () => {
    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const result = JSON.parse(await resources.getSessionDiff('sess-empty-diff'));
    expect(result.sessionId).toBe('sess-empty-diff');
    expect(result.message).toContain('No changeSet is available yet');
  });

  it('getSessionFull preserves step descriptions and structuredPlan in planGenerated activities', async () => {
    (clientMock.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-plan-detail',
      state: 'AWAITING_PLAN_APPROVAL',
    });
    const structuredPlan = {
      id: 'plan-101',
      steps: [
        {
          id: 'step-1',
          index: 1,
          title: 'Audit API surface',
          description: 'Inspect live endpoints and check for parameter mismatches.',
        },
        {
          id: 'step-2',
          index: 2,
          title: 'Implement unit tests',
          description: 'Add regression tests in vitest for pagination and error handling.',
        },
      ],
    };
    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
      activities: [
        {
          name: 'sessions/sess-plan-detail/activities/act-plan',
          createTime: '2026-08-12T19:00:00Z',
          originator: 'agent',
          planGenerated: {
            plan: structuredPlan,
            changeSet: { changes: [{ path: 'src/api.ts' }] },
          },
        },
      ],
    });
    const result = JSON.parse(await resources.getSessionFull('sess-plan-detail'));
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].plan).toContain('1. Audit API surface');
    expect(result.activities[0].plan).toContain('Inspect live endpoints and check for parameter mismatches.');
    expect(result.activities[0].plan).toContain('2. Implement unit tests');
    expect(result.activities[0].plan).toContain('Add regression tests in vitest for pagination and error handling.');
    expect(result.activities[0].structuredPlan).toEqual(structuredPlan);
  });

  it('getSessionDiff extracts v1alpha artifact.changeSet.gitPatch.unidiffPatch when sessionCompleted is empty', async () => {
    const unidiff = [
      'diff --git a/src/mcp/resources.ts b/src/mcp/resources.ts',
      'index 1111111..2222222 100644',
      '--- a/src/mcp/resources.ts',
      '+++ b/src/mcp/resources.ts',
      '@@ -1,3 +1,4 @@',
      '+// updated',
      'diff --git a/src/types/jules-api.ts b/src/types/jules-api.ts',
      '--- a/src/types/jules-api.ts',
      '+++ b/src/types/jules-api.ts',
    ].join('\n');

    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
      activities: [
        {
          name: 'sessions/sess-v1/activities/act-1',
          createTime: '2026-08-15T10:00:00Z',
          originator: 'agent',
          progressUpdated: { title: 'Ran tests and updated types' },
          artifacts: [
            {
              bashOutput: {
                command: 'npm test',
                output: '10 passed',
                exitCode: 0,
              },
            },
            {
              changeSet: {
                source: 'sources/github/savethepolarbears/jules-mcp-server',
                gitPatch: {
                  unidiffPatch: unidiff,
                  baseCommitId: '0ebc18d',
                  suggestedCommitMessage: 'fix: support v1alpha artifacts',
                },
              },
            },
          ],
        },
        {
          name: 'sessions/sess-v1/activities/act-2',
          createTime: '2026-08-15T10:01:00Z',
          originator: 'agent',
          sessionCompleted: {},
        },
      ],
    });

    const result = JSON.parse(await resources.getSessionDiff('sess-v1'));
    expect(result.sessionId).toBe('sess-v1');
    expect(result.activityType).toBe('PROGRESS_UPDATED');
    expect(result.source).toBe('sources/github/savethepolarbears/jules-mcp-server');
    expect(result.baseCommitId).toBe('0ebc18d');
    expect(result.suggestedCommitMessage).toBe('fix: support v1alpha artifacts');
    expect(result.patch).toContain('diff --git a/src/mcp/resources.ts');
    expect(result.fileCount).toBe(2);
    expect(result.changes).toEqual([
      { path: 'src/mcp/resources.ts' },
      { path: 'src/types/jules-api.ts' },
    ]);
  });

  it('getSessionFull includes formatted v1alpha artifacts (bashOutput, changeSet, media)', async () => {
    (clientMock.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-artifacts',
      state: 'COMPLETED',
    });
    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
      activities: [
        {
          name: 'sessions/sess-artifacts/activities/act-1',
          createTime: '2026-08-15T10:00:00Z',
          originator: 'agent',
          progressUpdated: { title: 'Verified build' },
          artifacts: [
            {
              bashOutput: {
                command: 'npm run build',
                output: 'Build succeeded',
                exitCode: 0,
              },
              changeSet: {
                source: 'sources/github/owner/repo',
                gitPatch: {
                  unidiffPatch: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
                  baseCommitId: 'abc1234',
                  suggestedCommitMessage: 'feat: add x',
                },
              },
              media: {
                mimeType: 'image/png',
                description: 'UI screenshot',
              },
            },
          ],
        },
      ],
    });

    const result = JSON.parse(await resources.getSessionFull('sess-artifacts'));
    expect(result.activities[0].artifacts).toHaveLength(1);
    expect(result.activities[0].artifacts[0].bashOutput).toEqual({
      command: 'npm run build',
      output: 'Build succeeded',
      exitCode: 0,
    });
    expect(result.activities[0].artifacts[0].changeSet).toEqual({
      source: 'sources/github/owner/repo',
      baseCommitId: 'abc1234',
      suggestedCommitMessage: 'feat: add x',
      fileCount: 1,
      hasPatch: true,
    });
    expect(result.activities[0].artifacts[0].media).toEqual({
      mimeType: 'image/png',
      url: undefined,
      description: 'UI screenshot',
    });
  });

  it('getSessionsList falls back to local session ledger when listSessions fails with 503', async () => {
    (clientMock.listSessions as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Jules API error: Service Unavailable'),
    );
    storageMock.listRecentSessions = vi.fn().mockResolvedValue([
      {
        id: '6690925633602806498',
        title: 'Reliability Improvements',
        state: 'COMPLETED',
        prompt: 'Improve error handling',
        repository: 'sources/github/savethepolarbears/jules-mcp-server',
        created: '2026-06-15T00:00:00Z',
      },
    ]);

    const result = JSON.parse(await resources.getSessionsList());
    expect(result.status).toBe('degraded');
    expect(result.source).toBe('local_session_ledger');
    expect(result.count).toBe(1);
    expect(result.sessions[0].id).toBe('6690925633602806498');
  });
});
