# Changelog

All notable changes to the Jules MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-15

### Added

#### Core Features
- **Jules API Integration**: Complete TypeScript client for Google Jules v1alpha API
  - List sources (connected repositories)
  - Create coding sessions
  - Approve plans
  - Send messages to sessions
  - List session activities
  - Get session status

#### MCP Resources
- `jules://sources` - Connected GitHub repositories
- `jules://sessions/list` - Recent sessions summary
- `jules://sessions/{id}/full` - Complete session details with activities
- `jules://schedules` - Active scheduled tasks
- `jules://schedules/history` - Execution audit trail

#### MCP Tools
- `create_coding_task` - Create immediate Jules sessions
- `manage_session` - Approve plans and send feedback
- `get_session_status` - Poll session progress
- `schedule_recurring_task` - Create cron-based recurring tasks
- `list_schedules` - View all schedules
- `delete_schedule` - Remove schedules

#### MCP Prompts
- `refactor_module` - Guided refactoring template
- `setup_weekly_maintenance` - Automated maintenance workflow
- `audit_security` - Security audit template
- `fix_failing_tests` - Test failure resolution
- `update_dependencies` - Dependency management template

#### Scheduling Engine ("Thick Server" Pattern)
- **Local persistence**: Schedules stored in `~/.jules-mcp/schedules.json`
- **Cron engine**: Built on `node-schedule` for reliable execution
- **State management**: Survives server restarts
- **Execution history**: Audit trail for compliance
- **Timezone support**: Configure execution timezone

#### Security Features
- **API key validation**: Required environment variable
- **Repository allowlist**: `JULES_ALLOWED_REPOS` restriction
- **Plan approval enforcement**: Human-in-the-loop gates
- **Audit logging**: Complete execution history
- **Error handling**: Comprehensive error messages

#### Developer Experience
- **TypeScript**: Full type safety
- **Zod validation**: Input schema validation
- **Stdio transport**: Local subprocess mode
- **Structured logging**: MCP logging protocol
- **Graceful shutdown**: Proper cleanup on exit

### Documentation
- `README.md` - Complete feature overview and installation
- `QUICKSTART.md` - 5-minute setup guide
- `CONFIGURATION.md` - All configuration options
- `SECURITY.md` - Security best practices
- `EXAMPLES.md` - Practical usage scenarios
- `API_REFERENCE.md` - Complete API documentation
- `.env.example` - Environment template

### Infrastructure
- TypeScript configuration
- Package.json with proper module settings
- Build scripts (build, dev, typecheck)
- .gitignore for security and cleanliness

## [Unreleased]

### Planned Features

#### Near-term (When Jules API Supports)
- **Webhook integration**: Real-time notifications instead of polling
- **Native scheduling**: Migrate to Jules API when scheduling endpoints released
- **Session cancellation**: Cancel in-progress sessions
- **Batch operations**: Create multiple sessions atomically

#### Medium-term
- **Conditional scheduling**: Execute only if conditions met (e.g., if tests fail)
- **Dependency chains**: Task B runs only after Task A completes
- **Template library**: Expand prompt templates for common workflows
- **Session templates**: Save and reuse complex session configurations
- **Multi-repository tasks**: Coordinate changes across repos

#### Long-term
- **HTTP transport mode**: For remote/team deployments
- **Web dashboard**: Visual interface for schedule management
- **Metrics and analytics**: Track Jules usage and success rates
- **Integration marketplace**: Pre-built integrations for popular tools

### Known Limitations

- **No native scheduling in Jules API**: Schedules are local to MCP server
- **Polling-based monitoring**: No real-time push notifications (yet)
- **Single API key**: No multi-user support in v1alpha
- **No session cancellation**: Cannot abort running tasks via API

## Version History

### Version Numbering

- **Major version (1.x.x)**: Breaking changes to MCP tool/resource interfaces
- **Minor version (x.1.x)**: New features, backward compatible
- **Patch version (x.x.1)**: Bug fixes, documentation updates

### Upgrade Guide

When upgrading:

1. **Backup schedules:** Copy `~/.jules-mcp/schedules.json`
2. **Review changelog:** Check for breaking changes
3. **Update dependencies:** `npm install`
4. **Rebuild:** `npm run build`
5. **Restart MCP client:** Restart Claude Desktop or IDE
6. **Verify:** Test with simple task creation

## Breaking Changes Policy

We will avoid breaking changes where possible. When necessary:
- Major version bump
- Migration guide provided
- Deprecation warnings in previous version
- Backward compatibility period (minimum 3 months)

## Contributing

See contribution guidelines in README.md.

## License

MIT License - See LICENSE file for details.
