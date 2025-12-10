# Architecture Documentation

## System Overview

The Jules MCP Server implements a **"Thick Server"** architecture that bridges the stateless Google Jules API with the stateful requirements of autonomous scheduling. This design pattern makes the MCP server a sophisticated control plane rather than a passive API proxy.

## Architectural Layers

### Layer 1: MCP Protocol Interface

**Technology:** `@modelcontextprotocol/sdk`
**Transport:** Stdio (standard input/output)
**Responsibility:** JSON-RPC 2.0 communication with MCP Hosts (Claude Desktop, Cursor, etc.)

**Key Components:**
- `Server` class from MCP SDK
- `StdioServerTransport` for local subprocess communication
- Request handlers for resources, tools, and prompts

**Protocol Flow:**
```
MCP Host → stdin → JSON-RPC Request → Request Handler → Tool/Resource → Response → stdout → MCP Host
```

### Layer 2: Jules API Client Abstraction

**File:** `src/api/jules-client.ts`
**Responsibility:** Type-safe HTTP communication with Jules API

**Features:**
- **Authentication:** Automatic `X-Goog-Api-Key` header injection
- **Error handling:** Structured error responses with status codes
- **Type safety:** Full TypeScript interfaces for all endpoints
- **Retry logic:** Exponential backoff for rate limits (planned)

**Endpoints Wrapped:**
| Method | Endpoint | Function |
|--------|----------|----------|
| GET | `/sources` | `listSources()` |
| GET | `/sources/{name}` | `getSource()` |
| POST | `/sessions` | `createSession()` |
| GET | `/sessions` | `listSessions()` |
| GET | `/sessions/{id}` | `getSession()` |
| POST | `/sessions/{id}:approvePlan` | `approvePlan()` |
| POST | `/sessions/{id}:sendMessage` | `sendMessage()` |
| GET | `/sessions/{id}/activities` | `listActivities()` |

### Layer 3: State Management (Local Persistence)

**File:** `src/storage/schedule-store.ts`
**Technology:** File-based JSON storage
**Location:** `~/.jules-mcp/schedules.json`

**Why File-Based?**
1. **Portability:** Works across all platforms (macOS, Windows, Linux)
2. **No dependencies:** No database server required
3. **Inspectable:** Users can manually view/edit schedules
4. **Backup-friendly:** Simple file copy for disaster recovery

**Data Schema:**
```typescript
interface ScheduleStore {
  version: string;              // Schema version for migrations
  schedules: {
    [id: string]: ScheduledTask // Map of UUID to task
  };
}
```

**Operations:**
- `load()` - Reads from disk with caching
- `save()` - Atomic write with JSON formatting
- `upsertTask()` - Add or update schedule
- `getTask()` / `getTaskByName()` - Retrieve by ID or name
- `listTasks()` - Get all schedules
- `deleteTask()` - Remove schedule
- `updateLastRun()` - Record execution metadata

### Layer 4: Scheduling Engine

**File:** `src/scheduler/cron-engine.ts`
**Technology:** `node-schedule`
**Responsibility:** In-memory cron job management

**Lifecycle:**

```
Server Startup
    ↓
storage.load() → Read schedules.json
    ↓
For each enabled schedule:
    ↓
scheduleTask() → Create node-schedule Job
    ↓
Job stored in Map<id, Job>
    ↓
Cron fires at scheduled time
    ↓
jobCallback() → client.createSession()
    ↓
storage.updateLastRun() → Record execution
```

**Key Methods:**
- `initialize()` - Hydrates schedules on startup
- `scheduleTask()` - Registers cron job in memory
- `cancelTask()` - Removes job from memory
- `getNextInvocation()` - Calculates next run time
- `rescheduleTask()` - Updates existing schedule
- `shutdown()` - Graceful cleanup on exit

**Thread Safety:**
- `node-schedule` is single-threaded (Node.js event loop)
- All async operations use proper `await`
- No race conditions on schedule map

### Layer 5: MCP Resource Layer

**File:** `src/mcp/resources.ts`
**Responsibility:** Expose read-only context to AI

**Resources Implemented:**

#### jules://sources
- **Purpose:** Repository discovery
- **Data Source:** `GET /v1alpha/sources` (Jules API)
- **Format:** Simplified JSON list
- **Update Frequency:** On-demand (fetched per request)

#### jules://sessions/list
- **Purpose:** Recent session summary
- **Data Source:** `GET /v1alpha/sessions`
- **Optimization:** Limited to 50 most recent
- **Use Case:** Duplication checking, status reporting

#### jules://sessions/{id}/full
- **Purpose:** Deep dive into specific session
- **Data Sources:** Parallel fetch of:
  - `GET /v1alpha/sessions/{id}` (session state)
  - `GET /v1alpha/sessions/{id}/activities` (event log)
- **Synthesis:** Combined into single JSON object
- **Artifact Handling:** Code diffs formatted for readability

#### jules://schedules
- **Purpose:** Local schedule visibility
- **Data Source:** Local storage (schedules.json)
- **Live Data:** Includes next run time from scheduler
- **Use Case:** Audit, management

#### jules://schedules/history
- **Purpose:** Execution audit trail
- **Data Source:** `lastRun` fields in storage
- **Sorted:** Most recent first
- **Compliance:** SOC 2, ISO 27001 audit trail

### Layer 6: MCP Tools Layer

**File:** `src/mcp/tools.ts`
**Responsibility:** Executable actions for AI

**Input Validation:** All tools use Zod schemas for type safety and validation before API calls.

**Error Handling Pattern:**
```typescript
try {
  // Execute tool logic
  const result = await apiCall();
  return JSON.stringify({ success: true, ...result });
} catch (error) {
  return JSON.stringify({
    success: false,
    error: error.message
  });
}
```

**Tool Catalog:**

| Tool | API Mapping | Consequential | Async |
|------|-------------|---------------|-------|
| `create_coding_task` | `POST /sessions` | No* | Yes |
| `manage_session` (approve) | `POST /sessions/{id}:approvePlan` | Yes | Yes |
| `manage_session` (message) | `POST /sessions/{id}:sendMessage` | No | Yes |
| `get_session_status` | `GET /sessions/{id}` | No | Yes |
| `schedule_recurring_task` | Local only | Yes | No |
| `list_schedules` | Local only | No | No |
| `delete_schedule` | Local only | Yes | No |

\* The tool itself returns immediately (not consequential), but the session it creates performs consequential actions asynchronously.

### Layer 7: MCP Prompts Layer

**File:** `src/mcp/prompts.ts`
**Responsibility:** Template-based guidance

**Prompt Architecture:**
```typescript
interface PromptTemplate {
  name: string;                    // Unique identifier
  description: string;             // What it's for
  arguments: ArgumentDefinition[]; // Required/optional args
  template: (args) => string;      // Rendering function
}
```

**Prompts Provided:**
1. **refactor_module** - Structured refactoring guidance
2. **setup_weekly_maintenance** - Automated maintenance bootstrapping
3. **audit_security** - OWASP-focused security scan
4. **fix_failing_tests** - Test failure resolution workflow
5. **update_dependencies** - Breaking change-aware updates

## Data Flow: Task Creation

### Immediate Task (create_coding_task)

```
User (via AI): "Fix bug X"
    ↓
MCP Host: CallTool{name: "create_coding_task", args: {...}}
    ↓
src/index.ts: CallToolRequestSchema handler
    ↓
CreateTaskSchema.parse(args) → Validation
    ↓
tools.createCodingTask(validated)
    ↓
client.createSession({...}) → POST /v1alpha/sessions
    ↓
Jules API: Session created, returns {id, state: "QUEUED"}
    ↓
Return to Host: {sessionId, monitorUrl, ...}
    ↓
AI tells User: "Task started. Session ID: abc123. Monitor at: jules://sessions/abc123/full"
```

### Scheduled Task (schedule_recurring_task)

```
User (via AI): "Schedule weekly deps update"
    ↓
MCP Host: CallTool{name: "schedule_recurring_task", ...}
    ↓
ScheduleTaskSchema.parse(args) → Validation
    ↓
CronEngine.validateCronExpression() → Cron syntax check
    ↓
storage.getTaskByName() → Check for collision
    ↓
Create ScheduledTask object with UUID
    ↓
storage.upsertTask() → Write to ~/.jules-mcp/schedules.json
    ↓
scheduler.scheduleTask() → Register node-schedule Job
    ↓
Job stored in memory Map<id, Job>
    ↓
Return: {success, nextExecution, ...}
    ↓
[Later, when cron fires]
    ↓
jobCallback() → client.createSession() → POST /sessions
    ↓
storage.updateLastRun() → Record execution in schedules.json
    ↓
Jules session runs autonomously
```

## State Management: Hybrid Architecture

### Remote State (Jules API)

**Owned by:** Google Jules backend
**Authoritative for:**
- Sessions and their lifecycle states
- Activities and execution logs
- Connected sources (repositories)

**Access Pattern:** Poll via HTTP GET requests
**Persistence:** Google's infrastructure
**Visibility:** Available in Jules web UI

### Local State (MCP Server)

**Owned by:** This MCP server instance
**Authoritative for:**
- Scheduled tasks (cron expressions, payloads)
- Schedule execution history (lastRun timestamps)
- Schedule enable/disable status

**Access Pattern:** Direct file I/O
**Persistence:** User's local filesystem
**Visibility:** Only via MCP resources or direct file access

### Synchronization

**No sync needed** - these are independent state domains:
- Schedules define *when* to create sessions
- Sessions are the *result* of schedule execution
- Linkage via `lastSessionId` field in schedule metadata

## Security Architecture

### Defense in Depth

```
Layer 1: Environment Validation
    ↓ JULES_API_KEY required
    ↓ JULES_ALLOWED_REPOS filter (optional)
    ↓
Layer 2: Schema Validation
    ↓ Zod schema parsing
    ↓ Type checking
    ↓
Layer 3: Business Logic Validation
    ↓ Repository existence check (jules://sources)
    ↓ Cron expression validation
    ↓ Name collision detection
    ↓
Layer 4: Jules API
    ↓ Google's authentication and authorization
    ↓ GitHub App permission checks
    ↓
Layer 5: GitHub Protection
    ↓ Branch protection rules
    ↓ Required reviewers
    ↓ Status checks
```

### Threat Mitigation

| Threat | Mitigation | Layer |
|--------|------------|-------|
| API key theft | Environment variables only, never in code | Dev Practice |
| Unauthorized repo access | JULES_ALLOWED_REPOS allowlist | Input Validation |
| Malicious prompts | Plan approval requirement | Business Logic |
| Schedule injection | Persistent storage in user home directory | File System |
| Man-in-the-middle | HTTPS for all Jules API calls | Transport |

## Performance Characteristics

### Latency

| Operation | Expected Latency | Notes |
|-----------|-----------------|-------|
| `list_sources` tool | 200-500ms | HTTP GET, cached by Jules |
| `create_coding_task` tool | 300-800ms | HTTP POST, returns immediately |
| `get_session_status` tool | 200-400ms | HTTP GET, fast |
| `schedule_recurring_task` tool | <50ms | Local file I/O only |
| Resource read (local) | <10ms | File I/O |
| Resource read (remote) | 200-600ms | HTTP GET to Jules |

### Scalability

**Concurrent Sessions:**
- MCP server can handle unlimited concurrent tool calls (Node.js event loop)
- Jules API has rate limits (unknown, likely 60 tasks/day for free tier)

**Scheduled Tasks:**
- Practical limit: ~100-200 schedules per server instance
- `node-schedule` can handle thousands of jobs
- Bottleneck: Jules API quotas, not scheduler

**Memory Usage:**
- Base: ~50MB (Node.js runtime + dependencies)
- Per schedule: ~1KB (schedule metadata)
- Per active session monitor: ~5KB

## Extensibility Points

### Adding New Tools

1. Define Zod schema in `src/mcp/tools.ts`
2. Implement tool method in `JulesTools` class
3. Register in `src/index.ts` ListToolsRequestSchema handler
4. Add call routing in CallToolRequestSchema handler

### Adding New Resources

1. Implement getter in `src/mcp/resources.ts`
2. Register URI in ListResourcesRequestSchema handler
3. Add routing logic in ReadResourceRequestSchema handler

### Adding New Prompts

1. Define template in `src/mcp/prompts.ts` JULES_PROMPTS array
2. Automatic registration via ListPromptsRequestSchema handler

### Custom Storage Backend

Replace `ScheduleStorage` implementation:
- Keep same interface
- Swap `readFile/writeFile` with database calls
- Options: PostgreSQL, Redis, MongoDB

Example:
```typescript
class PostgresScheduleStorage implements ScheduleStorage {
  async load(): Promise<ScheduleStore> {
    const result = await db.query('SELECT * FROM schedules');
    // ... convert to ScheduleStore
  }
}
```

## Deployment Models

### Model 1: Local Development (stdio)

```
Claude Desktop (MCP Host)
    ↓ spawns subprocess
Jules MCP Server (Node.js process)
    ↓ HTTPS
Google Jules API
    ↓ GitHub API
User's GitHub Repositories
```

**Characteristics:**
- API key on local machine
- Schedules run only when computer is on
- Zero network configuration
- Minimal latency

### Model 2: Team Server (HTTP/SSE)

```
Multiple AI Clients
    ↓ HTTPS/SSE
Jules MCP Server (Docker container)
    ↓ HTTPS
Google Jules API
    ↓ GitHub API
Team GitHub Repositories
```

**Characteristics:**
- API key in Docker secret
- 24/7 schedule execution
- Requires load balancer and auth
- Higher latency

**Implementation Change:**
Replace `StdioServerTransport` with `StreamableHTTPServerTransport` in `src/index.ts`.

## Design Decisions

### Why TypeScript?

1. **Type Safety:** Catch errors at compile time
2. **MCP SDK Native:** Official SDK is TypeScript
3. **Editor Support:** Superior autocomplete and refactoring
4. **Maintainability:** Self-documenting code via types

### Why node-schedule over cron?

1. **Cross-platform:** Works on Windows (no cron)
2. **Programmatic:** Jobs in code, not separate crontab
3. **Flexible:** Can use Date objects or cron strings
4. **Job Management:** Easy to list, cancel, reschedule

### Why File Storage over Database?

1. **Simplicity:** No database server to manage
2. **Portability:** Works anywhere Node.js runs
3. **Transparency:** Users can inspect schedules.json
4. **Backup:** Simple file copy

**Trade-off:** Not suitable for >1000 schedules or multi-server deployments. For those cases, migrate to PostgreSQL/Redis.

### Why Stdio Transport?

1. **Security:** API key stays local, never transmitted
2. **Simplicity:** No network configuration
3. **IDE Integration:** Standard MCP pattern
4. **Performance:** No HTTP overhead

**Trade-off:** Cannot share one server across multiple machines. For teams, deploy HTTP mode.

## Error Handling Philosophy

### Fail Fast

Invalid inputs are rejected immediately with descriptive errors:
- Invalid cron expressions
- Missing required parameters
- Repository not in allowlist

### Graceful Degradation

API failures don't crash the server:
- HTTP errors wrapped in try/catch
- Tool returns `{ success: false, error: "..." }`
- Server continues running

### Explicit Error Messages

Errors guide the user to resolution:
- "Repository 'X' not found. Please check jules://sources"
- "Invalid cron expression. Format: minute hour day month weekday"

## Testing Strategy

### Unit Tests (Planned)

- `JulesClient`: Mock fetch responses
- `ScheduleStorage`: Mock filesystem
- `CronEngine`: Mock node-schedule
- Schema validation: Test all Zod schemas

### Integration Tests (Planned)

- End-to-end: Start server, call tools, verify results
- Schedule execution: Trigger cron job manually
- Resource rendering: Verify JSON output format

### Manual Testing

Current testing approach:
1. Configure with test API key
2. Connect to Claude Desktop
3. Execute each tool via Claude
4. Verify Jules web UI shows expected sessions

## Monitoring and Observability

### Logging

**MCP Logging Protocol:**
- All scheduler events logged via `server.sendLoggingMessage()`
- Log levels: `info`, `warn`, `error`, `debug`
- Visible in Claude Desktop developer console

**Log Events:**
- Server startup
- Schedule hydration (task count)
- Schedule execution (task name, session ID)
- Schedule failures (errors)
- API errors

### Metrics (Planned)

Future additions:
- Task success/failure rates
- Average session duration
- Schedule execution reliability
- API response times

## Concurrency Model

### Async/Await

All I/O operations use async/await:
- HTTP requests (Jules API)
- File I/O (schedule storage)
- Parallel fetching (session + activities)

### No Blocking Operations

The server never blocks the event loop:
- `fetch()` is non-blocking
- File I/O uses `fs/promises`
- Scheduler callbacks are async

### Concurrent Tool Calls

MCP Host can call multiple tools in parallel:
- Each tool call is independent
- Shared state (schedules) uses async locks (implicit in Node.js)

## Future Architecture Evolution

### When Jules API Adds Native Scheduling

**Migration Path:**
1. Add new tool: `create_native_schedule` (wraps new API endpoint)
2. Deprecate `schedule_recurring_task` (with warning)
3. Provide migration script: Convert local schedules to API schedules
4. Remove local scheduler after 6-month transition period

**Backward Compatibility:**
```typescript
async scheduleRecurringTask(args) {
  if (JULES_API_SUPPORTS_SCHEDULING) {
    // New path: Use API
    return this.client.createSchedule(args);
  } else {
    // Legacy path: Use local scheduler
    return this.localScheduler.schedule(args);
  }
}
```

### Webhook Support

When Jules adds webhooks for session events:

**Architecture Change:**
```
Jules API
    ↓ HTTP POST (webhook)
Webhook Server (new component in src/webhooks/)
    ↓ MCP Notification
MCP Host
    ↓ UI update
User sees real-time progress
```

**Implementation:**
- Add Express.js HTTP server
- Expose `/webhooks/jules` endpoint
- Verify webhook signatures
- Translate to MCP notifications
- Emit `resources/updated` for `jules://sessions/{id}/full`

## Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.0.4 | MCP protocol implementation |
| `node-schedule` | ^2.1.1 | Cron scheduling engine |
| `zod` | ^3.23.8 | Schema validation |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.7.2 | Type checking and compilation |
| `@types/node` | ^22.10.2 | Node.js type definitions |
| `@types/node-schedule` | ^2.1.7 | node-schedule types |
| `tsx` | ^4.19.2 | TypeScript execution for development |

### Why These Specific Versions?

- MCP SDK: Latest stable (1.x) for modern protocol features
- node-schedule: Proven, stable (2.x), widely used
- Zod: Fastest schema validation library, excellent TypeScript integration

## Code Organization Principles

### Separation of Concerns

Each layer has a single responsibility:
- `api/` - HTTP communication only
- `storage/` - Persistence only
- `scheduler/` - Cron execution only
- `mcp/` - Protocol implementation only

### Type Safety

- Every API response has a TypeScript interface
- No `any` types (except in safe contexts)
- Zod for runtime validation
- Types in separate `types/` directory for reuse

### Testability

- Constructor injection (pass dependencies)
- Pure functions where possible
- Mockable HTTP client
- Mockable filesystem

### Maintainability

- Clear file structure
- Comprehensive comments
- Consistent error handling
- Descriptive variable names

## Operational Runbook

### Server Startup

1. Load `JULES_API_KEY` from environment
2. Instantiate `JulesClient`
3. Instantiate `ScheduleStorage`
4. Instantiate `CronEngine`
5. Call `scheduler.initialize()` to hydrate schedules
6. Create `StdioServerTransport`
7. Call `server.connect(transport)`
8. Register SIGINT/SIGTERM handlers
9. Log "Server started"

### Server Shutdown

1. Receive SIGINT/SIGTERM
2. Call `scheduler.shutdown()` to cancel all jobs
3. `schedule.gracefulShutdown()` cleanup
4. Exit process

### Schedule Execution

1. Cron timer fires
2. `jobCallback()` invoked
3. `client.createSession()` called
4. Session ID captured
5. `storage.updateLastRun()` updates metadata
6. Log execution result

### Disaster Recovery

**Scenario:** Schedules.json corrupted

**Recovery:**
1. Server will create new empty file
2. Lost schedules must be recreated
3. Recommendation: Backup schedules.json regularly

**Prevention:**
- Atomic writes (write to temp file, then rename)
- JSON validation on load
- Version field for future migrations

## References

- Jules API: https://developers.google.com/jules/api
- MCP Specification: https://modelcontextprotocol.io/specification
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- node-schedule: https://github.com/node-schedule/node-schedule
