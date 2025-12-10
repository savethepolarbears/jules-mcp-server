# Installation Guide

Complete installation instructions for the Jules MCP Server.

## System Requirements

### Minimum Requirements

- **Operating System:** macOS, Windows, Linux
- **Node.js:** 18.0.0 or higher
- **npm:** 9.0.0 or higher (comes with Node.js)
- **Memory:** 100MB+ available RAM
- **Disk:** 50MB for installation

### Recommended Requirements

- **Node.js:** 20.x LTS
- **npm:** 10.x
- **Memory:** 512MB+ for smooth operation with multiple schedules

### Check Your Version

```bash
node --version  # Should be v18.0.0 or higher
npm --version   # Should be 9.0.0 or higher
```

## Installation Methods

### Method 1: Local Installation (Recommended for Development)

```bash
# Clone the repository
git clone https://github.com/yourusername/jules-mcp.git
cd jules-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify build
ls dist/index.js  # Should exist
```

### Method 2: Global Installation

```bash
# From the project directory
npm install -g .

# Verify installation
which jules-mcp  # Should show path to global bin

# Or directly run
jules-mcp --version
```

### Method 3: NPM Package (When Published)

```bash
# Install from npm registry
npm install -g @google/jules-mcp-server

# Run
jules-mcp
```

## API Key Setup

### Step 1: Generate Jules API Key

1. Visit **https://jules.google/settings**
2. Sign in with your Google account
3. Navigate to **"API Keys"** section
4. Click **"Create New API Key"**
5. Copy the generated key (format: `AIza...`)
6. **Important:** Store securely - this key grants code modification access

### Step 2: Configure Environment

**Option A: Environment Variable (Recommended)**

```bash
# macOS/Linux (add to ~/.zshrc or ~/.bashrc)
export JULES_API_KEY="your-key-here"

# Windows PowerShell (add to $PROFILE)
$env:JULES_API_KEY = "your-key-here"

# Windows CMD
setx JULES_API_KEY "your-key-here"
```

**Option B: .env File**

```bash
# Create .env file in project root
echo 'JULES_API_KEY=your-key-here' > .env
```

**Security Note:** Never commit .env to version control!

## MCP Client Configuration

### Claude Desktop

#### Step 1: Locate Configuration File

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```powershell
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

#### Step 2: Edit Configuration

```bash
# macOS/Linux
code ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows
notepad %APPDATA%\Claude\claude_desktop_config.json
```

#### Step 3: Add Jules Server

```json
{
  "mcpServers": {
    "jules": {
      "command": "node",
      "args": ["/absolute/path/to/jules-mcp/dist/index.js"],
      "env": {
        "JULES_API_KEY": "your-jules-api-key-here"
      }
    }
  }
}
```

**Important:** Replace `/absolute/path/to/` with your actual path!

#### Step 4: Restart Claude Desktop

1. Quit Claude completely (Cmd+Q on Mac, Alt+F4 on Windows)
2. Reopen Claude Desktop
3. Start a new conversation

#### Step 5: Verify

Ask Claude: **"What repositories are connected to Jules?"**

If it responds with a list (or "no repositories"), the server is working! ✅

### Cursor IDE

Add to Cursor settings:

```json
{
  "mcp": {
    "servers": {
      "jules": {
        "command": "jules-mcp",
        "env": {
          "JULES_API_KEY": "your-key-here"
        }
      }
    }
  }
}
```

### VS Code with MCP Extension

If using an MCP extension for VS Code:

```json
{
  "mcp.servers": {
    "jules": {
      "command": "node",
      "args": ["/path/to/jules-mcp/dist/index.js"],
      "env": {
        "JULES_API_KEY": "your-key-here"
      }
    }
  }
}
```

## Connecting Repositories to Jules

**Before using the MCP server**, connect GitHub repositories through Jules:

1. Visit **https://jules.google**
2. Click **"Connect Repository"** or **"Add Source"**
3. Install the Jules GitHub App
4. Select repositories to grant access
5. Wait 30-60 seconds for synchronization
6. Verify in Claude: **"List my Jules repositories"**

## Verification Steps

### 1. Test API Connection

```bash
# Set API key
export JULES_API_KEY="your-key"

# Test directly
node -e "
  import('./dist/api/jules-client.js').then(async (mod) => {
    const client = new mod.JulesClient();
    const sources = await client.listSources();
    console.log('Connected repositories:', sources.sources.length);
  });
"
```

### 2. Test MCP Server

```bash
# Run server (should wait for stdin)
node dist/index.js

# In another terminal, send test message
echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | node dist/index.js
```

### 3. Test in Claude Desktop

Ask Claude:
- **"What tools do you have access to?"** - Should list Jules tools
- **"What resources can you read?"** - Should list jules:// URIs
- **"List prompts"** - Should show refactor_module, etc.

## Troubleshooting Installation

### "Cannot find module '@modelcontextprotocol/sdk'"

**Cause:** Dependencies not installed
**Fix:**
```bash
npm install
```

### "JULES_API_KEY environment variable is required"

**Cause:** API key not set
**Fix:**
```bash
export JULES_API_KEY="your-key"
```

Or add to `claude_desktop_config.json` in the `env` section.

### "Permission denied" when running dist/index.js

**Cause:** File not executable
**Fix:**
```bash
chmod +x dist/index.js
```

### "TypeScript compilation failed"

**Cause:** TypeScript errors in code
**Fix:**
```bash
npm run typecheck  # See errors
# Fix errors, then
npm run build
```

### Claude Desktop not detecting server

**Checklist:**
1. ✅ Path in config is absolute (not relative)
2. ✅ `dist/index.js` exists
3. ✅ API key in config `env` section
4. ✅ Restarted Claude completely
5. ✅ Check Claude logs for errors

**Claude Logs Location:**
- macOS: `~/Library/Logs/Claude/`
- Windows: `%APPDATA%\Claude\logs\`

### "404 Not Found" from Jules API

**Cause:** Repository not connected to Jules
**Fix:**
1. Visit https://jules.google
2. Connect the repository
3. Wait for sync
4. Try again

## Platform-Specific Notes

### macOS

- Recommended shell: zsh (default)
- Add exports to `~/.zshrc`
- Use Homebrew for Node.js: `brew install node`

### Windows

- Recommended shell: PowerShell 7+
- Set environment variables via System Properties or `setx`
- Use nvm-windows for Node.js version management

### Linux

- Recommended shell: bash
- Add exports to `~/.bashrc`
- Use nvm for Node.js: https://github.com/nvm-sh/nvm

## Upgrade Instructions

### Upgrading from Previous Version

```bash
# Pull latest changes
git pull origin main

# Reinstall dependencies
npm install

# Rebuild
npm run build

# Restart MCP client (Claude Desktop, etc.)
```

**Data Preservation:** Your schedules in `~/.jules-mcp/schedules.json` are preserved across upgrades.

## Uninstallation

### Remove Global Installation

```bash
npm uninstall -g @google/jules-mcp-server
```

### Remove Local Files

```bash
# Remove project directory
rm -rf /path/to/jules-mcp

# Remove schedules (if desired)
rm -rf ~/.jules-mcp
```

### Remove from Claude Desktop

Edit `claude_desktop_config.json` and remove the `"jules"` entry from `mcpServers`.

## Next Steps

After installation:

1. **Read QUICKSTART.md** - Get running in 5 minutes
2. **Try EXAMPLES.md** - See practical use cases
3. **Review SECURITY.md** - Understand security implications
4. **Explore prompts** - Ask Claude: "Show me available prompts"

## Support

- **Documentation:** See README.md
- **Issues:** GitHub issues
- **Questions:** Open discussion thread
- **Security:** Email maintainers privately
