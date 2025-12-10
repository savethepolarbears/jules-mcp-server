# Quick Start Guide

Get the Jules MCP Server running in under 5 minutes.

## Step 1: Get a Jules API Key

1. Visit **https://jules.google/settings**
2. Click **"Create API Key"**
3. Copy the generated key (starts with `AIza...`)
4. Keep it secure - this grants code modification access!

## Step 2: Install the Server

```bash
# Navigate to the project directory
cd jules-mcp

# Install dependencies
npm install

# Build the TypeScript code
npm run build
```

**Verify build succeeded:** You should see a `dist/` folder with compiled JavaScript.

## Step 3: Configure Your Environment

Create a `.env` file in the project root:

```bash
# .env file
JULES_API_KEY=your_actual_key_here
```

Or export it in your shell:

```bash
export JULES_API_KEY="your_actual_key_here"
```

## Step 4: Connect to Claude Desktop

Edit your Claude Desktop configuration:

**macOS:**
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```powershell
notepad %APPDATA%\Claude\claude_desktop_config.json
```

**Add this configuration:**

```json
{
  "mcpServers": {
    "jules": {
      "command": "node",
      "args": ["/FULL/PATH/TO/jules-mcp/dist/index.js"],
      "env": {
        "JULES_API_KEY": "your-key-here"
      }
    }
  }
}
```

**Important:** Replace `/FULL/PATH/TO/` with the actual absolute path to your jules-mcp directory.

## Step 5: Restart Claude Desktop

1. Quit Claude completely
2. Reopen Claude Desktop
3. Start a new conversation

## Step 6: Verify Connection

Ask Claude:

```
"What repositories are connected to Jules?"
```

Claude should respond with a list of your GitHub repositories (if you have any connected to Jules). If you see this, **the server is working**!

## Step 7: Create Your First Task

```
"Use Jules to add a README.md file to my test-repo if it doesn't have one"
```

Claude will:
1. Check if `test-repo` is connected
2. Create a Jules session
3. Return a session ID
4. Tell you how to monitor progress

## Step 8: Try Scheduling

```
"Schedule Jules to check for outdated dependencies every Monday at 9 AM in test-repo"
```

Claude will create a persistent schedule that runs automatically.

## Troubleshooting Quick Fixes

### "MCP server not responding"

1. Check Claude logs: Look for startup errors
2. Verify path in `claude_desktop_config.json` is correct
3. Ensure `dist/index.js` exists (run `npm run build`)
4. Try running manually: `node dist/index.js` (should wait for input)

### "JULES_API_KEY required"

Set the environment variable in the config file's `env` section, not in your shell.

### "No repositories found"

1. Visit **https://jules.google**
2. Click **"Connect Repository"**
3. Install the Jules GitHub App on at least one repository
4. Wait a minute for synchronization
5. Ask Claude again: "What repos are connected?"

## Next Steps

- Read **README.md** for complete feature documentation
- Check **EXAMPLES.md** for practical use cases
- Review **SECURITY.md** for production deployment
- Explore **API_REFERENCE.md** for all available tools

## Common First Tasks

### Create a simple bug fix:
```
"Use Jules to fix any TypeScript errors in src/utils.ts"
```

### Set up automated maintenance:
```
"Schedule weekly dependency updates for my-repo every Monday"
```

### Review a plan before execution:
```
"Create a task to refactor the auth module but require plan approval"
```

## Getting Help

- **Jules Documentation:** https://jules.google/docs/
- **MCP Documentation:** https://modelcontextprotocol.io/
- **Issues:** Open an issue on this repository

## Success Indicators

You'll know it's working when:

✅ Claude can list your repositories
✅ Claude can create Jules sessions
✅ You see sessions appear in https://jules.google
✅ Claude can schedule tasks (check with "list schedules")
✅ Scheduled tasks execute at the right time (check logs or jules.google)

**You're ready to delegate coding tasks to Jules through Claude!**
