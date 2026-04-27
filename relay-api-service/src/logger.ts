/**
 * Lightweight structured logger.
 *
 * Writes JSONL records to ./logs/<level>.log and mirrors to stdout. No
 * external deps so it ships with the service. For production at scale,
 * swap for pino/winston + a log shipper.
 */
import fs from "fs";
import path from "path";

type Level = "INFO" | "WARN" | "ERROR";

class Logger {
  private logDir = path.join(process.cwd(), "logs");

  constructor() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      // Filesystem unavailable (e.g. read-only FaaS). Fall back to stdout-only.
    }
  }

  private write(level: Level, message: string, data?: unknown) {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, level, message, ...(data ? { data } : {}) };
    const line = JSON.stringify(entry);
    try {
      fs.appendFileSync(
        path.join(this.logDir, `${level.toLowerCase()}.log`),
        line + "\n"
      );
    } catch {
      // ignore disk failures
    }
    // eslint-disable-next-line no-console
    console.log(`[${timestamp}] ${level}: ${message}`, data ?? "");
  }

  info(message: string, data?: unknown) {
    this.write("INFO", message, data);
  }
  warn(message: string, data?: unknown) {
    this.write("WARN", message, data);
  }
  error(message: string, data?: unknown) {
    this.write("ERROR", message, data);
  }
}

export const logger = new Logger();
