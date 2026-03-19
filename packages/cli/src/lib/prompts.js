/**
 * src/lib/prompts.js
 * Minimal interactive prompt utilities — no heavy dependencies
 */

import { createInterface } from "readline";

const c = {
  reset:  "\x1b[0m",
  dim:    "\x1b[2m",
  cyan:   "\x1b[36m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
};

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

/**
 * Text prompt with optional default and validation
 */
export async function prompt(label, { default: def, validate } = {}) {
  const hint = def ? ` ${c.dim}(${def})${c.reset}` : "";
  while (true) {
    const raw = await ask(`  ${c.cyan}◆${c.reset}  ${label}${hint}: `);
    const value = raw || def || "";
    if (validate) {
      const err = validate(value);
      if (err) {
        process.stdout.write(`     ${c.red}${err}${c.reset}\n`);
        continue;
      }
    }
    return value;
  }
}

/**
 * Single-choice select from a list
 * Shows numbered options, accepts number or exact value
 */
export async function select(label, choices, { default: defaultIndex = 0 } = {}) {
  process.stdout.write(`  ${c.cyan}◆${c.reset}  ${label}:\n`);
  choices.forEach((choice, i) => {
    const marker = i === defaultIndex ? `${c.green}▶${c.reset}` : " ";
    process.stdout.write(`     ${marker} ${i + 1}. ${choice}\n`);
  });

  while (true) {
    const raw = await ask(`     Choice ${c.dim}(${defaultIndex + 1})${c.reset}: `);
    if (!raw) return choices[defaultIndex];

    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1 && num <= choices.length) return choices[num - 1];

    const match = choices.find((c) => c === raw);
    if (match) return match;

    process.stdout.write(`     ${c.red}Enter a number 1–${choices.length}${c.reset}\n`);
  }
}

/**
 * Yes/no confirm
 */
export async function confirm(label, { default: def = true } = {}) {
  const hint = def ? "Y/n" : "y/N";
  const raw = await ask(`  ${c.cyan}◆${c.reset}  ${label} ${c.dim}(${hint})${c.reset}: `);
  if (!raw) return def;
  return raw.toLowerCase().startsWith("y");
}

/**
 * Password / secret prompt — input is hidden (no echo)
 */
export async function password(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Suppress echoing by overriding _writeToOutput
  rl._writeToOutput = (s) => {
    if (s === "\n" || s === "\r\n" || s === "\r") {
      process.stdout.write("\n");
    }
    // swallow all other output (hides typed characters)
  };

  return new Promise((resolve) => {
    rl.question(`  ${c.cyan}◆${c.reset}  ${label}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
