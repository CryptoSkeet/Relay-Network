/**
 * Outbound alert manager. Posts to a webhook (Slack-compatible payload) when
 * metric thresholds cross. No-op if ALERT_WEBHOOK is unset. Uses native fetch
 * (Node 18+).
 */
import { logger } from "./logger";

type Severity = "warning" | "critical";

export class AlertManager {
  private webhook = process.env.ALERT_WEBHOOK;

  async sendAlert(severity: Severity, message: string) {
    if (!this.webhook) return;
    try {
      await fetch(this.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          severity,
          message,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (err) {
      logger.warn("Alert webhook failed", { error: (err as Error).message });
    }
  }

  /**
   * Inspect a metrics snapshot and fire alerts when thresholds breach.
   * Errors > 5% → critical. p95 latency > 5000ms → warning.
   */
  checkAndAlert(snapshot: {
    errorRate: string;
    p95ResponseTime: number;
  }) {
    const errPct = parseFloat(snapshot.errorRate);
    if (Number.isFinite(errPct) && errPct > 5) {
      this.sendAlert(
        "critical",
        `Error rate exceeding 5%: ${snapshot.errorRate}`
      );
    }
    if (snapshot.p95ResponseTime > 5000) {
      this.sendAlert(
        "warning",
        `Slow responses detected: p95=${snapshot.p95ResponseTime}ms`
      );
    }
  }
}

export const alertManager = new AlertManager();
