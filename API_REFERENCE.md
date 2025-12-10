# Jules MCP Server API Reference

Complete reference for all Resources, Tools, and Prompts exposed by this MCP server.

## Resources

Resources are read-only data that provide context to the AI assistant.

### jules://sources

**Description:** List of GitHub repositories connected to Jules

**MIME Type:** `application/json`

**Response Format:**
```json
{
  "description": "Connected GitHub repositories available for Jules tasks",
  "count": 2,
  "sources": [
    {
      "name": "sources/github/owner/repo",
      "repository": "owner/repo",
      "defaultBranch": "main",
      "url": "https://github.com/owner/repo"
    }
  ]
}
```

**Usage:** Read this before creating tasks to ensure the repository is connected.

---

### jules://sessions/list

**Description:** Recent Jules coding sessions

**MIME Type:** `application/json`

**Response Format:**
```json
{
  "description": "Recent Jules sessions (tasks)",
  "count": 5,
  "sessions": [
    {
      "id": "session-abc123",
      "title": "Add API tests",
      "state": "COMPLETED",
      "prompt": "Add comprehensive API tests...",
      "repository": "sources/github/owner/repo",
      "created": "2025-01-15T10:00:00Z"
    }
  ]
}
```

**Usage:** Monitor active tasks or check historical sessions.

---

### jules://sessions/{id}/full

**Description:** Complete session details including plan and activities

**URI Pattern:** `jules://sessions/{sessionId}/full`

**MIME Type:** `application/json`

**Response Format:**
```json
{
  "session": {
    "id": "abc123",
    "title": "Fix auth bug",
    "state": "AWAITING_PLAN_APPROVAL",
    "prompt": "Fix the authentication timeout issue...",
    "repository": "sources/github/owner/backend",
    "branch": "main",
    "automationMode": "AUTO_CREATE_PR",
    "requirePlanApproval": true,
    "created": "2025-01-15T10:00:00Z",
    "updated": "2025-01-15T10:05:00Z"
  },
  "activities": [
    {
      "type": "PLAN_GENERATED",
      "timestamp": "2025-01-15T10:04:00Z",
      "plan": "1. Analyze session timeout configuration...",
      "changesPreview": "3 files"
    },
    {
      "type": "PROGRESS_UPDATED",
      "timestamp": "2025-01-15T10:05:00Z",
      "message": "Awaiting plan approval",
      "percentage": 20
    }
  ]
}
```

**Usage:** Review plans before approval, monitor progress, debug failures.

---

### jules://schedules

**Description:** All locally-managed scheduled tasks

**MIME Type:** `application/json`

**Response Format:**
```json
{
  "description": "Locally-managed scheduled Jules tasks",
  "count": 2,
  "schedules": [
    {
      "id": "uuid-1",
      "name": "Weekly Deps Update",
      "cron": "0 9 * * 1",
      "enabled": true,
      "repository": "sources/github/owner/repo",
      "prompt": "Update all dependencies...",
      "nextRun": "2025-01-20T09:00:00Z",
      "lastRun": "2025-01-13T09:00:00Z",
      "lastSessionId": "session-xyz"
    }
  ]
}
```

**Usage:** Audit active schedules, check next execution times.

---

### jules://schedules/history

**Description:** Execution history of scheduled tasks

**MIME Type:** `application/json`

**Response Format:**
```json
{
  "description": "Execution history of scheduled tasks",
  "count": 10,
  "history": [
    {
      "taskName": "Weekly Deps Update",
      "executedAt": "2025-01-13T09:00:00Z",
      "sessionId": "session-xyz",
      "prompt": "Update all dependencies to latest versions..."
    }
  ]
}
```

**Usage:** Audit trail for compliance and debugging.

---

## Tools

Tools are executable functions that perform actions.

### create_coding_task

**Description:** Creates an immediate Jules coding session

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Natural language task instruction |
| `source` | string | Yes | - | Repository resource name (sources/github/owner/repo) |
| `branch` | string | No | "main" | Git branch to base changes on |
| `auto_create_pr` | boolean | No | true | Automatically create Pull Request |
| `require_plan_approval` | boolean | No | false | Pause for manual plan review |
| `title` | string | No | - | Optional session title |

**Returns:**
```json
{
  "success": true,
  "sessionId": "abc123",
  "state": "PLANNING",
  "message": "Session created and executing automatically.",
  "monitorUrl": "https://jules.google/sessions/abc123"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Repository not found. Please check jules://sources"
}
```

**Consequential:** No (returns immediately; actual code changes happen asynchronously)

---

### manage_session

**Description:** Manage active sessions (approve plans, send feedback)

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Session ID to manage |
| `action` | enum | Yes | "approve_plan" or "send_message" |
| `message` | string | Conditional | Required if action is "send_message" |

**Returns:**
```json
{
  "success": true,
  "message": "Plan approved. Session is now executing.",
  "newState": "IN_PROGRESS"
}
```

**Consequential:** Yes (approve_plan triggers code modification)

---

### get_session_status

**Description:** Get current status and guidance for next steps

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Session ID |

**Returns:**
```json
{
  "success": true,
  "sessionId": "abc123",
  "title": "Fix auth bug",
  "state": "AWAITING_PLAN_APPROVAL",
  "prompt": "Fix the authentication timeout...",
  "repository": "sources/github/owner/backend",
  "updated": "2025-01-15T10:05:00Z",
  "nextSteps": "Plan is ready. Read jules://sessions/abc123/full to review the plan, then call manage_session with action=approve_plan to proceed."
}
```

**Consequential:** No (read-only)

---

### schedule_recurring_task

**Description:** Schedule a task to run automatically on a cron schedule

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_name` | string | Yes | - | Unique schedule identifier |
| `cron_expression` | string | Yes | - | Cron format (minute hour day month weekday) |
| `prompt` | string | Yes | - | Task instruction |
| `source` | string | Yes | - | Repository resource name |
| `branch` | string | No | "main" | Git branch |
| `auto_create_pr` | boolean | No | true | Auto-create PRs |
| `require_plan_approval` | boolean | No | false | Require approval |
| `timezone` | string | No | System TZ | Timezone for cron |

**Cron Format:** `minute(0-59) hour(0-23) day(1-31) month(1-12) weekday(0-6)`

**Returns:**
```json
{
  "success": true,
  "message": "Task 'Weekly Deps Update' scheduled successfully",
  "scheduleId": "uuid-here",
  "cron": "0 9 * * 1",
  "nextExecution": "2025-01-20T09:00:00Z"
}
```

**Consequential:** Yes (creates persistent schedule that will execute autonomously)

---

### list_schedules

**Description:** List all active scheduled tasks

**Parameters:** None

**Returns:**
```json
{
  "success": true,
  "count": 2,
  "schedules": [
    {
      "id": "uuid-1",
      "name": "Weekly Deps Update",
      "cron": "0 9 * * 1",
      "enabled": true,
      "repository": "sources/github/owner/repo",
      "prompt": "Update all dependencies...",
      "nextRun": "2025-01-20T09:00:00Z",
      "lastRun": "2025-01-13T09:00:00Z",
      "lastSessionId": "session-xyz"
    }
  ]
}
```

**Consequential:** No (read-only)

---

### delete_schedule

**Description:** Remove a scheduled task

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_name` | string | Yes | Name of schedule to delete |

**Returns:**
```json
{
  "success": true,
  "message": "Schedule 'Weekly Deps Update' deleted successfully"
}
```

**Consequential:** Yes (permanently removes schedule)

---

## Prompts

Prompts are templates that help users leverage Jules effectively.

### refactor_module

**Description:** Guided refactoring workflow with clear goals

**Arguments:**
- `repository` (required) - Repository name (owner/repo)
- `module_path` (required) - Path to file/module
- `goal` (required) - Refactoring objective

**Rendered Output:**
```
I want to refactor the module at src/auth/login.ts in repository myorg/backend.

Goal: improve performance

Please create a Jules coding task with a detailed prompt that:
1. Identifies the specific files to modify
2. Explains the refactoring goal clearly
3. Specifies any patterns or conventions to follow
4. Includes test requirements

Use the create_coding_task tool with source format: sources/github/myorg/backend
```

---

### setup_weekly_maintenance

**Description:** Automated weekly maintenance setup

**Arguments:**
- `repository` (required) - Repository name
- `tasks` (required) - Comma-separated task list

**Rendered Output:**
```
I want to set up weekly automated maintenance for repository myorg/frontend.

Maintenance tasks to include:
- dependency updates
- linter fixes
- security audit

Please use the schedule_recurring_task tool with:
- Cron expression: "0 3 * * 1" (Every Monday at 3 AM)
- A comprehensive prompt covering all tasks
- Auto-create PR: true
- Source: sources/github/myorg/frontend
```

---

### audit_security

**Description:** Comprehensive security audit task

**Arguments:**
- `repository` (required) - Repository name

**Includes:** OWASP Top 10 checks, dependency vulnerabilities, secret scanning

---

### fix_failing_tests

**Description:** Test failure resolution template

**Arguments:**
- `repository` (required)
- `test_command` (required) - How to run tests

---

### update_dependencies

**Description:** Dependency update with breaking change handling

**Arguments:**
- `repository` (required)
- `package_manager` (required) - npm, yarn, or pnpm

---

## Session State Machine

Understanding session states is crucial for monitoring:

```
QUEUED
  ↓
PLANNING (Jules analyzing code)
  ↓
AWAITING_PLAN_APPROVAL (if required)
  ↓ (after approve_plan)
IN_PROGRESS (Jules making changes)
  ↓
COMPLETED or FAILED
```

**State-Specific Actions:**

| State | Recommended Action |
|-------|-------------------|
| `QUEUED` | Wait, no action needed |
| `PLANNING` | Wait for plan generation |
| `AWAITING_PLAN_APPROVAL` | Read plan, then approve or send feedback |
| `IN_PROGRESS` | Monitor progress via activities |
| `COMPLETED` | Review PR and merge if satisfactory |
| `FAILED` | Read activities to diagnose, may need new session |

## Rate Limits and Quotas

Jules API has usage limits (exact limits not public, likely based on tier):

- **Concurrent sessions:** Limited (varies by account)
- **Daily tasks:** Limited (free tier may have lower limits)

**Best Practices:**
- Don't create excessive scheduled tasks
- Monitor usage via `jules://sessions/list`
- Space out scheduled task execution times

## Error Codes

Common errors and their meanings:

| Error | Cause | Solution |
|-------|-------|----------|
| "JULES_API_KEY environment variable is required" | Missing API key | Set JULES_API_KEY |
| "Repository not found" | Source not connected or invalid name | Check jules://sources |
| "Invalid cron expression" | Malformed cron string | Use format: minute hour day month weekday |
| "A schedule named 'X' already exists" | Name collision | Use delete_schedule or different name |
| "Jules API error: 401" | Invalid API key | Verify key in Jules settings |
| "Jules API error: 404" | Resource not found | Check session ID or source name |
| "Jules API error: 429" | Rate limit exceeded | Wait and retry |

## Extending the Server

### Adding Custom Tools

To add a new tool, modify `src/mcp/tools.ts`:

```typescript
export const MyCustomSchema = z.object({
  param1: z.string(),
});

export class JulesTools {
  async myCustomTool(args: z.infer<typeof MyCustomSchema>): Promise<string> {
    // Implementation
    return JSON.stringify({ success: true });
  }
}
```

Then register in `src/index.ts`:

```typescript
{
  name: 'my_custom_tool',
  description: 'Does something custom',
  inputSchema: zodToJsonSchema(MyCustomSchema),
}
```

### Adding Custom Resources

Modify `src/mcp/resources.ts`:

```typescript
async getMyCustomResource(): Promise<string> {
  const data = await this.client.someApiCall();
  return JSON.stringify({ formatted: data });
}
```

Register in `src/index.ts` resource list and handler.

## Implementation Notes

### Asynchronous Execution

Jules sessions are **asynchronous**. The `create_coding_task` tool returns immediately with a session ID. The actual work happens in the background.

**Implication:** AI assistants must poll for status or use resources to monitor progress. There is no blocking "wait for completion" tool.

### Polling Best Practices

To avoid excessive API calls:
- Poll every 30-60 seconds for active sessions
- Use exponential backoff for completed sessions
- Cache session status locally for a few seconds

### Local vs Remote State

**Remote State (Jules API):**
- Sessions and their activities
- Source repository list

**Local State (MCP Server):**
- Scheduled tasks
- Schedule execution history

This hybrid model means schedules are not visible in the Jules web UI (they're local to the MCP server).

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Jules API | v1alpha | Experimental, may change |
| MCP Protocol | 2025-03-26 | Streamable HTTP spec |
| Node.js | >=18.0.0 | Required for fetch API |
| TypeScript | >=5.0.0 | For strict type checking |

## Additional Resources

- **Jules Quickstart:** https://jules.google/docs/api/reference/
- **Jules API Reference:** https://developers.google.com/jules/api/reference/rest
- **MCP Specification:** https://modelcontextprotocol.io/docs
- **MCP TypeScript SDK:** https://github.com/modelcontextprotocol/typescript-sdk
- **Cron Expression Tester:** https://crontab.guru
