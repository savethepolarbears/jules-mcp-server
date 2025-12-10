#!/usr/bin/env node
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const serverPath = path.join(projectRoot, 'dist', 'index.js');

const client = new Client({ name: 'mcp-smoke-client', version: '0.0.1' });
const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
  env: { ...process.env, JULES_API_KEY: process.env.JULES_API_KEY ?? 'dummy' },
  cwd: projectRoot,
  stderr: 'pipe',
});

async function main() {
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(`[mcp:smoke] tools: ${tools.tools.length}`);

  const prompts = await client.listPrompts();
  console.log(`[mcp:smoke] prompts: ${prompts.prompts.length}`);

  const resources = await client.listResources();
  console.log(
    `[mcp:smoke] resources: ${resources.resources.map((r) => r.uri).join(', ')}`
  );

  try {
    await client.readResource({ uri: 'jules://sessions/invalid/full' });
  } catch (error) {
    console.log(
      `[mcp:smoke] readResource expected error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    await client.callTool({
      name: 'create_coding_task',
      arguments: {
        prompt: 'Smoke test task',
        source: 'sources/github/example/repo',
        branch: 'main',
      },
    });
  } catch (error) {
    console.log(
      `[mcp:smoke] callTool expected error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

main()
  .catch((error) => {
    console.error('[mcp:smoke] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.close();
    } catch {}
    try {
      await transport.close();
    } catch {}
  });

