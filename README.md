# OpenSage v1.0.0

Advanced AI Coding Agent - Forked from OpenCode, OpenClaude, OpenClaw concepts

## Description

OpenSage is an autonomous AI coding agent based on the best open source concepts from:
- **OpenCode** (anomalyco/opencode) - Open source coding agent
- **OpenClaude** (gitlawb/openclaude) - Open-source coding CLI  
- **OpenClaw** (openclaw/openclaw) - Personal AI assistant

Significantly improved and trained for personal use with full tool calling capabilities.

## Features

- **Tool Calling**: Full autonomous tool execution (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch)
- **Multiple Models**: Support for big-pickle, GPT-4o, Claude, Gemini, DeepSeek
- **File Operations**: Precise read/write/edit with line numbers
- **Web Integration**: Search and fetch capabilities
- **Streaming**: Real-time response streaming
- **Sub-agents**: Task spawning for complex workflows

## Installation

```bash
git clone https://github.com/yourusername/opensage.git
cd opensage
npm install
```

## Configuration

Set your API key:

```bash
# Windows
set OPENCODE_API_KEY=your_key_here

# Linux/Mac
export OPENCODE_API_KEY=your_key_here
```

Or use a `.env` file:
```
OPENCODE_API_KEY=your_key_here
```

## Usage

```bash
# Interactive mode
npm start

# With custom directory
npm start -- -c /path/to/project

# With custom model
npm start -- -m gpt-4o
```

## Commands

- `/help` - Show help
- `/files` - List directory files
- `/cd <dir>` - Change directory
- `/model <name>` - Change model
- `/clear` - Clear history
- `/exit` - Exit

## Tools

| Tool | Description |
|------|-------------|
| `Read` | Read files with line numbers |
| `Write` | Create/overwrite files |
| `Edit` | Edit files with exact replacement |
| `Bash` | Execute terminal commands |
| `Glob` | Find files by pattern |
| `Grep` | Search content in files |
| `WebSearch` | Search the web |
| `WebFetch` | Fetch URL content |

## Default Model

`big-pickle` (recommended)

Other available models:
- `openai/gpt-4o`
- `anthropic/claude-sonnet-4-20241022`
- `google/gemini-2.0-flash-exp`
- `deepseek/deepseek-chat`

## Project Structure

```
opensage/
├── src/
│   ├── index.ts      # Core agent implementation
│   └── bin.ts       # CLI entry point
├── package.json     # NPM configuration
├── AGENTS.md       # Agent instructions/prompt
├── README.md       # This file
└── .gitignore     # Git ignore rules
```

## Publishing to NPM

```bash
npm login
npm publish
```

After publishing, users can install with:

```bash
npm install -g opensage
opensage
```

## License

MIT

## Author

Your Name