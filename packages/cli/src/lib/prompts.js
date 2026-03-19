/**
 * src/lib/prompts.js
 *
 * Zero-dependency interactive prompts using Node's built-in readline.
 * Covers everything relay create needs: text, password, select, confirm.
 *
 * Why not inquirer/prompts/enquirer?
 * Each adds 50-300 transitive dependencies. For 4 prompt types we don't
 * need the baggage. readline ships with Node — no install, no version drift.
 */

import readline from "readline";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ---------------------------------------------------------------------------
// Text prompt
// prompt("Agent name", { default: "my-agent" })
// ---------------------------------------------------------------------------

export async function prompt(label, { default: defaultVal, validate } = {}) {
  const rl = createRL();
  const hint = defaultVal ? ` (${defaultVal})` : "";

  while (true) {
    const raw = await ask(rl, `  ${label}${hint}: `);
    const value = raw.trim() || defaultVal || "";

    if (validate) {
      const err = validate(value);
      if (err) {
        console.log(`  ⚠ ${err}`);
        continue;
      }
    }

    rl.close();
    return value;
  }
}

// ---------------------------------------------------------------------------
// Password prompt — input hidden
// password("Anthropic API key")
// ---------------------------------------------------------------------------

export async function password(label) {
  return new Promise((resolve) => {
    const rl = createRL();

    // Hide input by suppressing keystrokes
    process.stdout.write(`  ${label}: `);
    rl.stdoutMuted = true;

    rl._writeToOutput = function(str) {
      if (rl.stdoutMuted) {
        process.stdout.write("*");
      } else {
        process.stdout.write(str);
      }
    };

    rl.question("", (value) => {
      rl.stdoutMuted = false;
      console.log(""); // newline after hidden input
      rl.close();
      resolve(value.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Select prompt — arrow-key style via numbered options
// select("Model provider", ["anthropic", "openai", "ollama"])
// ---------------------------------------------------------------------------

export async function select(label, options, { default: defaultIdx = 0 } = {}) {
  const rl = createRL();

  console.log(`  ${label}:`);
  options.forEach((opt, i) => {
    const marker = i === defaultIdx ? "◆" : "◇";
    console.log(`    ${i + 1}. ${marker} ${opt}`);
  });

  while (true) {
    const raw = await ask(rl, `  Choice (1-${options.length}) [${defaultIdx + 1}]: `);
    const n = raw.trim() === "" ? defaultIdx + 1 : parseInt(raw.trim(), 10);

    if (!isNaN(n) && n >= 1 && n <= options.length) {
      rl.close();
      return options[n - 1];
    }

    console.log(`  ⚠ Enter a number between 1 and ${options.length}`);
  }
}

// ---------------------------------------------------------------------------
// Confirm prompt — y/n
// confirm("Enable autonomous posting?", { default: true })
// ---------------------------------------------------------------------------

export async function confirm(label, { default: defaultVal = true } = {}) {
  const rl = createRL();
  const hint = defaultVal ? "Y/n" : "y/N";

  while (true) {
    const raw = await ask(rl, `  ${label} (${hint}): `);
    const val = raw.trim().toLowerCase();

    if (val === "" ) { rl.close(); return defaultVal; }
    if (val === "y" || val === "yes") { rl.close(); return true; }
    if (val === "n" || val === "no")  { rl.close(); return false; }

    console.log("  ⚠ Enter y or n");
  }
}
