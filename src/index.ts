#!/usr/bin/env node
import 'dotenv/config';
/**
 * Google Jules MCP Server
 * A Model Context Protocol server for the Google Jules API
 * with built-in scheduling capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { JulesClient } from './api/jules-client.js';
import { ScheduleStorage } from './storage/schedule-store.js';
import { CronEngine } from './scheduler/cron-engine.js';
import { JulesResources } from './mcp/resources.js';
import {
  JulesTools,
  CreateTaskSchema,
  ManageSessionSchema,
  GetSessionStatusSchema,
  ScheduleTaskSchema,
  DeleteScheduleSchema,
} from './mcp/tools.js';
import { JulesPromptManager, JULES_PROMPTS } from './mcp/prompts.js';
import { RepositoryValidator } from './utils/security.js';

/**
 * Main server class for the Jules MCP server.
 * Handles the initialization of components and setup of MCP request handlers.
 */
class JulesMCPServer {
  private server: Server;
  private client: JulesClient;
  private storage: ScheduleStorage;
  private scheduler: CronEngine;
  private resources: JulesResources;
  private tools: JulesTools;
  private promptManager: JulesPromptManager;

  /**
   * Initializes the Jules MCP Server.
   * Sets up the server, client, storage, scheduler, resources, tools, and prompts.
   */
  constructor() {
    // Initialize security validator with environment config
    RepositoryValidator.initialize();

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'jules-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
          logging: {},
        },
      }
    );

    // Initialize Jules API client
    this.client = new JulesClient();

    // Initialize storage and scheduler
    this.storage = new ScheduleStorage();
    this.scheduler = new CronEngine(
      this.storage,
      this.client,
      (msg) => {
        // Log to MCP client
        this.server.sendLoggingMessage({
          level: 'info',
          data: msg,
        });
      }
    );

    // Initialize MCP components
    this.resources = new JulesResources(
      this.client,
      this.storage,
      this.scheduler
    );
    this.tools = new JulesTools(this.client, this.storage, this.scheduler);
    this.promptManager = new JulesPromptManager();

    this.setupHandlers();
  }

  /**
   * Sets up MCP protocol handlers.
   * Configures handlers for listing and reading resources, tools, and prompts.
   */
  private setupHandlers(): void {
    // Resource handlers
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async () => ({
        resources: [
          {
            uri: 'jules://sources',
            name: 'Connected Repositories',
            description:
              'List of GitHub repositories connected to Jules',
            mimeType: 'application/json',
          },
          {
            uri: 'jules://sessions/list',
            name: 'Recent Sessions',
            description: 'Summary of recent Jules coding sessions',
            mimeType: 'application/json',
          },
          {
            uri: 'jules://schedules',
            name: 'Scheduled Tasks',
            description: 'Locally-managed recurring Jules tasks',
            mimeType: 'application/json',
          },
          {
            uri: 'jules://schedules/history',
            name: 'Schedule Execution History',
            description: 'History of scheduled task executions',
            mimeType: 'application/json',
          },
        ],
      })
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const uri = request.params.uri;

        try {
          let content: string;

          if (uri === 'jules://sources') {
            content = await this.resources.getSources();
          } else if (uri === 'jules://sessions/list') {
            content = await this.resources.getSessionsList();
          } else if (uri === 'jules://schedules') {
            content = await this.resources.getSchedules();
          } else if (uri === 'jules://schedules/history') {
            content = await this.resources.getScheduleHistory();
          } else if (uri.startsWith('jules://sessions/') && uri.endsWith('/full')) {
            // Extract session ID from URI
            const sessionId = uri.replace('jules://sessions/', '').replace('/full', '');
            content = await this.resources.getSessionFull(sessionId);
          } else {
            throw new Error(`Unknown resource URI: ${uri}`);
          }

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: content,
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Failed to read resource ${uri}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    );

    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_coding_task',
          description:
            'Creates a new Jules coding session. Returns immediately with a session ID. Monitor progress via jules://sessions/{id}/full resource.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description:
                  'Natural language instruction for the coding task',
              },
              source: {
                type: 'string',
                description:
                  'Repository resource name (sources/github/owner/repo)',
              },
              branch: {
                type: 'string',
                description: 'Git branch to base changes on',
                default: 'main',
              },
              auto_create_pr: {
                type: 'boolean',
                description:
                  'Automatically create Pull Request upon completion',
                default: true,
              },
              require_plan_approval: {
                type: 'boolean',
                description: 'Pause for manual plan review',
                default: false,
              },
              title: {
                type: 'string',
                description: 'Optional session title',
              },
            },
            required: ['prompt', 'source'],
          },
        },
        {
          name: 'manage_session',
          description:
            'Manage an active Jules session: approve plans or send feedback',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Session ID' },
              action: {
                type: 'string',
                enum: ['approve_plan', 'send_message'],
                description: 'Action to perform',
              },
              message: {
                type: 'string',
                description: 'Message (required for send_message)',
              },
            },
            required: ['session_id', 'action'],
          },
        },
        {
          name: 'get_session_status',
          description:
            'Get the current status and state of a Jules session',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Session ID' },
            },
            required: ['session_id'],
          },
        },
        {
          name: 'schedule_recurring_task',
          description:
            'Schedule a Jules task to run automatically on a cron schedule. The server manages execution even when offline.',
          inputSchema: {
            type: 'object',
            properties: {
              task_name: {
                type: 'string',
                description: 'Unique name for this schedule',
              },
              cron_expression: {
                type: 'string',
                description:
                  'Cron expression (e.g., "0 9 * * 1" for Mondays at 9 AM)',
              },
              prompt: { type: 'string', description: 'Task instruction' },
              source: {
                type: 'string',
                description: 'Repository resource name',
              },
              branch: { type: 'string', default: 'main' },
              auto_create_pr: { type: 'boolean', default: true },
              require_plan_approval: { type: 'boolean', default: false },
              timezone: { type: 'string', description: 'Timezone for cron' },
            },
            required: ['task_name', 'cron_expression', 'prompt', 'source'],
          },
        },
        {
          name: 'list_schedules',
          description: 'List all locally-managed scheduled tasks',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'delete_schedule',
          description: 'Delete a scheduled task by name',
          inputSchema: {
            type: 'object',
            properties: {
              task_name: { type: 'string', description: 'Schedule name' },
            },
            required: ['task_name'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: string;

        switch (name) {
          case 'create_coding_task': {
            const validated = CreateTaskSchema.parse(args);
            result = await this.tools.createCodingTask(validated);
            break;
          }

          case 'manage_session': {
            const validated = ManageSessionSchema.parse(args);
            result = await this.tools.manageSession(validated);
            break;
          }

          case 'get_session_status': {
            const validated = GetSessionStatusSchema.parse(args);
            result = await this.tools.getSessionStatus(validated);
            break;
          }

          case 'schedule_recurring_task': {
            const validated = ScheduleTaskSchema.parse(args);
            result = await this.tools.scheduleRecurringTask(validated);
            break;
          }

          case 'list_schedules': {
            result = await this.tools.listSchedules();
            break;
          }

          case 'delete_schedule': {
            const validated = DeleteScheduleSchema.parse(args);
            result = await this.tools.deleteSchedule(validated);
            break;
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, error: errorMsg }),
            },
          ],
          isError: true,
        };
      }
    });

    // Prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: JULES_PROMPTS.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const content = this.promptManager.renderPrompt(name, args || {});
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: content,
              },
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to render prompt: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Starts the MCP server.
   * Connects the transport and initializes the scheduler.
   */
  async start(): Promise<void> {
    // Create stdio transport
    const transport = new StdioServerTransport();

    // Handle shutdown
    process.on('SIGINT', () => {
      this.scheduler.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.scheduler.shutdown();
      process.exit(0);
    });

    // Connect and run
    await this.server.connect(transport);

    // Initialize scheduler after transport is ready so logging works
    try {
      await this.scheduler.initialize();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.server.sendLoggingMessage({
        level: 'error',
        data: `Scheduler initialization failed: ${message}`,
      });
    }

    // Log startup
    this.server.sendLoggingMessage({
      level: 'info',
      data: 'Jules MCP Server started successfully',
    });
  }
}

// Entry point
const server = new JulesMCPServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
