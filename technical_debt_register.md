# Technical Debt Register

## 1. Snapshot Baseline Metrics

- **Total Lines of Code (LOC):** 14773
- **Dependencies:** 4 runtime, 12 dev
- **Build Time:** ~3s
- **Test Time:** ~7s
- **Bundle Size:** N/A (Server-side application)

## 2. Debt Signals

### Lint Suppressions

```text
./pieces/jules/src/types/activepieces.d.ts:9:/* eslint-disable @typescript-eslint/no-explicit-any */
```

#### No TODOs, @ts-ignore, or @deprecated markers found

## 3. Identify Hotspots

### Top 5 Largest Files

```text
6371 total
   729 ./src/mcp/tools.ts
   618 ./src/index.ts
   581 ./src/__tests__/tools.test.ts
   416 ./src/api/jules-client.ts
```

### Directories with Most Churn (Recent Commits)

```text
14 pieces/jules
     10 src/__tests__
      3 src/mcp
      2 src/types
      2 .github/ISSUE_TEMPLATE
```

## 4. & 5. Technical Debt Register

| Item | Location(s) | Type | Evidence | Impact | Risk | Effort | Confidence | Recommended fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Large Monolithic File (Tools) | `src/mcp/tools.ts` | Complexity / Architecture | Largest file (~729 LOC) handling many disparate tools | Dev speed, maintainability | M | M | High | Break down into separate modules per tool group (e.g., `tasks.ts`, `sessions.ts`, `schedules.ts`). |
| Large Monolithic File (Index) | `src/index.ts` | Complexity | 2nd largest file (~618 LOC) doing too much setup | Dev speed | M | M | High | Extract setup/initialization logic into separate files (e.g., `server.ts`, `routes.ts`). |
| Activepieces types lint suppression | `pieces/jules/src/types/activepieces.d.ts` | Test/Docs Debt | `/* eslint-disable @typescript-eslint/no-explicit-any */` | Dev speed (type safety) | L | S | High | Replace `any` with proper types or `unknown` where appropriate to enforce type safety. |
| Test file size | `src/__tests__/tools.test.ts` | Test Debt | ~581 LOC test file | Dev speed | L | M | High | Split tests to match modularized tools (e.g., `tasks.test.ts`). |
| Duplicate API Client logic | `pieces/jules/src/lib/api.ts` vs `src/api/jules-client.ts` | Architecture | Two API clients for Jules | Maintainability | M | M | Med | Consolidate the API client logic into a shared module if possible, or clarify boundaries. |

### Top 5 "High ROI" Items

1. **Modularize `src/mcp/tools.ts`**: It's the largest file and the core of the MCP server. Breaking it down will immediately improve readability and prevent merge conflicts for future tool additions.
2. **Refactor `src/index.ts`**: Moving setup logic out of the main index file will make the application entry point cleaner and easier to manage.
3. **Split `src/__tests__/tools.test.ts`**: Mirrors the tools refactor. Smaller test files are easier to navigate and maintain.
4. **Address `eslint-disable` in Activepieces types**: Fixing the `any` types will prevent future bugs caused by lack of type safety in the Activepieces integration.
5. **Consolidate API Clients**: Reducing duplication between `src/api/jules-client.ts` and `pieces/jules/src/lib/api.ts` will ensure bug fixes and improvements to the API layer are applied uniformly.
