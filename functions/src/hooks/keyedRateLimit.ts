/**
 * Sliding-window counter per key (uid, IP). In memory: each instance keeps its own window,
 * so the effective cap is limit × instances — bounded by the functions' maxInstances.
 * Rejects immediately (no queue): the caller is the problem, not upstream capacity.
 */
export class KeyedRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Prune idle keys past this many tracked keys, so a key-rotating attacker can't grow memory */
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; false when the key is over its limit (the hit is not recorded) */
  hit(key: string): boolean {
    const t = this.now();
    const fresh = (this.hits.get(key) ?? []).filter((s) => t - s < this.windowMs);
    if (fresh.length >= this.limit) {
      this.hits.set(key, fresh);
      return false;
    }
    fresh.push(t);
    this.hits.set(key, fresh);
    if (this.hits.size > this.maxKeys) this.prune(t);
    return true;
  }

  private prune(t: number) {
    for (const [key, stamps] of this.hits) {
      if (!stamps.length || t - stamps[stamps.length - 1] >= this.windowMs) this.hits.delete(key);
    }
    // Still full (every key active): drop the oldest entries rather than grow without bound
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(key);
    }
  }
}
