# Security Policy

## Overview

The Jules MCP Server grants AI assistants the ability to create, schedule, and approve code modifications. This inherently introduces security considerations that must be addressed through defense-in-depth strategies.

## Threat Model

### Attack Vectors

1. **Compromised API Key**: If your `JULES_API_KEY` leaks, an attacker can create arbitrary coding tasks on connected repositories
2. **Malicious Prompts**: An AI model could be manipulated to create harmful tasks (e.g., data exfiltration, backdoor installation)
3. **Schedule Injection**: Unauthorized creation of scheduled tasks that execute malicious code changes
4. **Repository Confusion**: Tasks targeting the wrong repository due to naming ambiguity

### Assets at Risk

- **Source Code**: All repositories connected to your Jules account
- **Secrets**: Environment variables or credentials in repositories
- **CI/CD Pipelines**: Modifications could trigger malicious builds

## Security Controls

### 1. API Key Protection

**Storage:**
- NEVER commit `JULES_API_KEY` to version control
- Use environment variables or secrets management systems
- For CI/CD, use secure environment injection (GitHub Secrets, GitLab CI Variables)

**Rotation:**
- Jules supports up to 3 active keys
- Rotate keys quarterly or immediately after suspected compromise
- Revoke old keys in Jules settings after rotation

**Access Control:**
- Limit who has access to the API key
- Use separate keys for different environments (dev/staging/prod)
- Audit key usage through Jules's web interface

### 2. Repository Allowlist (Mandatory for Production)

Set `JULES_ALLOWED_REPOS` to restrict modification scope:

```bash
# Only allow non-critical repositories
export JULES_ALLOWED_REPOS="myorg/sandbox,myorg/test-repo"
```

**Implementation:** The server validates the `source` parameter in `create_coding_task` against this list before calling the API.

**Enforcement Logic:**
```typescript
if (process.env.JULES_ALLOWED_REPOS) {
  const allowed = process.env.JULES_ALLOWED_REPOS.split(',');
  const repoName = source.replace('sources/github/', '');
  if (!allowed.includes(repoName)) {
    throw new Error('Repository not in JULES_ALLOWED_REPOS');
  }
}
```

### 3. Plan Approval Workflow

For repositories containing sensitive logic or production code:

**Always use `require_plan_approval: true`:**

```
"Create a task on prod-backend with plan approval required"
```

**Review Process:**
1. Jules generates plan → Session enters `AWAITING_PLAN_APPROVAL`
2. Read `jules://sessions/{id}/full` to review proposed changes
3. Human reviews for:
   - Unintended side effects
   - Security vulnerabilities introduced
   - Breaking changes
4. Explicitly approve via `manage_session` tool

**Bypass Protection:** The server could enforce approval for specific repositories:

```typescript
// In createCodingTask tool
const criticalRepos = ['owner/production-api', 'owner/customer-portal'];
if (criticalRepos.some(repo => source.includes(repo))) {
  // Force approval regardless of user request
  requestBody.requirePlanApproval = true;
}
```

### 4. Audit Logging

**Local Logs:**
- All scheduled task executions logged to `~/.jules-mcp/schedules.json` (lastRun, lastSessionId)
- Resource: `jules://schedules/history` provides audit trail

**Recommendations:**
- Forward logs to centralized logging (Splunk, ELK, CloudWatch)
- Set up alerts for unexpected schedule executions
- Periodically review `jules://sessions/list` for suspicious tasks

**Example Audit Query:**
```
"Show me all Jules sessions created in the last 7 days"
```

### 5. Least Privilege Principle

**GitHub App Permissions:**
- Grant Jules only the minimum repository permissions needed
- Use read-only repositories for experimentation
- Restrict Jules's access to specific repositories in the GitHub App settings

**Branch Protection:**
- Even with `AUTO_CREATE_PR`, protect main branches with:
  - Required reviews
  - Required status checks
  - No force push
- This ensures Jules's PRs still require human approval before merge

### 6. Scheduled Task Security

**Risk:** Scheduled tasks run without human interaction, potentially at 3 AM when no one is monitoring.

**Mitigations:**
- **Notifications**: Set up alerts when scheduled tasks execute (integrate with Slack, email, etc.)
- **Dry Run Mode**: For new schedules, test with `require_plan_approval: true` first
- **Schedule Review**: Regularly audit `jules://schedules` to ensure only legitimate tasks exist

**Critical Schedule Security:**
```typescript
// Before persisting a schedule, validate:
if (taskPayload.requirePlanApproval === false && isCriticalRepo(source)) {
  throw new Error('Autonomous mode not allowed for critical repositories');
}
```

### 7. Dependency Security

This server depends on external packages. Maintain security hygiene:

```bash
# Audit dependencies
npm audit

# Update to patched versions
npm audit fix

# Use exact versions (not ^ or ~)
# In package.json: "zod": "3.23.8" (not "^3.23.8")
```

**Regularly update:**
- `@modelcontextprotocol/sdk` - MCP protocol updates
- `node-schedule` - Cron engine
- `zod` - Schema validation

## Incident Response

### Suspected API Key Compromise

1. **Immediate:** Revoke the compromised key in Jules settings (https://jules.google/settings)
2. **Investigate:** Check `jules://sessions/list` for unauthorized tasks
3. **Review:** Examine `jules://schedules` for injected schedules
4. **Rotate:** Generate new key and update environment configuration
5. **Audit:** Review GitHub PRs created by Jules for malicious changes

### Malicious Task Detected

1. **Cancel:** If session is in progress, it may be cancellable (check Jules UI)
2. **Review Activities:** Read `jules://sessions/{id}/full` to see what was executed
3. **Examine PR:** If a PR was created, review the diff carefully
4. **Revert:** Close the PR or revert the changes
5. **Investigate:** Determine how the malicious prompt was generated

### Unauthorized Schedule Execution

1. **Delete Schedule:** Use `delete_schedule` tool immediately
2. **Check Storage:** Manually inspect `~/.jules-mcp/schedules.json` for tampering
3. **Review History:** Examine `jules://schedules/history` for execution times
4. **Lock Down:** Add repository allowlist if not already in place

## Deployment Security

### Local Development

For personal use on a laptop:
- API key in shell profile or `.env`
- MCP server runs as stdio subprocess of Claude Desktop
- Minimal attack surface (no network exposure)

### Team Deployment (Docker/Server)

For shared usage on a server:

**Transport:** Switch to HTTP with authentication
**API Keys:** Use per-user keys via OAuth proxy
**Network:** Restrict access via firewall (only allow specific IPs)
**TLS:** Always use HTTPS with valid certificates
**Monitoring:** Real-time alerting on task creation

**Example Secure Deployment:**
```dockerfile
FROM node:18-alpine
RUN addgroup -g 1001 jules && adduser -D -u 1001 -G jules jules
USER jules
WORKDIR /app
COPY --chown=jules:jules . .
RUN npm install && npm run build
CMD ["node", "dist/index.js"]
```

**Secrets Management:**
```yaml
# Kubernetes secret
apiVersion: v1
kind: Secret
metadata:
  name: jules-api-key
type: Opaque
data:
  JULES_API_KEY: <base64-encoded-key>
```

## Responsible AI Use

### Prompt Injection Resistance

AI models can be vulnerable to prompt injection. The MCP server cannot fully prevent this, but:

**Validation:** All tool inputs are validated with Zod schemas
**Sanitization:** User-provided strings are not executed as code
**Logging:** All tool calls are logged for audit

**User Responsibility:** Review prompts sent to Jules, especially in automated workflows

### Autonomous Agent Guardrails

If using this server with a fully autonomous agent (no human in loop):

1. **Start Small**: Test on non-critical repositories
2. **Approve Plans**: Keep `require_plan_approval: true` initially
3. **Monitor**: Set up real-time monitoring of Jules sessions
4. **Rate Limit**: Limit scheduled task frequency
5. **Escape Hatch**: Have a process to quickly disable the server

## Compliance Considerations

### Data Privacy

- Jules operates in Google Cloud VMs
- Code is transmitted to Google's infrastructure
- Ensure compliance with your organization's data policies
- **Do not** use Jules on repositories containing:
  - Customer PII
  - Regulated data (HIPAA, PCI-DSS)
  - Trade secrets (unless approved)

### Audit Requirements

For regulated industries:
- Maintain logs of all Jules sessions
- Implement approval workflows
- Document who approved what changes
- Retain records per compliance requirements (SOC 2, ISO 27001)

## Security Checklist

Before deploying in production:

- [ ] API key stored securely (not in code)
- [ ] `JULES_ALLOWED_REPOS` configured
- [ ] Plan approval required for critical repos
- [ ] Audit logging enabled
- [ ] Dependency audit passed (`npm audit`)
- [ ] Test on non-critical repository first
- [ ] Scheduled tasks reviewed and validated
- [ ] Incident response plan documented
- [ ] Team trained on security protocols
- [ ] Monitoring and alerting configured

## Reporting Security Issues

If you discover a security vulnerability in this server:

1. **Do NOT** open a public issue
2. Email security details to the maintainers
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

## License

This security policy is part of the Jules MCP Server project (MIT License).
