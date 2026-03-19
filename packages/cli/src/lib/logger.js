/**
 * src/lib/logger.js
 *
 * Zero-dependency colored terminal output.
 * Pure ANSI escape codes — no chalk, no kleur, no picocolors.
 * Works in Node 18+ on macOS, Linux, and Windows Terminal.
 */

const ANSI = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  // Foreground colors
  black:   "\x1b[30m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",
};

// Disable colors when not in a TTY or when NO_COLOR is set
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, str) => useColor ? `${code}${str}${ANSI.reset}` : str;

export const logger = {
  // Relay brand prefix — shown on all non-raw log lines
  _prefix: () => c(ANSI.cyan + ANSI.bold, "relay") + " ",

  info(msg)    { console.log(this._prefix() + msg); },
  success(msg) { console.log(this._prefix() + c(ANSI.green, "✓") + " " + msg); },
  warn(msg)    { console.log(this._prefix() + c(ANSI.yellow, "⚠") + " " + msg); },
  error(msg)   { console.error(this._prefix() + c(ANSI.red, "✗") + " " + msg); },
  debug(msg)   { if (process.env.RELAY_DEBUG) console.log(c(ANSI.gray, "  " + msg)); },

  // Step progress — used by deploy/create flows
  step(n, total, msg) {
    const counter = c(ANSI.gray, `[${n}/${total}]`);
    console.log(`  ${counter} ${msg}`);
  },

  stepDone(msg) {
    console.log(`  ${c(ANSI.green, "✓")} ${c(ANSI.dim, msg)}`);
  },

  stepFail(msg) {
    console.log(`  ${c(ANSI.red, "✗")} ${msg}`);
  },

  stepActive(msg) {
    process.stdout.write(`  ${c(ANSI.blue, "◆")} ${msg}...`);
  },

  stepActiveDone() {
    process.stdout.write(` ${c(ANSI.green, "done")}\n`);
  },

  // Raw output with no prefix — for banners and structured content
  raw(msg)    { console.log(msg); },
  newline()   { console.log(""); },

  // Boxed banner — shown at start of create/deploy
  banner(title, subtitle) {
    const line = "─".repeat(44);
    this.raw("");
    this.raw(c(ANSI.cyan, `  ┌${line}┐`));
    this.raw(c(ANSI.cyan, "  │") + c(ANSI.bold, `  ${title.padEnd(43)}`) + c(ANSI.cyan, "│"));
    if (subtitle) {
      this.raw(c(ANSI.cyan, "  │") + c(ANSI.gray, `  ${subtitle.padEnd(43)}`) + c(ANSI.cyan, "│"));
    }
    this.raw(c(ANSI.cyan, `  └${line}┘`));
    this.raw("");
  },

  // Key-value display — used by `relay agents list`
  kv(key, value) {
    const k = c(ANSI.gray, key.padEnd(18));
    console.log(`  ${k}  ${value}`);
  },

  // Highlight specific text within a message
  highlight(str) { return c(ANSI.cyan, str); },
  bold(str)      { return c(ANSI.bold, str); },
  dim(str)       { return c(ANSI.dim, str); },
  green(str)     { return c(ANSI.green, str); },
  red(str)       { return c(ANSI.red, str); },
  yellow(str)    { return c(ANSI.yellow, str); },
};
