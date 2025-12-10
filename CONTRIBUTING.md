# Contributing to Jules MCP Server

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Git
- A Jules API key (for testing)
- TypeScript knowledge

### Getting Started

```bash
# Fork and clone the repository
git clone https://github.com/yourusername/jules-mcp.git
cd jules-mcp

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env and add your JULES_API_KEY

# Start development mode
npm run dev
```

### Development Workflow

1. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes:**
   - Edit source files in `src/`
   - Run `npm run typecheck` frequently
   - Test manually with Claude Desktop

3. **Verify build:**
   ```bash
   npm run build
   ```

4. **Commit changes:**
   ```bash
   git add .
   git commit -m "Add: description of your changes"
   ```

5. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   ```

## Code Style

### TypeScript Guidelines

- **Strict mode:** All code must compile with `strict: true`
- **No `any`:** Use proper types or `unknown`
- **Async/await:** Prefer over promises/callbacks
- **Explicit return types:** All functions should declare return type
- **Const:** Use `const` by default, `let` only when needed

**Example:**
```typescript
// Good
async function getSession(id: string): Promise<Session> {
  return await client.getSession(id);
}

// Bad
async function getSession(id: any) {
  return await client.getSession(id);
}
```

### Naming Conventions

- **Files:** kebab-case (`jules-client.ts`)
- **Classes:** PascalCase (`JulesClient`)
- **Functions:** camelCase (`createSession`)
- **Constants:** SCREAMING_SNAKE_CASE (`JULES_PROMPTS`)
- **Interfaces:** PascalCase (`ScheduledTask`)
- **Type aliases:** PascalCase (`SessionState`)

### File Organization

- **Types:** Place in `src/types/`
- **API clients:** Place in `src/api/`
- **Storage:** Place in `src/storage/`
- **MCP layer:** Place in `src/mcp/`

### Documentation

- **JSDoc comments:** All public methods
- **Inline comments:** Explain non-obvious logic
- **Type annotations:** Use TypeScript types as documentation
- **README updates:** Update docs when adding features

**Example:**
```typescript
/**
 * Creates a new Jules coding session
 *
 * @param request - Session configuration
 * @returns Session object with ID and state
 * @throws JulesAPIError if API call fails
 */
async createSession(request: CreateSessionRequest): Promise<Session> {
  // Implementation
}
```

## Testing

### Manual Testing

Currently, testing is manual via Claude Desktop:

1. Configure server in `claude_desktop_config.json`
2. Restart Claude
3. Test each tool through conversation
4. Verify expected behavior

### Future: Automated Tests

We plan to add:
- **Unit tests:** Jest or Vitest
- **Integration tests:** Test against mock Jules API
- **E2E tests:** Full MCP protocol flow

**Help wanted:** If you're experienced with testing MCP servers, contributions welcome!

## Areas for Contribution

### High Priority

1. **Automated tests** - Unit and integration test suite
2. **Error recovery** - Better handling of API failures
3. **Rate limiting** - Exponential backoff for 429 responses
4. **Documentation** - More examples and use cases

### Medium Priority

5. **HTTP transport** - Support for remote deployments
6. **Webhook integration** - Real-time notifications (when Jules API supports)
7. **Session templates** - Save and reuse common task configurations
8. **Logging improvements** - Structured logging with levels

### Nice to Have

9. **Web dashboard** - Visual interface for schedule management
10. **Metrics** - Usage analytics and success rates
11. **Multi-user support** - Per-user API keys
12. **Advanced scheduling** - Conditional execution, dependency chains

## Pull Request Guidelines

### Before Submitting

- [ ] Code compiles without errors (`npm run build`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Code follows style guidelines
- [ ] Documentation updated if needed
- [ ] Tested manually with Claude Desktop
- [ ] No API keys committed

### PR Description Template

```markdown
## Description
[Clear description of what this PR does]

## Motivation
[Why is this change needed?]

## Changes
- [List of changes made]

## Testing
[How did you test this?]

## Documentation
- [ ] README.md updated
- [ ] API_REFERENCE.md updated (if new tool/resource)
- [ ] CHANGELOG.md updated
- [ ] Code comments added
```

### Review Process

1. Maintainer reviews code
2. Feedback provided (if needed)
3. You address feedback
4. Approved and merged

## Commit Message Format

Use conventional commits:

```
<type>: <description>

[optional body]

[optional footer]
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `refactor:` - Code restructuring
- `test:` - Adding tests
- `chore:` - Tooling, dependencies

**Examples:**
```
feat: add webhook support for session events

Implements real-time notifications when Jules completes tasks.
Requires Jules API v2 when available.

Closes #42
```

```
fix: handle corrupted schedules.json gracefully

Adds JSON validation and creates new file if corrupted.
```

## Code Review Checklist

### For Reviewers

- [ ] Code compiles and type checks
- [ ] Logic is sound and efficient
- [ ] Error handling is comprehensive
- [ ] No security vulnerabilities
- [ ] Documentation is clear and accurate
- [ ] Changes are backward compatible (or major version bump)
- [ ] No sensitive data in code

### For Contributors

Before requesting review:
- [ ] Self-review your diff
- [ ] Remove debug code
- [ ] Fix typos
- [ ] Ensure consistent formatting
- [ ] Add JSDoc to public methods

## Reporting Bugs

### Bug Report Template

```markdown
## Description
[Clear description of the bug]

## Steps to Reproduce
1. Configure server with...
2. Call tool X with...
3. Observe error...

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- OS: [macOS / Windows / Linux]
- Node version: [18.x / 20.x]
- MCP Host: [Claude Desktop / Cursor]
- Jules MCP Server version: [1.0.0]

## Logs
[Paste relevant logs from Claude console]
```

## Security Vulnerabilities

**DO NOT** open public issues for security bugs.

Instead:
1. Email security concerns to maintainers
2. Use GitHub Security Advisories (if available)
3. Provide detailed reproduction steps
4. Allow time for fix before public disclosure

## Documentation Contributions

Documentation improvements are always welcome!

**Areas to improve:**
- Clarify confusing sections
- Add more examples
- Fix typos or grammar
- Add diagrams or illustrations
- Translate to other languages

**Process:**
1. Edit markdown files
2. Verify markdown renders correctly
3. Submit PR with changes

## Feature Requests

Before submitting a feature request:

1. **Check existing issues** - Might already be planned
2. **Describe the problem** - What pain point does this solve?
3. **Propose solution** - How should it work?
4. **Consider alternatives** - Are there other approaches?

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help newcomers learn
- Assume good intentions

### Communication

- **Issues:** For bugs and feature requests
- **Pull Requests:** For code contributions
- **Discussions:** For questions and ideas

## Development Tips

### Debugging

**Enable debug logging:**
```bash
LOG_LEVEL=debug npm run dev
```

**Test individual components:**
```typescript
// Test Jules client
import { JulesClient } from './src/api/jules-client';
const client = new JulesClient(process.env.JULES_API_KEY);
const sources = await client.listSources();
console.log(sources);
```

**Inspect schedules:**
```bash
cat ~/.jules-mcp/schedules.json | jq
```

### Common Issues

**"Cannot find module"**
- Run `npm install`
- Verify `node_modules/` exists

**"Type error in compiled code"**
- Run `npm run typecheck`
- Fix TypeScript errors before building

**"Server not responding in Claude"**
- Check path in `claude_desktop_config.json`
- Verify `dist/index.js` exists and is executable
- Check Claude Desktop console for errors

## Release Process

For maintainers:

1. **Update version:** Edit `package.json`
2. **Update CHANGELOG:** Document all changes
3. **Build and test:** Verify no regressions
4. **Commit:** `git commit -m "chore: release v1.1.0"`
5. **Tag:** `git tag -a v1.1.0 -m "Release v1.1.0"`
6. **Push:** `git push && git push --tags`
7. **Publish:** `npm publish` (if publishing to npm)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Open an issue with the label `question` and we'll help!
