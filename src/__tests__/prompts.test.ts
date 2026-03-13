import { describe, it, expect } from 'vitest';
import { JulesPromptManager, JULES_PROMPTS } from '../mcp/prompts.js';

describe('JulesPromptManager', () => {
  const manager = new JulesPromptManager();

  describe('listPrompts', () => {
    it('returns all prompt templates', () => {
      const prompts = manager.listPrompts();
      expect(prompts.length).toBe(JULES_PROMPTS.length);
      expect(prompts.length).toBeGreaterThan(0);
    });
  });

  describe('getPrompt', () => {
    it('returns a prompt by name', () => {
      const prompt = manager.getPrompt('refactor_module');
      expect(prompt).toBeDefined();
      expect(prompt?.name).toBe('refactor_module');
    });

    it('returns undefined for unknown name', () => {
      const prompt = manager.getPrompt('nonexistent_prompt');
      expect(prompt).toBeUndefined();
    });
  });

  describe('renderPrompt', () => {
    it('renders refactor_module with valid args', () => {
      const result = manager.renderPrompt('refactor_module', {
        repository: 'owner/repo',
        module_path: 'src/utils/helpers.ts',
        goal: 'improve performance',
      });
      expect(result).toContain('owner/repo');
      expect(result).toContain('src/utils/helpers.ts');
      expect(result).toContain('improve performance');
    });

    it('renders setup_weekly_maintenance', () => {
      const result = manager.renderPrompt('setup_weekly_maintenance', {
        repository: 'owner/repo',
        tasks: 'dependency updates, linter fixes',
      });
      expect(result).toContain('dependency updates');
      expect(result).toContain('linter fixes');
    });

    it('renders audit_security', () => {
      const result = manager.renderPrompt('audit_security', {
        repository: 'owner/repo',
      });
      expect(result).toContain('security audit');
    });

    it('renders create_repoless_script', () => {
      const result = manager.renderPrompt('create_repoless_script', {
        task_description: 'build a CLI tool',
        runtime: 'node',
      });
      expect(result).toContain('node');
      expect(result).toContain('build a CLI tool');
    });

    it('throws for unknown prompt name', () => {
      expect(() => manager.renderPrompt('unknown', {})).toThrow('Prompt not found: unknown');
    });

    it('throws when required argument is missing', () => {
      expect(() => manager.renderPrompt('refactor_module', {})).toThrow(/Missing required argument/);
    });

    it('renders all templates without error when args provided', () => {
      for (const prompt of JULES_PROMPTS) {
        const args: Record<string, string> = {};
        for (const arg of prompt.arguments) {
          args[arg.name] = `test-${arg.name}`;
        }
        expect(() => manager.renderPrompt(prompt.name, args)).not.toThrow();
      }
    });
  });
});
