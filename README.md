# Jules MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0.4-purple)](https://modelcontextprotocol.io/)

A production-ready **Model Context Protocol (MCP)** server for the Google Jules API, enabling autonomous coding tasks and scheduling directly from AI assistants like Claude.

> **⚠️ DISCLAIMER**: This is an **independent, open-source project** and is **NOT officially created, maintained, or endorsed by Google**. This server is a community-driven integration with the public Jules API. Use at your own risk. For official Jules documentation, visit [jules.google](https://jules.google).

## 🌟 Star This Repository

If you find this useful, please star ⭐ the repository to help others discover it!

## Overview

This MCP server bridges the Google Jules coding agent with AI assistants, allowing you to:

- **Create coding tasks** - Delegate bug fixes, refactoring, tests, and features to Jules
- **Schedule recurring tasks** - Set up automated weekly/daily maintenance (dependency updates, security audits, etc.)
- **Monitor progress** - Track session states and review generated plans
- **Approve plans** - Human-in-the-loop control before code changes
- **Manage workflows** - Send feedback and iterate on Jules's work

### Architecture: The "Thick Server" Pattern

Since the Jules API v1alpha is **stateless** (no native scheduling endpoints), this server implements a **local scheduling engine**:

- **Persistent Storage**: Schedules stored in `~/.jules-mcp/schedules.json`
- **Cron Engine**: Uses `node-schedule` for reliable task execution
- **Survives Restarts**: Schedules are rehydrated on server startup
- **Autonomous Execution**: Scheduled tasks run even without active IDE sessions

## Installation

### Prerequisites

- **Node.js** 18.0.0 or higher
- **Jules API Key** - Generate at [jules.google/settings](https://jules.google/settings)
- **GitHub Repositories** - Connect repos to Jules via the web UI first

### Setup

```bash
# Clone or download this repository
cd jules-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Set your API key
export JULES_API_KEY="your-key-here"

# Test the server
npm start
```

### Global Installation (Recommended)

```bash
# Install globally
npm install -g

# Now available as: jules-mcp
jules-mcp
```

## Configuration

### Environment Variables

Create a `.env` file or set these in your shell:

```bash
# Required
JULES_API_KEY=your_jules_api_key_here

# Optional - Security allowlist (comma-separated repo names)
# If set, only these repos can be modified
JULES_ALLOWED_REPOS=owner/repo1,owner/repo2

# Optional - Default branch
JULES_DEFAULT_BRANCH=main
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jules": {
      "command": "node",
      "args": ["/path/to/jules-mcp/dist/index.js"],
      "env": {
        "JULES_API_KEY": "your-key-here"
      }
    }
  }
}
```

**On macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**On Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

### VS Code / Cursor Configuration

For Cursor or VS Code with MCP support:

```json
{
  "mcp.servers": {
    "jules": {
      "command": "jules-mcp",
      "env": {
        "JULES_API_KEY": "your-key-here"
      }
    }
  }
}
```

## Usage

Once configured, your AI assistant can use Jules through natural language:

### Creating Immediate Tasks

```
"Use Jules to add unit tests for the authentication module in my-app-backend repository"
```

The assistant will:
1. Check `jules://sources` to find the repository
2. Call `create_coding_task` tool with appropriate prompt
3. Return the session ID for monitoring

### Scheduling Recurring Tasks

```
"Schedule Jules to update dependencies every Monday at 9 AM in my-app-backend"
```

The assistant will:
1. Call `schedule_recurring_task` with cron `"0 9 * * 1"`
2. Save the schedule to `~/.jules-mcp/schedules.json`
3. Confirm the next execution time

### Monitoring Progress

```
"Check the status of Jules session abc123"
```

The assistant will:
1. Call `get_session_status` or read `jules://sessions/abc123/full`
2. Show current state (PLANNING, IN_PROGRESS, COMPLETED, etc.)
3. Provide next steps based on state

### Reviewing and Approving Plans

```
"Show me Jules's plan for session abc123 and approve it"
```

The assistant will:
1. Read `jules://sessions/abc123/full` to get the plan
2. Display the plan steps to you
3. Call `manage_session` with `action=approve_plan` after your confirmation

## Available Resources

Resources are read-only context that the AI can access:

| URI | Description |
|-----|-------------|
| `jules://sources` | Connected GitHub repositories |
| `jules://sessions/list` | Recent Jules sessions |
| `jules://sessions/{id}/full` | Complete session details with activities |
| `jules://schedules` | Active scheduled tasks |
| `jules://schedules/history` | Execution history |

## Available Tools

Tools are actions the AI can execute:

### create_coding_task

Creates an immediate Jules coding session.

**Parameters:**
- `prompt` (required) - Natural language task instruction
- `source` (required) - Repository (format: `sources/github/owner/repo`)
- `branch` (optional) - Target branch (default: `main`)
- `auto_create_pr` (optional) - Auto-create PR (default: `true`)
- `require_plan_approval` (optional) - Pause for review (default: `false`)
- `title` (optional) - Session title

**Returns:** Session ID and monitoring URL

### manage_session

Manage active sessions (approve plans, send feedback).

**Parameters:**
- `session_id` (required)
- `action` (required) - `"approve_plan"` or `"send_message"`
- `message` (optional) - Required for `send_message`

### get_session_status

Check session status and get next steps.

**Parameters:**
- `session_id` (required)

### schedule_recurring_task

Schedule a task to run on a cron schedule.

**Parameters:**
- `task_name` (required) - Unique schedule identifier
- `cron_expression` (required) - Standard cron format
- `prompt` (required) - Task instruction
- `source` (required) - Repository resource name
- `branch`, `auto_create_pr`, `require_plan_approval`, `timezone` (optional)

**Cron Examples:**
- `"0 9 * * 1"` - Every Monday at 9 AM
- `"0 2 * * *"` - Every day at 2 AM
- `"0 0 1 * *"` - First day of each month at midnight

### list_schedules

List all active scheduled tasks with next run times.

### delete_schedule

Remove a scheduled task.

**Parameters:**
- `task_name` (required)

## Available Prompts

Prompts are templates that guide best practices:

- `refactor_module` - Guided refactoring workflow
- `setup_weekly_maintenance` - Automated maintenance setup
- `audit_security` - Comprehensive security audit
- `fix_failing_tests` - Test failure resolution
- `update_dependencies` - Dependency update with breaking change handling

## Security Considerations

### API Key Security

- **Never commit** your `JULES_API_KEY` to version control
- Store in environment variables or secure secrets manager
- The API key grants **write access** to connected repositories

### Repository Allowlist

Use `JULES_ALLOWED_REPOS` to restrict which repositories can be modified:

```bash
export JULES_ALLOWED_REPOS="myorg/safe-repo,myorg/test-repo"
```

This prevents accidental modifications to production or sensitive repos.

### Plan Approval Workflow

For critical repositories, **always** set `require_plan_approval: true`:

```
"Create a task but require plan approval before any code changes"
```

This ensures human review before Jules modifies code.

### Audit Logging

All scheduled task executions are logged to `jules://schedules/history`. Review this regularly to audit autonomous activities.

## Troubleshooting

### "JULES_API_KEY environment variable is required"

Set your API key:
```bash
export JULES_API_KEY="your-key-here"
```

### "Repository not found" error

1. Check `jules://sources` resource to see connected repos
2. Ensure the GitHub app is installed on the repository
3. Use the exact resource name format: `sources/github/owner/repo`

### Schedules not persisting

Check that `~/.jules-mcp/schedules.json` exists and is writable.

### TypeScript compilation errors

```bash
npm run typecheck
```

## Development

### Project Structure

```
src/
  types/          # TypeScript type definitions
    jules-api.ts  # Jules API types
    schedule.ts   # Schedule types
  api/            # API client layer
    jules-client.ts
  storage/        # Persistence layer
    schedule-store.ts
  scheduler/      # Cron engine
    cron-engine.ts
  mcp/            # MCP protocol layer
    resources.ts  # Resources implementation
    tools.ts      # Tools implementation
    prompts.ts    # Prompt templates
  index.ts        # Main entry point
```

### Build Commands

```bash
npm run build      # Compile TypeScript
npm run dev        # Development mode with tsx
npm run typecheck  # Type checking only
```

## API Endpoints Covered

This server provides complete coverage of the Jules v1alpha API:

| Endpoint | Method | MCP Mapping |
|----------|--------|-------------|
| `/sources` | GET | Resource: `jules://sources` |
| `/sources/{name}` | GET | Included in full session resource |
| `/sessions` | POST | Tool: `create_coding_task` |
| `/sessions` | GET | Resource: `jules://sessions/list` |
| `/sessions/{id}` | GET | Tool: `get_session_status` |
| `/sessions/{id}:approvePlan` | POST | Tool: `manage_session` (approve_plan) |
| `/sessions/{id}:sendMessage` | POST | Tool: `manage_session` (send_message) |
| `/sessions/{id}/activities` | GET | Resource: `jules://sessions/{id}/full` |

### Additional Capabilities (Beyond API)

- **Local scheduling** - Cron-based task execution
- **Schedule persistence** - Survives server restarts
- **Execution history** - Audit trail for scheduled tasks

## Future Roadmap

When Jules API adds native scheduling:

- The `schedule_recurring_task` tool will migrate from local cron to API calls
- Existing local schedules can be migrated automatically
- The MCP tool interface remains unchanged for backward compatibility

## Resources

- **Jules API Documentation**: https://developers.google.com/jules/api
- **Jules Web Interface**: https://jules.google
- **Model Context Protocol**: https://modelcontextprotocol.io
- **MCP TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk

## License

MIT

## Contributing

This is an open-source implementation. Contributions welcome for:
- Additional prompt templates
- Enhanced error handling
- Webhook support (when Jules API adds it)
- Advanced scheduling features (conditional execution, dependency chains)
