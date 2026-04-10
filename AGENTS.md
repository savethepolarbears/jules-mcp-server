# AI Agent Instructions for Jules MCP Server

This file (`AGENTS.md`) is the canonical source of instruction and context for AI coding agents operating within this repository.

## Project Purpose & Architecture
- **Purpose:** A production-ready Model Context Protocol (MCP) server for the Google Jules API. It enables AI assistants (like Claude) to dispatch coding tasks and schedule recurring automated tasks directly.
- **Architecture:** The server implements a **"Thick Server"** pattern. Because the Jules API v1alpha is stateless and lacks native scheduling, this MCP server handles scheduling locally using `node-schedule` and persists task data locally.
- **Disclaimer:** Independent, open-source project, not officially Google.

## Technology Stack & Environment
- **Runtime:** Node.js `>=18.0.0` (Current development engine is v22+).
- **Language:** TypeScript `^5.9.3`.
- **Key Dependencies:**
  - `@modelcontextprotocol/sdk` (`^1.29.0`) - Core protocol library.
  - `node-schedule` (`^2.1.1`) - Cron engine for thick-server persistence.
  - `vitest` (`^4.1.4`) - Unit testing framework.
  - `zod` (`^4.3.6`) - Input validation.
- **Package Manager:** `npm`.

## Repo Map
- `src/` - Core MCP server logic (tools, resources, prompts, scheduling engine).
- `src/__tests__/` - Vitest testing suite.
- `docs/` - Comprehensive API reference and setup guides.
- `scripts/` - Custom scripts (e.g., `mcp-smoke.mjs` for post-build MCP resource/tool testing).
- `pieces/` - Contains the Activepieces integration (`pieces/jules/`), a separate package encapsulating the Jules API for no-code flows.

## Executable Commands
Use these exact commands when verifying, building, and running tasks:
- **Install:** `npm install`
- **Build:** `npm run build` (compiles via `tsc`)
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`)
- **Lint:** `npm run lint` (runs `eslint` on `src/**/*.ts`)
- **Test:** `npm run test` (runs `vitest run`)
- **Watch Tests:** `npm run test:watch`
- **Coverage:** `npm run test:coverage`
- **Smoke Test:** `npm run mcp:smoke` (builds the project and executes the internal MCP smoke test runner)

## Coding Conventions & Patterns
- **JSDoc Coverage:** Complete JSDoc comments are strictly mandated for all public functions, methods, and classes. This must include purpose, `@param`, and `@returns`.
- **MCP Resource Fallbacks (Safe Degradation):** MCP resources should implement safe fallbacks by catching API errors and returning degraded-mode JSON payloads with diagnostic messages, rather than throwing hard exceptions that could crash monitoring frameworks.
- **Persistent Storage Safety:** Local file storage (e.g., `ScheduleStorage`) writes data to `~/.jules-mcp/schedules.enc` (or fallback `schedules.json`). All file modifications must use **atomic writes** (write to temp file, then `fs/promises rename`). The code must gracefully handle JSON parsing errors (e.g., automatically backing up corrupted state files) to avoid server crashes upon startup.
- **Safe AI Configuration:** In prompt and resource generation, always enforce configuration that requires human review for OpenClaw/Codex/AI integrations, specifically `require_plan_approval: true` and `auto_create_pr: true`.
- **Quota-Aware Scheduling:** Scheduled tasks must execute no more frequently than once per hour to prevent upstream API quota exhaustion.
- **Mocking Strategy (Vitest):** Use `vi.stubEnv()` and `vi.unstubAllEnvs()` for environment variable manipulation during testing.

## Agent Boundaries
- **Secrets:** Do not commit or hardcode actual API keys (e.g., `JULES_API_KEY`). Use `.env` parsing.
- **Production Data:** `~/.jules-mcp/schedules.enc` contains local production state. If modifying logic surrounding this file, be incredibly careful not to wipe or corrupt existing formats without an explicit migration path.
- **Generated Artifacts:** Do not edit files in `dist/` or `node_modules/`. Edit source in `src/` and run `npm run build`.

## PR & Review Expectations
Every code submission requires passing validation:
1. `npm run typecheck` must cleanly pass.
2. `npm run lint` must cleanly pass.
3. `npm run test` must pass (100% test success rate required).
4. `npm run mcp:smoke` should ideally execute without unexpected terminal failures.
5. All new functions must include the required JSDoc.
6. Make sure to run validation prior to requesting code review or submitting the final patch.

## Example: Safe Fallback
```typescript
// Good: Returns a degraded JSON block on error
try {
  const result = await julesApi.fetchData();
  return { data: result };
} catch (error) {
  return {
    data: null,
    error: 'Degraded mode: Failed to fetch API data',
    details: error.message
  };
}

// Bad: Throws hard exception that crashes the host context
try {
  const result = await julesApi.fetchData();
  return { data: result };
} catch (error) {
  throw new Error('Fatal error fetching data');
}
```
