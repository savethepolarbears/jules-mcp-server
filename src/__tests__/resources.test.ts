import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JulesResources } from '../mcp/resources.js';
import { JulesClient, JulesAPIError } from '../api/jules-client.js';
import type { ScheduleStorage } from '../storage/schedule-store.js';
import type { CronEngine } from '../scheduler/cron-engine.js';

describe('JulesResources Resiliency', () => {
  let clientMock: JulesClient;
  let storageMock: ScheduleStorage;
  let schedulerMock: CronEngine;
  let resources: JulesResources;

  beforeEach(() => {
    clientMock = {
      listSessions: vi.fn(),
      getSession: vi.fn(),
      listActivities: vi.fn(),
    } as unknown as JulesClient;

    storageMock = {} as unknown as ScheduleStorage;
    schedulerMock = {} as unknown as CronEngine;

    resources = new JulesResources(clientMock, storageMock, schedulerMock);
  });

  it('getSessionsList should return degraded mode JSON when API fails', async () => {
    (clientMock.listSessions as ReturnType<typeof vi.fn>).mockRejectedValue(
      new JulesAPIError('API Gateway Timeout', 504, 'Timeout')
    );

    const resultStr = await resources.getSessionsList();
    const result = JSON.parse(resultStr);

    expect(result.sessions).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.status).toBe('degraded');
    expect(result.error).toContain('API Gateway Timeout');
  });

  it('getSessionFull should return degraded mode JSON when getSession fails', async () => {
    (clientMock.getSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new JulesAPIError('Internal Server Error', 500, 'Error')
    );
    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockResolvedValue({
      activities: [],
    });

    const resultStr = await resources.getSessionFull('test-session-id');
    const result = JSON.parse(resultStr);

    expect(result.session.id).toBe('test-session-id');
    expect(result.session.state).toBe('UNKNOWN');
    expect(result.activities).toEqual([]);
    expect(result.status).toBe('degraded');
    expect(result.error).toContain('Internal Server Error');
  });

  it('getSessionFull should return degraded mode JSON when listActivities fails', async () => {
    (clientMock.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'test-session-id',
      state: 'IN_PROGRESS',
    });
    (clientMock.listActivities as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    );

    const resultStr = await resources.getSessionFull('test-session-id');
    const result = JSON.parse(resultStr);

    expect(result.session.id).toBe('test-session-id');
    expect(result.session.state).toBe('UNKNOWN'); // The degraded mode forces UNKNOWN state
    expect(result.activities).toEqual([]);
    expect(result.status).toBe('degraded');
    expect(result.error).toContain('Network error');
  });
});
