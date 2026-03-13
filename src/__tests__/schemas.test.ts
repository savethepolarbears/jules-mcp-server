import { describe, it, expect } from 'vitest';
import {
  CreateTaskSchema,
  ManageSessionSchema,
  ScheduleTaskSchema,
  WaitForSessionSchema,
  GetActivitiesSinceSchema,
  GetSessionStatusSchema,
  DeleteScheduleSchema,
  DeleteSessionSchema,
  GetSourceDetailsSchema,
  CreateRepolessTaskSchema,
} from '../mcp/tools.js';

describe('CreateTaskSchema', () => {
  const base = {
    prompt: 'A valid prompt that is long enough',
    source: 'sources/github/owner/repo',
  };

  it('accepts valid minimal input', () => {
    const result = CreateTaskSchema.parse(base);
    expect(result.branch).toBe('main');
    expect(result.auto_create_pr).toBe(true);
    expect(result.require_plan_approval).toBe(false);
  });

  it('rejects prompt shorter than 10 chars', () => {
    expect(() => CreateTaskSchema.parse({ ...base, prompt: 'short' })).toThrow();
  });

  it('rejects whitespace-only prompt', () => {
    expect(() => CreateTaskSchema.parse({ ...base, prompt: '               ' })).toThrow();
  });

  it('rejects invalid source format', () => {
    expect(() => CreateTaskSchema.parse({ ...base, source: 'bad/format' })).toThrow();
  });

  it('rejects source with special characters', () => {
    expect(() => CreateTaskSchema.parse({ ...base, source: 'sources/github/ow ner/repo' })).toThrow();
  });

  it('rejects prompt containing API key pattern', () => {
    expect(() =>
      CreateTaskSchema.parse({ ...base, prompt: 'Use this key sk-abc1234567890123456789xyz' })
    ).toThrow(/secrets/i);
  });

  it('accepts branch with slashes', () => {
    const result = CreateTaskSchema.parse({ ...base, branch: 'feature/my-branch' });
    expect(result.branch).toBe('feature/my-branch');
  });

  it('rejects branch with invalid characters', () => {
    expect(() => CreateTaskSchema.parse({ ...base, branch: 'branch with spaces' })).toThrow();
  });
});

describe('CreateRepolessTaskSchema', () => {
  it('accepts valid input', () => {
    const result = CreateRepolessTaskSchema.parse({ prompt: 'Generate a helpful script for me' });
    expect(result.prompt).toBeDefined();
  });

  it('rejects short prompt', () => {
    expect(() => CreateRepolessTaskSchema.parse({ prompt: 'short' })).toThrow();
  });
});

describe('ManageSessionSchema', () => {
  it('accepts approve_plan without message', () => {
    const result = ManageSessionSchema.parse({ session_id: 'abc-123', action: 'approve_plan' });
    expect(result.action).toBe('approve_plan');
  });

  it('accepts send_message with message', () => {
    const result = ManageSessionSchema.parse({
      session_id: 'abc-123',
      action: 'send_message',
      message: 'some feedback',
    });
    expect(result.message).toBe('some feedback');
  });

  it('rejects session_id with special characters', () => {
    expect(() => ManageSessionSchema.parse({ session_id: 'abc 123!', action: 'approve_plan' })).toThrow();
  });

  it('rejects invalid action', () => {
    expect(() => ManageSessionSchema.parse({ session_id: 'abc', action: 'invalid_action' })).toThrow();
  });
});

describe('ScheduleTaskSchema', () => {
  const base = {
    task_name: 'weekly-deps',
    cron_expression: '0 9 * * 1',
    prompt: 'update all dependencies',
    source: 'sources/github/owner/repo',
  };

  it('accepts valid input with defaults', () => {
    const result = ScheduleTaskSchema.parse(base);
    expect(result.branch).toBe('main');
    expect(result.auto_create_pr).toBe(true);
  });

  it('rejects task_name with special characters', () => {
    expect(() => ScheduleTaskSchema.parse({ ...base, task_name: 'bad@name!' })).toThrow();
  });

  it('rejects empty task_name', () => {
    expect(() => ScheduleTaskSchema.parse({ ...base, task_name: '' })).toThrow();
  });

  it('rejects prompt with secret', () => {
    expect(() =>
      ScheduleTaskSchema.parse({ ...base, prompt: 'use this AKIA1234567890123456' })
    ).toThrow(/secrets/i);
  });
});

describe('WaitForSessionSchema', () => {
  it('applies defaults', () => {
    const result = WaitForSessionSchema.parse({ session_id: 'sess-1' });
    expect(result.timeout_seconds).toBe(300);
    expect(result.poll_interval_seconds).toBe(10);
    expect(result.target_states).toEqual(['COMPLETED', 'FAILED', 'CANCELED']);
  });

  it('rejects timeout below 30', () => {
    expect(() => WaitForSessionSchema.parse({ session_id: 'sess-1', timeout_seconds: 5 })).toThrow();
  });

  it('rejects timeout above 1800', () => {
    expect(() => WaitForSessionSchema.parse({ session_id: 'sess-1', timeout_seconds: 3600 })).toThrow();
  });

  it('rejects poll_interval below 5', () => {
    expect(() => WaitForSessionSchema.parse({ session_id: 'sess-1', poll_interval_seconds: 1 })).toThrow();
  });
});

describe('GetActivitiesSinceSchema', () => {
  it('accepts valid ISO timestamp', () => {
    const result = GetActivitiesSinceSchema.parse({
      session_id: 'sess-1',
      since: '2026-01-01T00:00:00Z',
    });
    expect(result.since).toBe('2026-01-01T00:00:00Z');
  });

  it('rejects non-ISO timestamp', () => {
    expect(() =>
      GetActivitiesSinceSchema.parse({ session_id: 'sess-1', since: 'Jan 1 2026' })
    ).toThrow();
  });
});

describe('GetSessionStatusSchema', () => {
  it('accepts valid session_id', () => {
    const result = GetSessionStatusSchema.parse({ session_id: 'sess-abc-123' });
    expect(result.session_id).toBe('sess-abc-123');
  });
});

describe('DeleteScheduleSchema', () => {
  it('accepts task_name', () => {
    const result = DeleteScheduleSchema.parse({ task_name: 'weekly' });
    expect(result.task_name).toBe('weekly');
  });
});

describe('DeleteSessionSchema', () => {
  it('accepts session_id', () => {
    const result = DeleteSessionSchema.parse({ session_id: 'sess-1' });
    expect(result.session_id).toBe('sess-1');
  });
});

describe('GetSourceDetailsSchema', () => {
  it('accepts valid source name', () => {
    const result = GetSourceDetailsSchema.parse({ source_name: 'sources/github/owner/repo' });
    expect(result.source_name).toBe('sources/github/owner/repo');
  });

  it('rejects invalid source format', () => {
    expect(() => GetSourceDetailsSchema.parse({ source_name: 'owner/repo' })).toThrow();
  });
});
