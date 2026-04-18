/**
 * OpenSage - Advanced AI Coding Agent
 * Based on the best concepts from OpenCode, OpenClaude, OpenClaw
 * Significantly improved and trained for personal use
 */

import OpenAI from "openai";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const API_BASE = "https://opencode.ai/v1";
const DEFAULT_MODEL = "big-pickle";

// Tool schemas using Zod
const ToolSchemas = {
  Read: {
    name: "Read",
    description: "Read a file from the filesystem",
    parameters: z.object({
      filePath: z.string().describe("Path to the file to read"),
      offset: z.number().optional().describe("Line number to start reading from (1-indexed)"),
      limit: z.number().optional().describe("Maximum number of lines to read"),
    }),
  },
  Write: {
    name: "Write",
    description: "Write content to a file",
    parameters: z.object({
      filePath: z.string().describe("Path to the file to write"),
      content: z.string().describe("Content to write to the file"),
    }),
  },
  Edit: {
    name: "Edit",
    description: "Edit a specific string in a file with exact replacement",
    parameters: z.object({
      filePath: z.string().describe("Path to the file to edit"),
      oldString: z.string().describe("Exact string to find and replace"),
      newString: z.string().describe("String to replace it with"),
    }),
  },
  Bash: {
    name: "Bash",
    description: "Execute a bash command in the terminal",
    parameters: z.object({
      command: z.string().describe("Command to execute"),
      timeout: z.number().optional().describe("Timeout in milliseconds (default: 120000)"),
    }),
  },
  Glob: {
    name: "Glob",
    description: "Find files matching a glob pattern",
    parameters: z.object({
      pattern: z.string().describe("Glob pattern to match (e.g., **/*.ts)"),
      path: z.string().optional().describe("Directory to search in"),
    }),
  },
  Grep: {
    name: "Grep",
    description: "Search for content in files",
    parameters: z.object({
      pattern: z.string().describe("Pattern to search for"),
      path: z.string().optional().describe("Directory to search in"),
      include: z.string().optional().describe("File patterns to include"),
    }),
  },
  WebSearch: {
    name: "WebSearch",
    description: "Search the web for information",
    parameters: z.object({
      query: z.string().describe("Search query"),
    }),
  },
  WebFetch: {
    name: "WebFetch",
    description: "Fetch content from a URL",
    parameters: z.object({
      url: z.string().describe("URL to fetch"),
    }),
  },
  Task: {
    name: "Task",
    description: "Create a sub-agent to handle a specific task",
    parameters: z.object({
      prompt: z.string().describe("Task description for the sub-agent"),
      agent: z.string().optional().describe("Agent type to use (default: build)"),
    }),
  },
};

type ToolName = keyof typeof ToolSchemas;

interface ToolResult {
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

class OpenSage {
  private client: OpenAI;
  private model: string;
  private workdir: string;
  private messages: OpenAI.Chat.CompletionMessageParam[] = [];
  private apiKey: string;
  private tools: Map<string, z.ZodType> = new Map();

  constructor(options: { apiKey?: string; model?: string; workdir?: string } = {}) {
    this.apiKey = options.apiKey || process.env.OPENCODE_API_KEY || "";
    this.model = options.model || DEFAULT_MODEL;
    this.workdir = options.workdir || process.cwd();

    if (!this.apiKey) {
      throw new Error("API key required. Set OPENCODE_API_KEY or pass apiKey option.");
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: API_BASE,
    });

    // Register tools
    for (const [name, schema] of Object.entries(ToolSchemas)) {
      this.tools.set(name, schema.parameters);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const toolFn = this.toolFunctions[name];
    if (!toolFn) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return toolFn(args) as Promise<ToolResult>;
  }

  private toolFunctions: Record<string, (args: any) => Promise<ToolResult>> = {
    Read: async ({ filePath, offset = 1, limit = 2000 }) => {
      try {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath);
        const content = await fs.readFile(fullPath, "utf-8");
        const lines = content.split("\n");
        const start = Math.min(offset - 1, lines.length);
        const end = Math.min(start + limit, lines.length);
        const result = lines.slice(start, end).map((line, i) => `${start + i + 1}: ${line}`).join("\n");
        return { content: result };
      } catch (e: any) {
        return { content: `Error: ${e.message}` };
      }
    },

    Write: async ({ filePath, content }) => {
      try {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        return { content: `Written to ${filePath}` };
      } catch (e: any) {
        return { content: `Error: ${e.message}` };
      }
    },

    Edit: async ({ filePath, oldString, newString }) => {
      try {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath);
        let content = await fs.readFile(fullPath, "utf-8");
        if (!content.includes(oldString)) {
          return { content: `String not found in file` };
        }
        content = content.replace(oldString, newString);
        await fs.writeFile(fullPath, content, "utf-8");
        return { content: `Edited ${filePath}` };
      } catch (e: any) {
        return { content: `Error: ${e.message}` };
      }
    },

    Bash: async ({ command, timeout = 120000 }) => {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: this.workdir,
          timeout: timeout / 1000,
        });
        return { content: stdout + stderr };
      } catch (e: any) {
        return { content: e.message };
      }
    },

    Glob: async ({ pattern, path: searchPath = "." }) => {
      const files: string[] = [];
      const dir = path.join(this.workdir, searchPath);

      async function walk(dir: string) {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              await walk(fullPath);
            } else if (entry.isFile()) {
              if (matchPattern(entry.name, pattern)) {
                files.push(fullPath);
              }
            }
          }
        } catch {}
      }

      function matchPattern(name: string, pattern: string): boolean {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
        return regex.test(name);
      }

      await walk(dir);
      return { content: files.join("\n") || "No files found" };
    },

    Grep: async ({ pattern, path: searchPath = ".", include = "*" }) => {
      const matches: string[] = [];
      const dir = path.join(this.workdir, searchPath);

      async function walk(dir: string) {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              await walk(fullPath);
            } else if (entry.isFile() && matchPattern(entry.name, include)) {
              const content = await fs.readFile(fullPath, "utf-8").catch(() => "");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(pattern.toLowerCase())) {
                  matches.push(`${entry.name}:${i + 1}: ${lines[i].substring(0, 100)}`);
                }
              }
            }
          }
        } catch {}
      }

      function matchPattern(name: string, pattern: string): boolean {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
        return regex.test(name);
      }

      await walk(dir);
      return { content: matches.slice(0, 100).join("\n") || "No matches found" };
    },

    WebSearch: async ({ query }) => {
      try {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
        const data = await res.json() as any;
        const results = (data.RelatedTopics || []).slice(0, 5).map((r: any) => r.Text || r.name).join("\n");
        return { content: results || "No results found" };
      } catch (e: any) {
        return { content: `Error: ${e.message}` };
      }
    },

    WebFetch: async ({ url }) => {
      try {
        const res = await fetch(url);
        const text = await res.text();
        return { content: text.substring(0, 30000) };
      } catch (e: any) {
        return { content: `Error: ${e.message}` };
      }
    },
  };

  private buildToolDefinitions(): OpenAI.Chat.CompletionTool[] {
    const tools: OpenAI.Chat.CompletionTool[] = [];

    for (const [name, schema] of Object.entries(ToolSchemas)) {
      tools.push({
        type: "function",
        function: {
          name,
          description: schema.description,
          parameters: schema.parameters,
        },
      });
    }

    return tools;
  }

  async chat(prompt: string, options: { stream?: boolean } = {}): Promise<string> {
    // Build system prompt
    const systemPrompt = this.getSystemPrompt();

    // Add to conversation
    this.messages.push({ role: "system", content: systemPrompt });
    this.messages.push({ role: "user", content: prompt });

    // Make API call
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      tools: this.buildToolDefinitions(),
      temperature: 0,
    });

    const message = response.choices[0];
    if (!message) {
      return "No response";
    }

    // Handle tool calls
    if (message.finish_reason === "tool_calls" && message.message.tool_calls) {
      const toolCall = message.message.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);

      const result = await this.callTool(toolCall.function.name, args);

      this.messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          },
        ],
      });

      this.messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.content,
      });

      // Continue conversation
      const finalResponse = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        temperature: 0,
      });

      const finalMessage = finalResponse.choices[0]?.message?.content || "";
      this.messages.push({ role: "user", content: prompt });
      this.messages.push({ role: "assistant", content: finalMessage });

      return finalMessage;
    }

    this.messages.push({ role: "user", content: prompt });
    this.messages.push({ role: "assistant", content: message.message.content || "" });

    return message.message.content || "";
  }

  private getSystemPrompt(): string {
    return `You are **OpenSage**, an advanced AI coding agent forked from the best open source projects (OpenCode, OpenClaude, OpenClaw).

Your defining traits:
- **Autonomous**: Execute tasks directly, not just suggest
- **Precise**: Edit files with exact string matching
- **Concise**: Respond without unnecessary preamble
- **Proactive**: Take initiative to complete goals

WORKING DIRECTORY: ${this.workdir}
MODEL: ${this.model}

CAPABILITIES:
- Read: Read files with line numbers
- Write: Create/overwrite files
- Edit: Edit files with string replacement
- Bash: Execute terminal commands
- Glob: Find files by pattern
- Grep: Search content in files
- WebSearch: Search the web
- WebFetch: Fetch URL content

INSTRUCTIONS:
1. When editing files, READ first to see actual content
2. Make EXACT string replacements
3. Execute commands directly, show results
4. Answer CONCISELY without preamble
5. Use tools autonomously to complete tasks`;
  }

  clearHistory(): void {
    this.messages = [];
  }

  getHistory(): OpenAI.Chat.CompletionMessageParam[] {
    return this.messages;
  }
}

export { OpenSage, ToolSchemas, ToolName, ToolResult };
export default OpenSage;