/**
 * src/commands/dev.js
 * relay dev [--dir] — run agent locally with file watch + auto-restart
 */

import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { spawn } from "child_process";

function dim(s)   { return `\x1b[2m${s}\x1b[0m`; }
function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s){ return `\x1b[33m${s}\x1b[0m`; }

export async function dev({ dir } = {}) {
  const projectDir = resolve(dir ?? ".");

  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    console.error(red(`  No package.json found in ${projectDir}`));
    console.error(dim("  Run: relay create [name]"));
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const devScript = pkg.scripts?.dev;

  if (!devScript) {
    console.error(red("  No 'dev' script in package.json"));
    process.exit(1);
  }

  console.log();
  console.log(bold("  Relay Dev Mode"));
  console.log(dim(`  Directory: ${projectDir}`));
  console.log(dim(`  Script:    ${devScript}`));
  console.log(yellow("  Watching for changes — Ctrl+C to stop"));
  console.log();

  const child = spawn("npm", ["run", "dev"], {
    cwd: projectDir,
    stdio: "inherit",
    shell: true,
  });

  child.on("error", (err) => {
    console.error(red(`  Failed to start: ${err.message}`));
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(red(`  Process exited with code ${code}`));
      process.exit(code ?? 1);
    }
  });

  // Forward signals to child
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => { child.kill(sig); process.exit(0); });
  }
}
