# Setup Guide for code-to-fsm

This guide will help you set up code-to-fsm to work with Claude Code CLI.

## Requirements

- **Node.js 14+** - Download from https://nodejs.org
- **Claude Code CLI** - Install from https://claude.com/claude-code

code-to-fsm uses the Claude Code CLI tool to analyze your code. Make sure the `claude` command is installed and available in your PATH.

## Installation

1. Navigate to the code-to-fsm directory:
   ```bash
   cd code-to-fsm
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Verify Claude Code CLI is installed:
   ```bash
   claude --version
   ```

That's it! You're ready to use code-to-fsm.

## Testing Your Setup

Test with the example robot code:
```bash
node cli.js analyze example-robot
```

You should see Claude analyzing the code and generating a state machine diagram.

## Troubleshooting

### Error: "Failed to start Claude CLI"

**Problem:** The `claude` command is not found in your PATH.

**Solutions:**
- Make sure Claude Code is properly installed
- Verify `claude` command works by running `claude --version` in your terminal
- On Windows, you may need to restart your terminal after installing Claude Code
- On Mac/Linux, check that the claude binary is in your PATH

### Error: "Claude CLI exited with code [non-zero]"

**Problem:** Claude CLI encountered an error while processing.

**Solutions:**
- Check that you're authenticated with Claude Code (run `claude` once manually)
- Make sure your Claude Code installation is up to date
- Try running the claude command manually to see if there are any issues

### Claude Code not installed?

If you don't have Claude Code installed yet:

1. Visit https://claude.com/claude-code
2. Download and install for your platform (Windows, Mac, or Linux)
3. Follow the authentication steps
4. Verify installation with `claude --version`

## Command Reference

### Analyze Command

Analyzes your codebase and extracts state machine patterns.

```bash
node cli.js analyze <workspace> [options]
```

**Arguments:**
- `<workspace>` - Path to your project directory

**Options:**
- `-o, --output <dir>` - Output directory (default: ./fsm-output)
- `-f, --files <files...>` - Specific files to analyze
- `-p, --patterns <patterns...>` - File patterns to match (e.g., "*.py" "*.js")
- `--focus <area>` - Focus on specific component
- `--to-xstate` - Also generate XState code
- `--xstate-format <format>` - XState format: esm, cjs, or json (default: esm)
- `--machine-id <id>` - XState machine ID (default: extractedMachine)

**Examples:**

```bash
# Analyze entire project
node cli.js analyze ./my-robot-project

# Analyze with XState generation
node cli.js analyze ./my-robot-project --to-xstate

# Analyze specific files
node cli.js analyze ./my-project -f controller.py motor.py

# Focus on specific component
node cli.js analyze ./my-project --focus "navigation system"

# Custom output location and format
node cli.js analyze ./my-project -o ./diagrams --to-xstate --xstate-format cjs
```

### Interactive Command

Chat with Claude about your state machine interactively.

```bash
node cli.js interactive <workspace> [options]
```

**Arguments:**
- `<workspace>` - Path to your project directory

**Options:**
- `-f, --files <files...>` - Specific files to analyze

**Example:**

```bash
node cli.js interactive ./my-project -f robot_controller.py

# Then ask questions like:
# You: What states does this robot have?
# You: How does it transition from idle to moving?
# You: Are there any error states?
```

## Next Steps

Once you've verified everything works, check out the [WORKFLOW_GUIDE.md](./WORKFLOW_GUIDE.md) for detailed usage examples and workflows.

## Platform-Specific Notes

### Windows
- Use PowerShell or Command Prompt
- Paths can use either forward slashes (`/`) or backslashes (`\`)
- Make sure Claude Code is in your PATH after installation

### macOS
- Claude Code CLI should be automatically added to PATH during installation
- If not found, check `/usr/local/bin/claude`

### Linux
- Ensure the claude binary has execute permissions: `chmod +x /path/to/claude`
- Add to PATH if needed: `export PATH=$PATH:/path/to/claude-directory`
