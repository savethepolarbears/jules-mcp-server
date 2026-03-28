/**
 * MCP Prompts - Pre-written templates to guide users
 * Prompts help users leverage Jules effectively with best practices
 */

/**
 * Interface for a prompt template.
 */
interface PromptTemplate {
  /** The name of the prompt template. */
  name: string;
  /** A description of what the prompt template does. */
  description: string;
  /** A list of arguments required by the template. */
  arguments: {
    /** The name of the argument. */
    name: string;
    /** A description of the argument. */
    description: string;
    /** Whether the argument is required. */
    required: boolean;
  }[];
  /** A function that takes a map of arguments and returns the rendered prompt string. */
  template: (args: Record<string, string>) => string;
}

/**
 * A list of available Jules prompt templates.
 */
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

Use the create_coding_task tool with:
- Source format: sources/github/${args.repository}
- require_plan_approval: true (Important for safe operation when targeting repos from AI agents like OpenClaw/Codex)
- auto_create_pr: true`,
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
- Cron expression: "0 3 * * 1" (Every Monday at 3 AM. Note: Schedules must be quota-aware and run at most once per hour. Weekly is recommended.)
- A comprehensive prompt covering all tasks
- auto_create_pr: true
- require_plan_approval: true (Recommended for safe AI integration until trust is established)
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
- require_plan_approval: true (Crucial for safe operation when targeting repos from AI agents like OpenClaw/Codex)
- auto_create_pr: true
- Detailed prompt including all security checks

You may want to schedule this monthly using schedule_recurring_task with cron "0 2 1 * *". Remember to keep schedules quota-aware (at most once per hour).`,
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

Use create_coding_task with:
- Source: sources/github/${args.repository}
- require_plan_approval: true (For safe AI agent integration)
- auto_create_pr: true`,
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
- require_plan_approval: true (to review update strategy; important for safe OpenClaw/Codex integration)
- auto_create_pr: true

For recurring updates, use schedule_recurring_task with cron "0 9 * * 1" (Monday 9 AM). Keep cron intervals to at least 1 hour to respect quota limits.`,
  },

  {
    name: 'monitor_and_review',
    description:
      'Create a coding task, wait for Jules to finish or pause, then review the full session output',
    arguments: [
      {
        name: 'repository',
        description: 'Repository name (format: owner/repo)',
        required: true,
      },
      {
        name: 'task_description',
        description: 'The task Jules should implement',
        required: true,
      },
    ],
    template: (args) => `Create a Jules coding task for repository ${args.repository} with this task:

${args.task_description}

Workflow:
1. Call create_coding_task with source set to sources/github/${args.repository}, require_plan_approval=true, and auto_create_pr=true.
2. Call wait_for_session for the returned session ID. Use the default target states unless you need to stop at AWAITING_PLAN_APPROVAL or AWAITING_USER_FEEDBACK.
3. Read jules://sessions/{id}/full after the wait completes.
4. Summarize the current state, next steps, activities, and any PR URL or output artifacts.`,
  },

  {
    name: 'create_repoless_script',
    description:
      'Create a repoless Jules task for one-off script or prototype generation',
    arguments: [
      {
        name: 'task_description',
        description: 'Description of the script or artifact to create',
        required: true,
      },
      {
        name: 'runtime',
        description: 'Target runtime (node, python, rust, or bun)',
        required: true,
      },
    ],
    template: (args) => `Create a repoless Jules task to produce a ${args.runtime} solution for this request:

${args.task_description}

Use create_repoless_task with a prompt that:
1. Specifies the target runtime as ${args.runtime}
2. Requests runnable, production-quality code
3. Includes validation steps and usage instructions
4. Avoids repository-specific assumptions unless explicitly provided`,
  },

  {
    name: 'implement_feature',
    description:
      'Detailed feature implementation template for a repository-backed Jules task',
    arguments: [
      {
        name: 'repository',
        description: 'Repository name (format: owner/repo)',
        required: true,
      },
      {
        name: 'feature_name',
        description: 'Short feature name',
        required: true,
      },
      {
        name: 'description',
        description: 'Detailed feature description',
        required: true,
      },
      {
        name: 'acceptance_criteria',
        description: 'Acceptance criteria for the feature',
        required: true,
      },
      {
        name: 'affected_files',
        description: 'Optional comma-separated list of likely affected files',
        required: false,
      },
    ],
    template: (args) => `Create a Jules coding task for repository ${args.repository} to implement the feature "${args.feature_name}".

Feature description:
${args.description}

Acceptance criteria:
${args.acceptance_criteria}

${args.affected_files ? `Likely affected files:\n${args.affected_files.split(',').map((file) => `- ${file.trim()}`).join('\n')}\n` : ''}Implementation requirements:
1. Modify only the files required for this feature.
2. Preserve existing coding patterns and conventions.
3. Add or update tests needed to validate the feature.
4. Document any assumptions or follow-up work in the final summary.

Use create_coding_task with:
- Source: sources/github/${args.repository}
- require_plan_approval: true
- auto_create_pr: true`,
  },

  {
    name: 'review_and_fix_pr',
    description:
      'Address review feedback for a pull request in a repository',
    arguments: [
      {
        name: 'repository',
        description: 'Repository name (format: owner/repo)',
        required: true,
      },
      {
        name: 'pr_number',
        description: 'Pull request number',
        required: true,
      },
      {
        name: 'feedback',
        description: 'Review feedback to address',
        required: true,
      },
    ],
    template: (args) => `Create a Jules coding task for repository ${args.repository} to address feedback on pull request #${args.pr_number}.

Review feedback:
${args.feedback}

Task requirements:
1. Review the PR context and feedback carefully.
2. Implement the requested fixes without regressing existing behavior.
3. Update tests if needed to cover the feedback.
4. Summarize how each feedback item was addressed.

Use create_coding_task with:
- Source: sources/github/${args.repository}
- require_plan_approval: true
- auto_create_pr: true`,
  },
];

/**
 * Manages the retrieval and rendering of Jules prompts.
 */
export class JulesPromptManager {
  /**
   * Retrieves a prompt template by name.
   * @param name - The name of the prompt template.
   * @returns The prompt template if found, otherwise undefined.
   */
  getPrompt(name: string): PromptTemplate | undefined {
    return JULES_PROMPTS.find((p) => p.name === name);
  }

  /**
   * Lists all available prompt templates.
   * @returns An array of all prompt templates.
   */
  listPrompts(): PromptTemplate[] {
    return JULES_PROMPTS;
  }

  /**
   * Renders a prompt template with the provided arguments.
   * @param name - The name of the prompt template to render.
   * @param args - The arguments to populate the template with.
   * @returns The rendered prompt string.
   * @throws Error if the prompt is not found or if required arguments are missing.
   */
  renderPrompt(name: string, args: Record<string, string>): string {
    const prompt = this.getPrompt(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Fill in placeholders for missing required arguments so MCP clients
    // (e.g. Antigravity) can preview prompts without providing all args.
    const resolvedArgs: Record<string, string> = { ...args };
    for (const arg of prompt.arguments) {
      if (!resolvedArgs[arg.name]) {
        resolvedArgs[arg.name] = `<${arg.name}>`;
      }
    }

    return prompt.template(resolvedArgs);
  }
}
