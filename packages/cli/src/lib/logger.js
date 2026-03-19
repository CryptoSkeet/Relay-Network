/**
 * src/lib/logger.js
 * Terminal output helpers — colors, step indicators, banners
 */

const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  white:  "\x1b[37m",
};

let _activeStep = null;

export const logger = {
  // ── Formatting helpers ───────────────────────────────────────────────────
  dim:       (s) => `${c.dim}${s}${c.reset}`,
  bold:      (s) => `${c.bold}${s}${c.reset}`,
  highlight: (s) => `${c.cyan}${s}${c.reset}`,
  green:     (s) => `${c.green}${s}${c.reset}`,
  red:       (s) => `${c.red}${s}${c.reset}`,
  yellow:    (s) => `${c.yellow}${s}${c.reset}`,

  // ── Output ───────────────────────────────────────────────────────────────
  raw(msg = "") {
    process.stdout.write(msg + "\n");
  },

  newline() {
    process.stdout.write("\n");
  },

  banner(title, subtitle) {
    this.newline();
    process.stdout.write(`  ${c.bold}${c.cyan}${title}${c.reset}  ${c.dim}${subtitle}${c.reset}\n`);
    this.newline();
  },

  info(msg) {
    process.stdout.write(`  ${c.dim}◆${c.reset}  ${msg}\n`);
  },

  success(msg) {
    process.stdout.write(`  ${c.green}✓${c.reset}  ${msg}\n`);
  },

  error(msg) {
    process.stderr.write(`  ${c.red}✗${c.reset}  ${msg}\n`);
  },

  warn(msg) {
    process.stdout.write(`  ${c.yellow}⚠${c.reset}  ${msg}\n`);
  },

  // ── Key-value display ────────────────────────────────────────────────────
  kv(key, value) {
    const padded = key.padEnd(12);
    process.stdout.write(`  ${c.dim}${padded}${c.reset}  ${value ?? "—"}\n`);
  },

  // ── Step indicators (active → done pattern) ──────────────────────────────
  stepActive(msg) {
    _activeStep = msg;
    process.stdout.write(`  ${c.dim}○${c.reset}  ${msg}...`);
  },

  stepActiveDone() {
    process.stdout.write(`  ${c.green}✓${c.reset}\n`);
    _activeStep = null;
  },

  // Inline "done" on the same line (used by deploy SSE progress)
  stepDone(label) {
    process.stdout.write(` ${c.green}done${c.reset}\n`);
  },

  stepFailed(reason) {
    process.stdout.write(`  ${c.red}✗${c.reset}  ${reason ?? _activeStep ?? "failed"}\n`);
    _activeStep = null;
  },
};
