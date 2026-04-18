#!/usr/bin/env node
/**
 * OpenSage CLI Entry Point
 */

import readline from "readline";
import { OpenSage } from "./index.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  const args = process.argv.slice(2);
  let workdir = process.cwd();
  let model = "big-pickle";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" && i + 1 < args.length) {
      workdir = args[i + 1];
    }
    if (args[i] === "-m" && i + 1 < args.length) {
      model = args[i + 1];
    }
  }

  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENCODE_API_KEY not set");
    console.log("\nSet your API key:");
    console.log("  Windows: set OPENCODE_API_KEY=your_key");
    console.log("  Linux/Mac: export OPENCODE_API_KEY=your_key");
    process.exit(1);
  }

  const sage = new OpenSage({ apiKey, model, workdir });

  console.log(`
██████╗ ███████╗███████╗██╗     ██╗███╗   ██╗███████╗
██╔══██╗██╔════╝██╔════╝██║     ██║████╗  ██║██╔════╝
██████╔╝█████╗  █████╗  ██║     ██║██╔██╗ ██║█████╗
██╔══██╗██╔══╝  ██╔══╝  ██║     ██║██║╚██╗██║██╔══╝
██║  ██║███████╗███████╗███████╗██║██║ ╚████║███████╗
╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝╚╝  ╚═══╝╚══════╝ v1.0.0
`);
  console.log(`Directory: ${workdir}`);
  console.log(`Model: ${model}`);
  console.log("-".repeat(50));

  const commands = {
    help: "Show this help message",
    files: "List files in directory",
    clear: "Clear conversation history",
    exit: "Exit OpenSage",
    model: "Change AI model",
    cd: "Change working directory",
  };

  console.log("\nCommands:");
  for (const [cmd, desc] of Object.entries(commands)) {
    console.log(`  /${cmd.padEnd(10)} - ${desc}`);
  }
  console.log();

  const promptUser = () => {
    rl.question("> ", async (input) => {
      const prompt = input.trim();

      if (!prompt) {
        promptUser();
        return;
      }

      // Handle commands
      if (prompt.startsWith("/")) {
        const parts = prompt.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(" ");

        switch (cmd) {
          case "/help":
            console.log("\nCommands:");
            for (const [c, d] of Object.entries(commands)) {
              console.log(`  /${c.padEnd(10)} - ${d}`);
            }
            break;
          case "/files":
            try {
              const { execSync } = await import("child_process");
              const files = execSync(`ls -la "${workdir}"`, { encoding: "utf-8" });
              console.log(files);
            } catch {
              console.log("Unable to list files");
            }
            break;
          case "/clear":
            sage.clearHistory();
            console.log("History cleared");
            break;
          case "/exit":
          case "/quit":
            console.log("Goodbye!");
            rl.close();
            return;
          case "/model":
            if (args) {
              model = args;
              console.log(`Model: ${model}`);
            }
            break;
          case "/cd":
            if (args) {
              workdir = args;
              console.log(`Directory: ${workdir}`);
            }
            break;
          default:
            console.log(`Unknown command: ${cmd}`);
        }
        promptUser();
        return;
      }

      // AI chat
      console.log("\nThinking...");
      try {
        const response = await sage.chat(prompt);
        console.log(response);
      } catch (e: any) {
        console.log(`Error: ${e.message}`);
      }

      promptUser();
    });
  };

  promptUser();
}

main().catch(console.error);