/**
 * packages/cli/src/commands/plugin.js
 *
 * relay plugin add <package>     — install + wire into relay.config.js
 * relay plugin list              — show available plugins from registry
 * relay plugin remove <package>  — uninstall + remove from relay.config.js
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
