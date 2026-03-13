# Jules MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
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
- **Activepieces Integration** - Use the included Jules piece (`pieces/jules`) to automate coding tasks in your Activepieces workflows

### Architecture: The "Thick Server" Pattern

Since the Jules API v1alpha is **stateless** (no native scheduling endpoints), this server implements a **local scheduling engine**:

- **Persistent Storage**: Schedules stored in `~/.jules-mcp/schedules.enc`
- **Cron Engine**: Uses `node-schedule` for reliable task execution
- **Survives Restarts**: Schedules are rehydrated on server startup
- **Autonomous Execution**: Scheduled tasks run even without active IDE sessions

## Installation

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher
- **Jules API Key** - Generate at [jules.google/settings](https://jules.google/settings)
- **GitHub Repositories** - Ensure your repositories are connected to Jules and the GitHub app is installed.

### Developer Setup

```bash
# 1. Clone the repository
git clone https://github.com/savethepolarbears/jules-mcp-server.git
cd jules-mcp-server

# 2. Install dependencies
npm install

# 3. Configure environment
# Copy example env and fill in your JULES_API_KEY
cp .env.example .env
# 4. Verify the setup
npm run lint
npm run typecheck
npm run test

# 5. Build the project and run a smoke test to verify connectivity
npm run build
npm run mcp:smoke
npm run mcp:smoke
```

### Quick smoke test (MCP stdio)

After building and setting `JULES_API_KEY`, you can validate the server end-to-end:

```bash
npm run mcp:smoke
```

Expected output (with a valid key):

- Lists 11 tools, 5 prompts, and the 4 core resources
- Attempts to read a fake session ID and reports a Jules 404 (proves real API calls work)
- Attempts a tool call with dummy data and reports the API error without crashing

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
# Required - Your Jules API Key
JULES_API_KEY=your_jules_api_key_here

# Strongly Recommended - Encryption key for local schedules
# Using JULES_API_KEY as fallback means rotating your API key will make all scheduled tasks unreadable.
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JULES_ENCRYPTION_KEY=your_strong_random_key_here

# Required for create_coding_task. Comma-separated list of authorized repositories.
JULES_ALLOWED_REPOS=owner/repo1,owner/repo2

# Optional - Default branch for coding tasks
JULES_DEFAULT_BRANCH=main
```

## Security & Privacy

This server is designed with a "security-first" approach to protect your repositories and data:

- **Restrictive File Permissions**: Local schedule storage (`~/.jules-mcp`) uses `0o700` directory permissions and `0o600` file permissions, ensuring only the owner can read or write task data.
- **Encrypted Local State**: All scheduled tasks are stored using **AES-256-GCM** encryption. A unique, random 16-byte salt is generated for every write operation to prevent offline attacks and ensure data integrity.
- **PII Leak Prevention**: Raw Jules API responses are sanitized and truncated (max 500 characters) before being included in logs or exceptions, preventing accidental disclosure of proprietary code or personal information in system logs.
- **Generic Validation Errors**: The server returns generic error messages when repository validation fails, preventing the enumeration of your private repository allowlist.
- **Human-in-the-Loop**: Use the `require_plan_approval: true` flag to ensure Jules never modifies code without your explicit review and approval of the generated plan.

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

```text
"Use Jules to add unit tests for the authentication module in my-app-backend repository"
```

The assistant will:

1. Check `jules://sources` to find the repository
2. Call `create_coding_task` tool with appropriate prompt
3. Return the session ID for monitoring

### Scheduling Recurring Tasks

```text
"Schedule Jules to update dependencies every Monday at 9 AM in my-app-backend"
```

The assistant will:

1. Call `schedule_recurring_task` with cron `"0 9 * * 1"`
2. Save the schedule to `~/.jules-mcp/schedules.enc`
3. Confirm the next execution time

### Monitoring Progress

```text
"Check the status of Jules session abc123"
```

The assistant will:

1. Call `get_session_status` or read `jules://sessions/abc123/full`
2. Show current state (PLANNING, IN_PROGRESS, COMPLETED, etc.)
3. Provide next steps based on state

### Reviewing and Approving Plans

```text
"Show me Jules's plan for session abc123 and approve it"
```

The assistant will:

1. Read `jules://sessions/abc123/full` to get the plan
2. Display the plan steps to you
3. Call `manage_session` with `action=approve_plan` after your confirmation

## Migration Guide

The server has migrated from plain JSON storage (`schedules.json`) to encrypted storage (`schedules.enc`).

- **Auto-Migration**: Upon startup, if `schedules.json` is detected, the server automatically encrypts its contents and saves them to `schedules.enc`, then deletes the unencrypted file.
- **Backwards Compatibility**: No manual action is required if you are upgrading from a version that used `schedules.json`.

## Documentation

Detailed documentation has been moved to the `docs/` folder:

- [API Reference](docs/API_REFERENCE.md) - Complete details on available MCP Tools, Resources, and Prompts.
- [Architecture](docs/ARCHITECTURE.md) - System design and the "Thick Server" pattern.
- [Configuration](docs/CONFIGURATION.md) - Environment variables and setup instructions.
- [Examples](docs/EXAMPLES.md) - Example workflows and usage patterns.
- [Quickstart](docs/QUICKSTART.md) - A fast guide to getting up and running.
- [Activepieces Integration](pieces/jules/README.md) - Documentation for the custom Google Jules Activepieces integration.

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

```text
"Create a task but require plan approval before any code changes"
```

This ensures human review before Jules modifies code.

### Safe OpenClaw/Codex Integration

When integrating with autonomous AI agents like OpenClaw or Codex, additional safety measures are enforced:

1. **Auto-PR Defaults**: Prompt templates now encourage setting `auto_create_pr: true` to ensure all AI-driven changes are reviewed as Pull Requests before merging.
2. **Mandatory Review**: It is strongly recommended to set `require_plan_approval: true` for tasks generated by other AI systems to establish trust before allowing direct changes.
3. **Quota-Aware Scheduling**: To respect API limits and prevent unintended runaway tasks, the cron engine validates all schedules. **Schedules must not run more frequently than once per hour**. Daily or weekly intervals are highly recommended for automated maintenance.
4. **Resilient Storage**: Local schedules are saved using atomic file writes with corrupted-state backups to prevent the server from crashing during unexpected failures.

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

Check that `~/.jules-mcp/schedules.enc` exists and is writable.

### TypeScript compilation errors

```bash
npm run typecheck
```

## Development

### Documentation

This project uses **JSDoc** for comprehensive code documentation. Every public function, method, and class is documented with clear descriptions of purpose, parameters, and return values.

To explore the architecture and API details, check the [docs/](docs/) directory.

### Testing

We use **Vitest** for unit and integration testing.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Project Structure

```text
src/
  types/          # TypeScript type definitions (Jules API & local state)
  api/            # Jules API client layer with retry logic
  storage/        # Secure persistence layer (encrypted JSON)
  scheduler/      # Cron engine for recurring task management
  mcp/            # MCP protocol layer (tools, resources, prompts)
  utils/          # Security, rate limiting, and string utilities
  index.ts        # Server entry point and MCP handler setup
pieces/           # Activepieces integration (Google Jules piece)
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
| ---------- | -------- | ------------- |
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

- **Jules API Documentation**: <https://developers.google.com/jules/api>
- **Jules Web Interface**: <https://jules.google>
- **Model Context Protocol**: <https://modelcontextprotocol.io>
- **MCP TypeScript SDK**: <https://github.com/modelcontextprotocol/typescript-sdk>

## License

MIT

## Contributing

This is an open-source implementation. Contributions welcome for:

- Additional prompt templates
- Enhanced error handling
- Webhook support (when Jules API adds it)
- Advanced scheduling features (conditional execution, dependency chains)
