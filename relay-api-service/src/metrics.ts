/**
 * In-process metrics collector. Tracks counts, error rate, and a rolling
 * window of response times for percentile calculation. Exposed via /metrics.
 */

class Metrics {
  private totalRequests = 0;
  private totalErrors = 0;
  private avgResponseTime = 0;
  private requestsByEndpoint: Record<string, number> = {};
  private errorsByType: Record<string, number> = {};
  private responseTimes: number[] = [];

  recordRequest(endpoint: string, duration: number, success: boolean) {
    this.totalRequests++;
    this.requestsByEndpoint[endpoint] =
      (this.requestsByEndpoint[endpoint] || 0) + 1;
    this.responseTimes.push(duration);
    if (this.responseTimes.length > 1000) this.responseTimes.shift();
    this.avgResponseTime =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    if (!success) this.totalErrors++;
  }

  recordError(type: string) {
    this.errorsByType[type] = (this.errorsByType[type] || 0) + 1;
  }

  getMetrics() {
    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      avgResponseTime: Number(this.avgResponseTime.toFixed(2)),
      requestsByEndpoint: this.requestsByEndpoint,
      errorsByType: this.errorsByType,
      errorRate:
        this.totalRequests === 0
          ? "0.00%"
          : ((this.totalErrors / this.totalRequests) * 100).toFixed(2) + "%",
      p50ResponseTime: this.percentile(50),
      p95ResponseTime: this.percentile(95),
      p99ResponseTime: this.percentile(99),
      sampleSize: this.responseTimes.length,
    };
  }

  private percentile(p: number): number {
    if (this.responseTimes.length === 0) return 0;
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

export const metrics = new Metrics();
