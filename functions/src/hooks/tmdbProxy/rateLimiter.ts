/**
 * Sliding-window limiter that QUEUES callers instead of failing them.
 * TMDB allows ~40 req/s; the proxy runs as a single instance so this
 * in-memory limit is global. Callers that would wait longer than maxWaitMs
 * are rejected (→ 503 + Retry-After) rather than piling up forever.
 */
export class RateLimiter {
  private readonly stamps: number[] = [];
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 1000,
    private readonly maxWaitMs = 5000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Resolves when the caller may hit TMDB; rejects with RateLimitError if the queue is too long */
  acquire(): Promise<void> {
    const enqueuedAt = this.now();
    const turn = this.tail.then(() => this.waitForSlot(enqueuedAt));
    // Keep the chain alive even if this caller is rejected
    this.tail = turn.catch(() => undefined);
    return turn;
  }

  private async waitForSlot(enqueuedAt: number): Promise<void> {
    for (;;) {
      const t = this.now();
      while (this.stamps.length && t - this.stamps[0] >= this.windowMs)
        this.stamps.shift();
      if (this.stamps.length < this.limit) {
        this.stamps.push(t);
        return;
      }
      const wait = this.stamps[0] + this.windowMs - t;
      if (t + wait - enqueuedAt > this.maxWaitMs)
        throw new RateLimitError(Math.ceil(wait / 1000));
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export class RateLimitError extends Error {
  constructor(readonly retryAfterSec: number) {
    super("TMDB rate limit queue full");
  }
}
