/**
 * MCP Prompts - Pre-written templates to guide users
 * Prompts help users leverage Jules effectively with best practices
 */

export interface PromptTemplate {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  template: (args: Record<string, string>) => string;
}

export const JULES_PROMPTS: PromptTemplate[] = [
  {
    name: 'refactor_module',
    description:
      'Guide for refactoring a specific module in a repository with clear goals',
    arguments: [
      {
        name: 'repository',
        description: 'Repository name (format: owner/repo)',
        required: true,
      },
      {
        name: 'module_path',
        description: 'Path to the module/file to refactor',
        required: true,
      },
      {
        name: 'goal',
        description:
          'Refactoring goal (e.g., "improve performance", "modernize patterns", "add type safety")',
        required: true,
      },
    ],
    template: (args) => `I want to refactor the module at ${args.module_path} in repository ${args.repository}.

Goal: ${args.goal}

Please create a Jules coding task with a detailed prompt that:
1. Identifies the specific files to modify
2. Explains the refactoring goal clearly
3. Specifies any patterns or conventions to follow
4. Includes test requirements to verify the refactoring doesn't break functionality

Use the create_coding_task tool with source format: sources/github/${args.repository}`,
  },

  {
    name: 'setup_weekly_maintenance',
    description:
      'Set up automated weekly maintenance tasks for a repository',
    arguments: [
      {
        name: 'repository',
        description: 'Repository name (format: owner/repo)',
        required: true,
      },
      {
        name: 'tasks',
        description:
          'Comma-separated maintenance tasks (e.g., "dependency updates, linter fixes, security audit")',
        required: true,
      },
    ],
    template: (args) => `I want to set up weekly automated maintenance for repository ${args.repository}.

Maintenance tasks to include:
${args.tasks.split(',').map((task) => `- ${task.trim()}`).join('\n')}

Please use the schedule_recurring_task tool with:
- Cron expression: "0 3 * * 1" (Every Monday at 3 AM)
- A comprehensive prompt covering all tasks
- Auto-create PR: true
- Source: sources/github/${args.repository}

This will create a persistent schedule that survives server restarts.`,
  },

  {
    name: 'audit_security',
    description:
      'Create a comprehensive security audit task with best practices',
    arguments: [
      {
        name: 'repository',
        description: 'Repository name (format: owner/repo)',
        required: true,
      },
    ],
    template: (args) => `I want to run a security audit on repository ${args.repository}.

Please create a Jules task that:
1. Scans for common vulnerabilities (XSS, SQL injection, auth issues)
2. Checks dependency security (outdated packages with known CVEs)
3. Reviews environment variable handling
4. Identifies exposed secrets or API keys
5. Validates input sanitization
6. Checks for OWASP Top 10 vulnerabilities

Use create_coding_task with:
- Source: sources/github/${args.repository}
- Require plan approval: true (for review before changes)
- Detailed prompt including all security checks

You may want to schedule this monthly using schedule_recurring_task with cron "0 2 1 * *".`,
  },

  {
    name: 'fix_failing_tests',
    description: 'Task template for fixing test failures',
    arguments: [
      {
        name: 'repository',
        description: 'Repository name (format: owner/repo)',
        required: true,
      },
      {
        name: 'test_command',
        description: 'Command to run tests (e.g., "npm test")',
        required: true,
      },
    ],
    template: (args) => `I need to fix failing tests in repository ${args.repository}.

Test command: ${args.test_command}

Please create a Jules task with this prompt:
"Run '${args.test_command}' to identify all failing tests. For each failure:
1. Analyze the test failure message and stack trace
2. Identify the root cause in the source code
3. Fix the underlying issue
4. Verify the fix by re-running tests
5. Ensure no other tests were broken by the fix

Provide a summary of all fixes made."

Use create_coding_task with source: sources/github/${args.repository}`,
  },

  {
    name: 'update_dependencies',
    description: 'Update dependencies with breaking change handling',
    arguments: [
      {
        name: 'repository',
        description: 'Repository name (format: owner/repo)',
        required: true,
      },
      {
        name: 'package_manager',
        description: 'Package manager (npm, yarn, pnpm)',
        required: true,
      },
    ],
    template: (args) => `I want to update dependencies in repository ${args.repository} (${args.package_manager}).

Please create a Jules task with this strategy:
1. Update all dependencies to their latest compatible versions
2. For major version updates, check changelogs for breaking changes
3. Update code to handle any breaking changes
4. Run tests after each batch of updates
5. If tests fail, revert that specific update and document why
6. Create a summary of all updates with versions and breaking changes

Use create_coding_task with:
- Source: sources/github/${args.repository}
- Require plan approval: true (to review update strategy)
- Auto-create PR: true

For recurring updates, use schedule_recurring_task with cron "0 9 * * 1" (Monday 9 AM).`,
  },
];

export class JulesPromptManager {
  getPrompt(name: string): PromptTemplate | undefined {
    return JULES_PROMPTS.find((p) => p.name === name);
  }

  listPrompts(): PromptTemplate[] {
    return JULES_PROMPTS;
  }

  renderPrompt(name: string, args: Record<string, string>): string {
    const prompt = this.getPrompt(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Validate required arguments
    for (const arg of prompt.arguments) {
      if (arg.required && !args[arg.name]) {
        throw new Error(`Missing required argument: ${arg.name}`);
      }
    }

    return prompt.template(args);
  }
}
