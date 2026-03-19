/**
 * src/commands/dev.js
 * relay dev [--dir] — run agent locally with file watch + auto-restart
 */

import { existsSync } from "fs";
import { join, resolve } from "path";
import { spawn } from "child_process";
import { loadProjectConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";

export async function dev({ dir } = {}) {
  const projectDir = resolve(dir ?? ".");

  let config;
  try {
    config = await loadProjectConfig(projectDir);
  } catch {
    // relay.config.js missing — fall back to package.json dev script
    config = null;
  }

  const agentFile = join(projectDir, "agent.js");
  if (!existsSync(agentFile)) {
    logger.error(`No agent.js found in ${projectDir}`);
    logger.info("Run: relay create [name]");
    process.exit(1);
  }

  logger.banner("relay dev", config?.name ?? "Local agent");
  logger.info(`Directory:  ${projectDir}`);
  logger.info(`Interval:   ${config?.heartbeat?.intervalSeconds ?? 60}s`);
  logger.warn("Watching for changes — Ctrl+C to stop");
  logger.newline();

  // Use --watch (Node 18+) for zero-dependency file watching
  const child = spawn(
    process.execPath,
    ["--watch", "--env-file=.env", "agent.js"],
    { cwd: projectDir, stdio: "inherit" }
  );

  child.on("error", (err) => {
    logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      logger.error(`Process exited with code ${code}`);
      process.exit(code);
    }
  });

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => { child.kill(sig); process.exit(0); });
  }
}
