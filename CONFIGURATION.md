# Configuration Guide

## Jules MCP Server Configuration

This guide covers all configuration options for the Jules MCP Server.

## Environment Variables

### Required Configuration

#### JULES_API_KEY

Your Google Jules API key. **This is required** for the server to function.

**How to obtain:**
1. Visit https://jules.google/settings
2. Click "Create API Key"
3. Copy the generated key
4. Set as environment variable

```bash
export JULES_API_KEY="your-key-here"
```

**Security Note:** Keep this key secure. It grants access to modify code in all repositories connected to your Jules account.

### Optional Configuration

#### JULES_ALLOWED_REPOS

Comma-separated list of repository names that can be modified through this server.

**Use case:** Security boundary to prevent accidental or unauthorized modifications to sensitive repositories.

```bash
export JULES_ALLOWED_REPOS="myorg/frontend,myorg/backend-api"
```

**Format:** `owner/repo` (without the `sources/github/` prefix)

**Behavior:**
- If **not set**: All connected repositories can be used
- If **set**: Only listed repositories can be used; attempts to use others will be rejected

#### JULES_DEFAULT_BRANCH

Default git branch for tasks when not specified.

```bash
export JULES_DEFAULT_BRANCH="develop"
```

**Default:** `main`

#### LOG_LEVEL

Logging verbosity level.

```bash
export LOG_LEVEL="debug"
```

**Options:** `debug`, `info`, `warn`, `error`
**Default:** `info`

## MCP Client Configuration

### Claude Desktop

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "jules": {
      "command": "node",
      "args": ["/absolute/path/to/jules-mcp/dist/index.js"],
      "env": {
        "JULES_API_KEY": "your-key-here"
      }
    }
  }
}
```

**After configuration:**
1. Restart Claude Desktop
2. Look for "Jules MCP Server started successfully" in logs
3. Resources and tools should appear in Claude's MCP panel

### Cursor IDE

Cursor uses a similar configuration. Add to your MCP settings:

```json
{
  "mcp": {
    "servers": {
      "jules": {
        "command": "jules-mcp",
        "env": {
          "JULES_API_KEY": "your-key-here"
        }
      }
    }
  }
}
```

### Custom MCP Clients

For other MCP-compatible clients, use the stdio transport:

**Command:** `node /path/to/dist/index.js`
**Transport:** stdio (standard input/output)
**Environment:** Must include `JULES_API_KEY`

## Storage Configuration

### Schedule Persistence

Schedules are stored in: `~/.jules-mcp/schedules.json`

**Schema:**
```json
{
  "version": "1.0.0",
  "schedules": {
    "uuid-here": {
      "id": "uuid-here",
      "name": "Weekly Deps Update",
      "cron": "0 9 * * 1",
      "taskPayload": {
        "prompt": "Update all dependencies...",
        "source": "sources/github/owner/repo",
        "branch": "main",
        "automationMode": "AUTO_CREATE_PR"
      },
      "createdAt": "2025-01-15T10:00:00Z",
      "lastRun": "2025-01-20T09:00:00Z",
      "lastSessionId": "session-id",
      "enabled": true
    }
  }
}
```

**Backup:** Regularly backup this file if you have critical schedules

**Migration:** If you move the server to a new machine, copy this file to preserve schedules

### Changing Storage Location

Currently hardcoded to `~/.jules-mcp/`. To change, modify `src/storage/schedule-store.ts`:

```typescript
// Change this line:
this.storageDir = join(homedir(), '.jules-mcp');

// To custom path:
this.storageDir = process.env.JULES_STORAGE_DIR || join(homedir(), '.jules-mcp');
```

## Security Best Practices

### 1. API Key Management

**DO:**
- Store in environment variables
- Use a secrets manager in production (e.g., AWS Secrets Manager, HashiCorp Vault)
- Rotate keys periodically
- Use separate keys for dev/staging/prod

**DON'T:**
- Commit keys to git
- Share keys between team members
- Log keys in console output

### 2. Repository Access Control

Use the `JULES_ALLOWED_REPOS` allowlist for production deployments:

```bash
# Only allow specific repositories
export JULES_ALLOWED_REPOS="company/safe-sandbox,company/test-env"
```

### 3. Plan Approval Enforcement

For sensitive repositories, always require plan approval:

```typescript
// In your AI assistant prompt:
"Create a task with plan approval required"
```

This ensures human review before code modification.

### 4. Scheduled Task Auditing

Regularly review `jules://schedules/history` to audit autonomous executions:

```
"Show me all scheduled task executions from the last week"
```

### 5. Network Security

If running as an HTTP server (instead of stdio):
- Use TLS/HTTPS only
- Implement authentication (API keys, OAuth)
- Restrict network access (firewall rules, VPN)

## Advanced Configuration

### Custom Logging

To integrate with external logging systems, modify `src/index.ts`:

```typescript
// Add custom logger
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.File({ filename: 'jules-mcp.log' })
  ]
});

// Pass to scheduler
this.scheduler = new CronEngine(
  this.storage,
  this.client,
  (msg) => logger.info(msg)
);
```

### Webhook Integration (Future)

When Jules API adds webhook support, this server can be extended to receive push notifications instead of polling:

```typescript
// Future webhook handler
app.post('/webhooks/jules', async (req, res) => {
  const event = req.body;
  // Translate to MCP notification
  await server.sendNotification({
    method: 'notifications/resources/updated',
    params: { uri: `jules://sessions/${event.sessionId}/full` }
  });
});
```

### Multiple API Keys (Team Usage)

For team deployments, you might want per-user API keys. Extend the server to accept a user identifier and look up the appropriate key from a secure store.

## Performance Tuning

### Concurrent Sessions

Jules has rate limits. Monitor your usage:

```
"How many active Jules sessions do I have?"
```

### Polling Frequency

The server polls for session status. To reduce API calls, increase polling intervals in production (modify `src/api/jules-client.ts` if needed).

### Schedule Density

Avoid scheduling too many tasks to run simultaneously. Stagger cron times:

```
Task 1: "0 9 * * 1"  (9:00 AM Monday)
Task 2: "15 9 * * 1" (9:15 AM Monday)
Task 3: "30 9 * * 1" (9:30 AM Monday)
```

## Support

For issues or questions:
- Jules API: https://developers.google.com/jules/api
- MCP Protocol: https://modelcontextprotocol.io
- This Server: Open an issue on the repository
