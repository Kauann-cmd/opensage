#!/usr/bin/env node
/**
 * OpenSage - AI Coding Agent CLI
 * Based on OpenCode, OpenClaude, OpenClaw concepts, improved for personal use
 */

import readline from "readline";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync, spawn } from "child_process";
import https from "https";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = "https://opencode.ai/api";
const DEFAULT_MODEL = "big-pickle";

class OpenSage {
  constructor(workdir = process.cwd()) {
    this.workdir = path.resolve(workdir);
    this.config = this.loadConfig();
    this.model = this.config.model || DEFAULT_MODEL;
    this.conversation = [];
    this.apiKey = process.env.OPENCODE_API_KEY;
  }

  loadConfig() {
    const configPath = path.join(process.env.HOME || process.env.USERPROFILE, ".opensage", "config.json");
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf-8"));
      }
    } catch (e) {}
    return { model: DEFAULT_MODEL };
  }

  saveConfig() {
    const configDir = path.join(process.env.HOME || process.env.USERPROFILE, ".opensage");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const configPath = path.join(configDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
  }

  async callApi(prompt) {
    if (!this.apiKey) {
      return "Erro: Configure OPENCODE_API_KEY";
    }

    const messages = [
      { role: "system", content: this.systemPrompt() },
      ...this.conversation,
      { role: "user", content: prompt }
    ];

    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.model,
        messages,
        stream: false
      });

      const req = https.request(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        }
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            const content = json.choices?.[0]?.message?.content;
            resolve(content || "No response");
          } catch (e) {
            resolve(`Error: ${body}`);
          }
        });
      });

      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  systemPrompt() {
    return `Você é OpenSage, um assistente de programação autônomo.

CAPACIDADES:
- Read: Ler arquivos do sistema
- Write: Criar/sobrescrever arquivos
- Edit: Editar arquivos com precisão
- Bash: Executar comandos no terminal
- Glob: Buscar arquivos por padrão
- Grep: Buscar conteúdo em arquivos
- WebSearch: Pesquisar na web
- WebFetch: Buscar conteúdo de URLs

DIRETÓRIO: ${this.workdir}
MODELO: ${this.model}

INSTRUÇÕES:
- Use ferramentas autonomously para completar tarefas
- Execute ações diretamente, não apenas sugira
- Edite arquivos com precisão usando tools
- Responda de forma concisa sem preamble
- WORKING DIRECTORY: ${this.workdir}

Execute a tarefa agora.`;
  }

  async toolRead(filePath, offset = 1, limit = 2000) {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath);
      if (!fs.existsSync(fullPath)) {
        return `File not found: ${filePath}`;
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      const start = Math.min(offset - 1, lines.length);
      const end = Math.min(start + limit, lines.length);
      const result = [];
      for (let i = start; i < end; i++) {
        result.push(`${i + 1}: ${lines[i]}`);
      }
      return result.join("\n");
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  async toolWrite(filePath, content) {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, "utf-8");
      return `Written to ${filePath}`;
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  async toolEdit(filePath, oldString, newString) {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath);
      if (!fs.existsSync(fullPath)) {
        return `File not found: ${filePath}`;
      }
      let content = fs.readFileSync(fullPath, "utf-8");
      if (!content.includes(oldString)) {
        return `String not found in file`;
      }
      content = content.replace(oldString, newString);
      fs.writeFileSync(fullPath, content, "utf-8");
      return `Edited ${filePath}`;
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  async toolBash(command, timeout = 120000) {
    return new Promise((resolve) => {
      try {
        const result = execSync(command, {
          cwd: this.workdir,
          timeout: timeout / 1000,
          encoding: "utf-8",
          shell: true
        });
        resolve(result || "Command executed with no output");
      } catch (e) {
        resolve(e.message || `Error: ${e.stderr || e.message}`);
      }
    });
  }

  async toolGlob(pattern) {
    try {
      const files = globSync(pattern, { cwd: this.workdir, absolute: false });
      return files.length ? files.join("\n") : "No files found";
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  async toolGrep(pattern, searchPath = ".") {
    const matches = [];
    const searchDir = path.join(this.workdir, searchPath);
    
    function walkDir(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(pattern.toLowerCase())) {
                  matches.push(`${entry.name}:${i + 1}: ${lines[i].substring(0, 100)}`);
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
    
    walkDir(searchDir);
    return matches.length ? matches.slice(0, 100).join("\n") : "No matches found";
  }

  async toolWebSearch(query) {
    return new Promise((resolve) => {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
      http.get(url, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            const results = data.RelatedTopics || [];
            resolve(results.slice(0, 5).map(r => r.Text || r.name).join("\n") || "No results");
          } catch (e) {
            resolve(`Error: ${e.message}`);
          }
        });
      }).on("error", resolve);
    });
  }

  async toolWebFetch(url) {
    return new Promise((resolve) => {
      const client = url.startsWith("https") ? https : http;
      client.get(url, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          resolve(body.substring(0, 30000));
        });
      }).on("error", resolve);
    });
  }

  getContext() {
    try {
      const files = fs.readdirSync(this.workdir);
      return files.slice(0, 20).join("\n") || "vazio";
    } catch (e) {
      return "vazio";
    }
  }

  async runInteractive() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`OpenSage v1.0.0 - AI Coding Agent`);
    console.log(`Diretório: ${this.workdir}`);
    console.log(`Modelo: ${this.model}`);
    console.log("-".repeat(40));
    console.log("Comandos: /help /files /cd /model /clear /exit\n");

    const promptUser = () => {
      rl.question("> ", async (input) => {
        const prompt = input.trim();
        
        if (!prompt) {
          promptUser();
          return;
        }

        if (prompt === "/exit" || prompt === "/quit") {
          rl.close();
          return;
        }

        if (prompt === "/help") {
          console.log(`
/help           - Mostrar ajuda
/files          - Listar arquivos
/cd <dir>       - Mudar diretório
/model <nome>  - Alterar modelo
/clear          - Limpar histórico
/clear-config   - Limpar configuração
/exit           - Sair
<mensagem>      - Chat normal com IA
          `);
          promptUser();
          return;
        }

        if (prompt === "/files") {
          const files = fs.readdirSync(this.workdir);
          files.forEach(f => console.log(`  ${f}`));
          promptUser();
          return;
        }

        if (prompt.startsWith("/cd ")) {
          const newDir = prompt.substring(4).trim();
          if (fs.existsSync(newDir)) {
            this.workdir = path.resolve(newDir);
            console.log(`Diretório: ${this.workdir}`);
          } else {
            console.log(`Diretório não encontrado: ${newDir}`);
          }
          promptUser();
          return;
        }

        if (prompt.startsWith("/model ")) {
          this.model = prompt.substring(7).trim();
          this.config.model = this.model;
          this.saveConfig();
          console.log(`Modelo: ${this.model}`);
          promptUser();
          return;
        }

        if (prompt === "/clear") {
          this.conversation = [];
          console.log("Histórico limpo");
          promptUser();
          return;
        }

        if (prompt === "/clear-config") {
          const configPath = path.join(process.env.HOME || process.env.USERPROFILE, ".opensage", "config.json");
          if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
          }
          console.log("Configuração limpa");
          promptUser();
          return;
        }

        if (prompt.startsWith("/")) {
          console.log(`Comando desconhecido: ${prompt}`);
          promptUser();
          return;
        }

        console.log("\nPensando...");
        try {
          const response = await this.callApi(prompt);
          console.log(response);
          this.conversation.push({ role: "user", content: prompt });
          this.conversation.push({ role: "assistant", content: response });
        } catch (e) {
          console.log(`Erro: ${e.message}`);
        }

        promptUser();
      });
    };

    promptUser();
  }
}

function globSync(pattern, options = {}) {
  const cwd = options.cwd || process.cwd();
  const results = [];
  
  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(cwd, fullPath);
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && pattern.includes("*")) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (matchPattern(entry.name, pattern)) {
            results.push(relativePath);
          }
        }
      }
    } catch (e) {}
  }

  function matchPattern(name, pattern) {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    return regex.test(name);
  }

  walk(cwd);
  return results;
}

async function main() {
  let workdir = process.cwd();
  
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" && i + 1 < args.length) {
      workdir = args[i + 1];
    }
  }

  const agent = new OpenSage(workdir);
  agent.runInteractive();
}

main().catch(console.error);