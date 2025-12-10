# Usage Examples

Practical examples of using the Jules MCP Server with AI assistants.

## Basic Task Creation

### Example 1: Fix a Bug

**User to AI Assistant:**
```
"Use Jules to fix the authentication bug in the login module of our backend repo"
```

**AI Assistant Actions:**
1. Read `jules://sources` to find `sources/github/myorg/backend`
2. Call `create_coding_task`:
   ```json
   {
     "prompt": "Fix the authentication bug in src/auth/login.ts. The bug causes users to be logged out after 5 minutes instead of the configured 30 minutes. Investigate the session timeout logic and correct it.",
     "source": "sources/github/myorg/backend",
     "branch": "main",
     "auto_create_pr": true,
     "require_plan_approval": true
   }
   ```
3. Return: "Task created. Session ID: abc123. Status: PLANNING. I'll monitor and notify when the plan is ready for review."

### Example 2: Add Tests

**User:**
```
"Add comprehensive tests for the payment processing module"
```

**AI:**
1. Calls `create_coding_task` with detailed prompt about test coverage
2. Monitors via `get_session_status`
3. When state reaches `AWAITING_PLAN_APPROVAL`, reads `jules://sessions/{id}/full`
4. Shows plan to user for approval
5. After user confirms, calls `manage_session` with `action: approve_plan`

## Scheduled Maintenance

### Example 3: Weekly Dependency Updates

**User:**
```
"Set up Jules to update dependencies every Monday morning in our frontend repo"
```

**AI Actions:**
1. Read `jules://sources` to validate repository exists
2. Call `schedule_recurring_task`:
   ```json
   {
     "task_name": "Frontend Weekly Deps",
     "cron_expression": "0 9 * * 1",
     "prompt": "Update all npm dependencies to their latest compatible versions. Check for breaking changes in major version updates. Run tests after updating. If tests fail, revert that specific update and document why.",
     "source": "sources/github/myorg/frontend",
     "auto_create_pr": true,
     "require_plan_approval": false
   }
   ```
3. Confirm: "Scheduled task 'Frontend Weekly Deps' will run every Monday at 9 AM. Next execution: 2025-01-20T09:00:00Z"

**What Happens Next:**
- Every Monday at 9 AM, the MCP server automatically calls Jules API
- Creates a new session with the prompt
- Jules updates dependencies and creates a PR
- PR shows up in GitHub for human review before merge

### Example 4: Monthly Security Audit

**User:**
```
"Schedule a monthly security audit for our API repository"
```

**AI:**
Uses the `audit_security` prompt template with `schedule_recurring_task`:
- Cron: `"0 2 1 * *"` (1st of month at 2 AM)
- Comprehensive security scan prompt
- Require plan approval: true (security changes should be reviewed)

## Monitoring and Management

### Example 5: Check Active Tasks

**User:**
```
"What Jules tasks are currently running?"
```

**AI:**
1. Reads `jules://sessions/list` resource
2. Filters for sessions with state `IN_PROGRESS` or `PLANNING`
3. Returns summary:
   ```
   Active Jules Sessions:
   1. Session abc123: "Add API rate limiting" - IN_PROGRESS
   2. Session def456: "Refactor database queries" - PLANNING
   ```

### Example 6: Review a Completed Task

**User:**
```
"Show me what Jules did in session abc123"
```

**AI:**
1. Reads `jules://sessions/abc123/full` resource
2. Parses activities to extract:
   - Plan steps
   - Files modified
   - Tests run
   - Pull Request URL
3. Presents formatted summary with PR link

### Example 7: Iterate on a Task

**User:**
```
"Tell Jules to use the lodash library instead of writing custom utilities"
```

**AI:**
1. Calls `manage_session`:
   ```json
   {
     "session_id": "abc123",
     "action": "send_message",
     "message": "Please use the lodash library for utility functions instead of creating custom implementations. Import lodash and refactor the custom utilities to use lodash methods."
   }
   ```
2. Jules incorporates feedback and revises the plan

## Advanced Workflows

### Example 8: Conditional Scheduling

**User:**
```
"Set up a daily task that only runs if there are open security vulnerability alerts"
```

**Current Implementation:**
The AI would need to orchestrate this logic itself:
1. Schedule a daily check task
2. That task queries GitHub's Dependabot API
3. If vulnerabilities found, create a Jules session

**Future:** When Jules API supports conditional triggers, this could be a single tool call.

### Example 9: Multi-Repository Coordination

**User:**
```
"Update the API version in both frontend and backend repos, ensuring they stay compatible"
```

**AI Strategy:**
1. Create task for backend: "Update API to v2.0"
2. Wait for backend task to complete
3. Review backend changes to understand new API contract
4. Create task for frontend: "Update to use backend API v2.0 based on these changes: [summary]"

**Workflow:**
```
- Create backend session (require_plan_approval: true)
- Review plan
- Approve
- Wait for completion
- Read jules://sessions/{backend_id}/full for details
- Create frontend session with context from backend
```

### Example 10: Using Prompts for Best Practices

**User:**
```
"Help me set up weekly maintenance for my blog repository"
```

**AI:**
1. Calls `get_prompt` with name `setup_weekly_maintenance`
2. Fills in arguments: `repository: "myuser/blog"`, `tasks: "dependency updates, link checker, image optimization"`
3. Executes the rendered template, which guides creating the schedule

## Schedule Management

### Example 11: List All Schedules

**User:**
```
"What Jules tasks are scheduled?"
```

**AI:**
Calls `list_schedules` tool, returns:
```json
{
  "count": 2,
  "schedules": [
    {
      "name": "Frontend Weekly Deps",
      "cron": "0 9 * * 1",
      "nextRun": "2025-01-20T09:00:00Z",
      "repository": "sources/github/myorg/frontend"
    },
    {
      "name": "Monthly Security Audit",
      "cron": "0 2 1 * *",
      "nextRun": "2025-02-01T02:00:00Z",
      "repository": "sources/github/myorg/api"
    }
  ]
}
```

### Example 12: Delete a Schedule

**User:**
```
"Stop the weekly dependency update schedule"
```

**AI:**
```json
{
  "tool": "delete_schedule",
  "arguments": {
    "task_name": "Frontend Weekly Deps"
  }
}
```

Response: "Schedule deleted. Task will no longer execute."

### Example 13: Review Schedule History

**User:**
```
"Show me when scheduled tasks last ran"
```

**AI:**
Reads `jules://schedules/history` resource:
```json
{
  "history": [
    {
      "taskName": "Frontend Weekly Deps",
      "executedAt": "2025-01-13T09:00:00Z",
      "sessionId": "session-xyz",
      "prompt": "Update all npm dependencies..."
    },
    {
      "taskName": "Monthly Security Audit",
      "executedAt": "2025-01-01T02:00:00Z",
      "sessionId": "session-abc",
      "prompt": "Scan for security vulnerabilities..."
    }
  ]
}
```

## Error Handling

### Example 14: Repository Not Found

**User:**
```
"Create a task for the nonexistent-repo repository"
```

**AI:**
Calls `create_coding_task`, receives error:
```json
{
  "success": false,
  "error": "Repository 'sources/github/myorg/nonexistent-repo' not found. Please check jules://sources for available repositories."
}
```

AI responds: "That repository isn't connected to Jules. Here are your available repositories: [list from jules://sources]"

### Example 15: Invalid Cron Expression

**User:**
```
"Schedule a task to run 'every Tuesday at 25:00'" (invalid hour)
```

**AI:**
Calls `schedule_recurring_task`, receives:
```json
{
  "success": false,
  "error": "Invalid cron expression: 0 25 * * 2. Format: minute hour day month weekday"
}
```

AI responds: "That time isn't valid (25:00). Did you mean 2 AM (02:00)? The cron would be: 0 2 * * 2"

## Integration Examples

### Example 16: Slack Integration

Set up a Slack bot that triggers Jules tasks:

```javascript
// Slack bot handler
slackBot.on('message', async (message) => {
  if (message.text.startsWith('/jules')) {
    const prompt = message.text.replace('/jules', '').trim();

    // Call Jules MCP via your AI orchestrator
    const result = await mcpClient.callTool('create_coding_task', {
      prompt,
      source: 'sources/github/company/repo',
      auto_create_pr: true
    });

    await slackBot.reply(message, `Task started: ${result.sessionId}`);
  }
});
```

### Example 17: CI/CD Pipeline Integration

Trigger Jules from GitHub Actions:

```yaml
name: Jules Weekly Maintenance
on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 9 AM
jobs:
  jules-task:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Jules
        env:
          JULES_API_KEY: ${{ secrets.JULES_API_KEY }}
        run: |
          # Call Jules MCP server
          echo '{"tool":"create_coding_task","args":{"prompt":"Update deps","source":"sources/github/${{github.repository}}"}}' \
            | node /path/to/jules-mcp/dist/index.js
```

## Best Practices

### Clear Prompts

**Bad:**
```
"Fix the code"
```

**Good:**
```
"Fix the race condition in src/api/users.ts where concurrent requests can create duplicate user records. Add proper locking or unique constraints."
```

### Specific File References

**Bad:**
```
"Make the app faster"
```

**Good:**
```
"Optimize the database queries in src/db/queries.ts. Add indexes for frequently queried fields and use prepared statements to reduce parsing overhead."
```

### Test Requirements

**Include in prompt:**
```
"After making changes, run 'npm test' and ensure all tests pass. If tests fail, fix them as part of this task."
```

### Iterative Refinement

Don't expect perfection on first try:
1. Start task with `require_plan_approval: true`
2. Review plan
3. Send feedback via `manage_session` if needed
4. Approve when satisfied
5. Monitor execution
6. If result isn't perfect, create follow-up task with context from first task

## Cron Expression Reference

```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-6, 0=Sunday)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

**Common Patterns:**
- `"0 9 * * 1"` - Every Monday at 9 AM
- `"0 */6 * * *"` - Every 6 hours
- `"0 0 * * 0"` - Every Sunday at midnight
- `"0 2 1 * *"` - 1st of month at 2 AM
- `"*/15 * * * *"` - Every 15 minutes

## Troubleshooting Examples

### Session Stuck in PLANNING

If a session doesn't progress:

1. Check status: `get_session_status`
2. Read activities: `jules://sessions/{id}/full`
3. Look for error activities
4. If truly stuck, create new session with refined prompt

### Schedule Didn't Execute

Check:
1. `list_schedules` - Is it enabled?
2. Server logs - Was server running at execution time?
3. `jules://schedules/history` - Any recent executions?
4. Cron expression - Is it valid? Test at https://crontab.guru

### Permission Denied

If you get repository access errors:
1. Verify repo is in `jules://sources`
2. Check `JULES_ALLOWED_REPOS` if set
3. Ensure GitHub App is installed on the repository
