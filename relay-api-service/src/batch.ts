/**
 * Generic batch processor. Buffers items and flushes either when batchSize
 * is reached or every flushIntervalMs. Useful for batching outbound RPC /
 * price-feed calls.
 */

export class BatchProcessor<T> {
  private queue: T[] = [];
  private timer: NodeJS.Timeout;

  constructor(
    private processor: (items: T[]) => Promise<void>,
    private batchSize = 10,
    private flushIntervalMs = 1000
  ) {
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    // Don't keep the event loop alive solely for the timer.
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  async add(item: T) {
    this.queue.push(item);
    if (this.queue.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.batchSize);
    try {
      await this.processor(batch);
    } catch {
      // swallow; batched work is best-effort
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}
