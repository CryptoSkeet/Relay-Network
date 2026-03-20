/**
 * packages/cli/src/commands/plugin.js
 *
 * relay plugin add <package>     — install + wire into relay.config.js
 * relay plugin list              — show available plugins from registry
 * relay plugin remove <package>  — uninstall + remove from relay.config.js
 * relay plugin submit <package>  — submit to the Relay plugin registry
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fetchRegistry, installPlugin } from "@relay-ai/plugin-sdk";

// ---------------------------------------------------------------------------
// relay plugin add <package>
// ---------------------------------------------------------------------------

export async function pluginAdd(packageName, options = {}) {
  const projectDir = options.dir ?? process.cwd();

  if (!existsSync(join(projectDir, "package.json"))) {
    console.error("No package.json found. Run this command from a Relay agent project directory.");
    process.exit(1);
  }

  try {
    await installPlugin(packageName, projectDir);
  } catch (err) {
    console.error(`Failed to install plugin: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// relay plugin list
// ---------------------------------------------------------------------------

export async function pluginList() {
  console.log("Fetching plugin registry...\n");

  const registry = await fetchRegistry();
  const entries  = Object.entries(registry);

  if (entries.length === 0) {
    console.log("No plugins found in registry.");
    return;
  }

  const nameWidth = Math.max(...entries.map(([n]) => n.length), 10);

  for (const [name, meta] of entries) {
    const caps = meta.capabilities?.join(", ") ?? "";
    console.log(`  ${name.padEnd(nameWidth + 2)} ${meta.description}`);
    if (caps) console.log(`  ${"".padEnd(nameWidth + 2)} capabilities: ${caps}`);
    console.log();
  }

  console.log(`Install with:  relay plugin add <package-name>`);
}

// ---------------------------------------------------------------------------
// relay plugin remove <package>
// ---------------------------------------------------------------------------

export async function pluginRemove(packageName, options = {}) {
  const projectDir = options.dir ?? process.cwd();

  // 1. npm uninstall
  console.log(`Removing ${packageName}...`);
  try {
    execSync(`npm uninstall ${packageName}`, { cwd: projectDir, stdio: "inherit" });
  } catch (err) {
    console.error(`npm uninstall failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Remove from relay.config.js
  const configPath = join(projectDir, "relay.config.js");
  if (existsSync(configPath)) {
    let config = readFileSync(configPath, "utf8");
    const before = config;

    // Remove bare string entry: "package-name",
    config = config.replace(new RegExp(`\\s*"${escapeRegex(packageName)}",?\\n?`, "g"), "\n");
    // Remove array entry: ["package-name", { ... }],  (single line)
    config = config.replace(new RegExp(`\\s*\\["${escapeRegex(packageName)}",[^\\]]*\\],?\\n?`, "g"), "\n");

    if (config !== before) {
      writeFileSync(configPath, config);
      console.log(`Removed "${packageName}" from relay.config.js`);
    }
  }

  console.log(`✓ ${packageName} removed`);
}

// ---------------------------------------------------------------------------
// relay plugin submit <package>
// ---------------------------------------------------------------------------

export async function pluginSubmit(packageName) {
  // Read the local package.json to validate it looks like a Relay plugin
  let meta;
  try {
    const raw = readFileSync("package.json", "utf8");
    meta = JSON.parse(raw);
  } catch {
    console.error("No package.json found. Run from your plugin's root directory.");
    process.exit(1);
  }

  if (meta.name !== packageName) {
    console.error(`package.json name "${meta.name}" does not match "${packageName}"`);
    process.exit(1);
  }

  if (!meta.version || !meta.description) {
    console.error("package.json must have name, version, and description");
    process.exit(1);
  }

  // POST to the registry submission endpoint
  const SUBMIT_URL = "https://relay-ai-agent-social.vercel.app/api/plugins/submit";

  console.log(`Submitting ${packageName}@${meta.version} to the Relay plugin registry...`);

  try {
    const res = await fetch(SUBMIT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name:        meta.name,
        version:     meta.version,
        description: meta.description,
        npm:         meta.name,
        keywords:    meta.keywords ?? [],
        homepage:    meta.homepage ?? "",
      }),
    });

    if (res.status === 201 || res.status === 200) {
      console.log(`✓ ${packageName} submitted — pending review`);
      console.log(`  Once approved it will appear in: relay plugin list`);
    } else if (res.status === 409) {
      console.log(`✓ ${packageName}@${meta.version} already in registry`);
    } else {
      const body = await res.json().catch(() => ({}));
      console.error(`Submission failed (${res.status}): ${body.error ?? res.statusText}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
