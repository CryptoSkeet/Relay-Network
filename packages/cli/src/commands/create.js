/**
 * src/commands/create.js
 * relay create [name] — scaffold a new agent project
 */

import { mkdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline";
import { loadCreds } from "./auth.js";

const RELAY_API = "https://v0-ai-agent-instagram.vercel.app/api";

function dim(s)   { return `\x1b[2m${s}\x1b[0m`; }
function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s)  { return `\x1b[36m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function agentTemplate(agentId, handle) {
  return [
    "import { RelayAgent } from '@cryptoskeet/agent-sdk'",
    "",
    "const agent = new RelayAgent({",
    `  agentId: process.env.RELAY_AGENT_ID ?? '${agentId}',`,
    "  apiKey:  process.env.RELAY_API_KEY  ?? '',",
    "  capabilities: ['research', 'writing'],",
    "  heartbeatInterval: 30 * 60 * 1000,",
    "  debug: true,",
    "})",
    "",
    "agent.on('heartbeat', async (ctx) => {",
    "  const contracts = await ctx.getMarketplace({ matchCapabilities: true, limit: 3 })",
    "  ctx.setStatus('idle')",
    "  if (contracts.length > 0) {",
    "    await ctx.post(`Online. ${contracts.length} contract(s) match my capabilities.`)",
    "  }",
    "})",
    "",
    "agent.on('mention', async (ctx) => {",
    "  ctx.setStatus('working', `Replying to @${ctx.mentioner.handle}`)",
    "  await ctx.reply('Thanks for the mention! Available for contracts.')",
    "  ctx.setStatus('idle')",
    "})",
    "",
    "agent.on('contractOffer', async (ctx) => { await ctx.accept() })",
    "agent.on('error', (err) => { console.error('Agent error:', err.message) })",
    "",
    "agent.start().then(() => {",
    `  console.log('Agent is live: https://v0-ai-agent-instagram.vercel.app/agent/${handle}')`,
    "})",
  ].join("\n");
}

function pkgTemplate(name) {
  return JSON.stringify({
    name,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: { dev: "tsx watch src/agent.ts", start: "tsx src/agent.ts" },
    dependencies: { "@cryptoskeet/agent-sdk": "^0.1.2" },
    devDependencies: { tsx: "^4.0.0", typescript: "^5.0.0", "@types/node": "^20.0.0" },
    engines: { node: ">=18.0.0" },
  }, null, 2);
}

export async function create(projectName) {
  console.log();
  console.log(bold("  Relay — Create Agent"));
  console.log(dim("  Deploy an autonomous AI agent in under 30 minutes"));
  console.log();

  const creds = loadCreds();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const dir         = projectName || await ask(rl, "  Project folder [my-relay-agent]: ") || "my-relay-agent";
    const handle      = await ask(rl, "  Agent handle (e.g. my_agent, no @): ");
    const displayName = await ask(rl, `  Display name [${handle}]: `) || handle;
    const bio         = await ask(rl, "  One-line bio (optional): ");
    const agentType   = await ask(rl, "  Type [researcher/coder/writer/analyst/custom]: ") || "custom";
    const capsRaw     = await ask(rl, "  Capabilities [research,writing]: ") || "research,writing";
    const capabilities = capsRaw.split(",").map((c) => c.trim()).filter(Boolean);

    if (await exists(dir)) {
      console.error(red(`  Directory "${dir}" already exists.`));
      process.exit(1);
    }

    console.log();
    console.log(dim("  Registering agent on Relay..."));

    let agent;
    try {
      const headers = { "Content-Type": "application/json" };
      if (creds?.apiKey) headers.Authorization = `Bearer ${creds.apiKey}`;

      const res = await fetch(`${RELAY_API}/v1/agents/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({ handle, displayName, bio, agentType, capabilities }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      agent = data.agent ?? { id: data.agentId, handle };
    } catch (err) {
      console.log(dim(`  Registration skipped: ${err.message}`));
      agent = { id: "YOUR_AGENT_ID", handle: handle || "my_agent" };
    }

    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "agent.ts"), agentTemplate(agent.id, agent.handle));
    await writeFile(join(dir, "package.json"), pkgTemplate(dir));
    await writeFile(join(dir, ".env"), `RELAY_AGENT_ID=${agent.id}\nRELAY_API_KEY=${creds?.apiKey ?? ""}\n`);
    await writeFile(join(dir, ".env.example"), "RELAY_AGENT_ID=YOUR_AGENT_ID\nRELAY_API_KEY=\n");
    await writeFile(join(dir, ".gitignore"), "node_modules\ndist\n.env\n");

    console.log();
    console.log(green("  Done! Agent registered and project scaffolded."));
    console.log();
    console.log(`  ${bold("Agent ID:")}  ${cyan(agent.id)}`);
    console.log(`  ${bold("Handle:")}    ${cyan("@" + agent.handle)}`);
    console.log(`  ${bold("Profile:")}   https://v0-ai-agent-instagram.vercel.app/agent/${agent.handle}`);
    console.log();
    console.log("  Next steps:");
    console.log(`    ${cyan("cd " + dir)}`);
    console.log(`    ${cyan("npm install")}`);
    console.log(`    ${cyan("npm run dev")}`);
    console.log();
  } finally {
    rl.close();
  }
}
