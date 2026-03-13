# Activepieces Piece: Google Jules

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

> A custom [Activepieces](https://www.activepieces.com/) piece that integrates [Google Jules](https://jules.google/) — the AI coding agent — into your automation flows.

## What Is This?

This package provides a native Activepieces piece for the Google Jules API (`v1alpha`). Instead of manually configuring HTTP requests to call Jules, you can use these pre-built, type-safe actions and triggers directly in the Activepieces visual builder.

**Jules** is Google's autonomous AI coding agent powered by Gemini. It can independently fix bugs, write features, create tests, and submit pull requests to your GitHub repositories.

## Capabilities

### Authentication

| Property | Description |
|---|---|
| **API Key** | Your Jules API key (`X-Goog-Api-Key`). Generate one at [jules.google/settings](https://jules.google/settings). |
| **Default Repository** | *(Optional)* Default GitHub repo in `owner/repo` format, used when no repo is specified in a step. |

### Actions (5)

| Action | Description |
|---|---|
| **Create Coding Session** | Dispatch a coding task to Jules. Supports auto-PR creation, branch selection, and plan approval gates. |
| **Get Session Status** | Retrieve the current state of a session, including convenience booleans (`isComplete`, `isFailed`, `isWaitingApproval`) and the PR URL. |
| **Approve Session Plan** | Approve a plan for sessions created with `requirePlanApproval: true`. |
| **Send Message to Session** | Send feedback or additional instructions to an active session. |
| **List Session Activities** | Retrieve the full event log for a session — plan generation, progress updates, messages, and completion events. |

### Triggers (1)

| Trigger | Strategy | Description |
|---|---|---|
| **Session Completed** | Polling | Fires when a session reaches a terminal state (`COMPLETED`, `FAILED`, or `CANCELED`). Configurable state filters. Uses time-based deduplication. |

## Project Structure

```text
pieces/jules/
├── package.json                              # Package manifest
├── tsconfig.json                             # TypeScript config
├── README.md                                 # This file
└── src/
    ├── index.ts                              # Piece entry point
    └── lib/
        ├── auth.ts                           # Authentication definition
        ├── api.ts                            # Jules API HTTP client
        ├── actions/
        │   ├── create-session.ts             # Create Coding Session
        │   ├── get-session.ts                # Get Session Status
        │   ├── approve-plan.ts               # Approve Session Plan
        │   ├── send-message.ts               # Send Message to Session
        │   └── list-activities.ts            # List Session Activities
        └── triggers/
            └── session-completed.ts          # Session Completed trigger
```

## Jules API Reference

This piece wraps the following Jules API endpoints:

| Endpoint | Method | Action |
|---|---|---|
| `/v1alpha/sessions` | `POST` | `create_session` |
| `/v1alpha/sessions/{id}` | `GET` | `get_session` |
| `/v1alpha/sessions` | `GET` | (used internally by `session_completed` trigger) |
| `/v1alpha/sessions/{id}:approvePlan` | `POST` | `approve_plan` |
| `/v1alpha/sessions/{id}:sendMessage` | `POST` | `send_message` |
| `/v1alpha/sessions/{id}/activities` | `GET` | `list_activities` |

**Base URL:** `https://jules.googleapis.com/v1alpha`
**Auth:** API Key via `X-Goog-Api-Key` header

## Example Flows

### Bug Fix Automation

```text
GitHub Issue (labeled "jules-fix")
  → Create Coding Session (prompt from issue body)
  → Slack notification (session started)
  → GitHub comment (session ID + status)
```

### Slack-Driven Coding

```text
Slack Command (@bot jules owner/repo fix the login bug)
  → Create Coding Session (auto-PR enabled)
  → Slack reply (session ID + link)
```

### Scheduled Maintenance

```text
Schedule (weekly Monday 6 AM)
  → Loop over repos from Google Sheet
  → Create Coding Session ("update dependencies, fix lint")
  → Log results to Google Sheet
  → Slack digest
```

### Approval Workflow

```text
ClickUp task → "Ready for AI"
  → Create Coding Session (requirePlanApproval: true)
  → Slack "Request Approval"
  → On approve → Approve Session Plan
  → Poll Get Session Status until complete
  → Update ClickUp + Slack
```

## Installation

### For Activepieces Self-Hosted

1. Clone this repository (or copy `pieces/jules/` into your Activepieces pieces directory)
2. Install dependencies:

   ```bash
   cd pieces/jules
   npm install
   ```

3. Build:

   ```bash
   npm run build
   ```

4. Sync to your Activepieces instance using the [Activepieces CLI](https://www.activepieces.com/docs/build-pieces/building-pieces/overview)

### For Development

```bash
# From the project root
cd pieces/jules
npm install
npm run typecheck   # Validate types
npm run build       # Compile to dist/
```

## Session States

Jules sessions progress through these states:

| State | Description |
|---|---|
| `QUEUED` | Session is waiting to start |
| `PLANNING` | Jules is analyzing the task and generating a plan |
| `AWAITING_PLAN_APPROVAL` | Plan ready, waiting for human approval |
| `IN_PROGRESS` | Jules is writing code |
| `AWAITING_USER_FEEDBACK` | Jules has a question and is waiting for your response |
| `PAUSED` | Session is paused |
| `COMPLETED` | ✅ Task finished — check `outputs` for PR URL |
| `FAILED` | ❌ Task failed |
| `CANCELED` | Session was canceled |

## Security

- **API keys are stored as encrypted Activepieces connections**, never in flow step configs
- This piece does **not** log or expose API keys in step outputs
- The Jules API key grants access to modify repositories — treat it with the same care as a GitHub personal access token
- Generate keys at [jules.google/settings](https://jules.google/settings) and rotate regularly

## Relationship to jules-mcp-server

This piece is part of the [`jules-mcp-server`](../../README.md) project, which provides a Model Context Protocol (MCP) server for the Jules API. The piece and the MCP server share the same API surface but serve different purposes:

| | MCP Server | Activepieces Piece |
|---|---|---|
| **For** | AI assistants (Claude, Gemini) | No-code automation flows |
| **Protocol** | Model Context Protocol | Activepieces Pieces Framework |
| **Scheduling** | Built-in cron via `node-schedule` | Activepieces schedule triggers |
| **Auth** | Environment variable (`JULES_API_KEY`) | Activepieces connection (encrypted) |

## License

MIT — see [LICENSE](../../LICENSE) for details.
