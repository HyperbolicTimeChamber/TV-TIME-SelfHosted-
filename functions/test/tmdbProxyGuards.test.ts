import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RateLimiter,
  RateLimitError,
  isAllowedCaller,
} from "../src/hooks/tmdbProxy";

const ORIGINS = ["https://watchloom-app.web.app", "http://localhost:5173"];

test("caller filter: same-origin, allowlisted origin or referer pass", () => {
  assert.equal(
    isAllowedCaller({ "sec-fetch-site": "same-origin" }, ORIGINS),
    true,
  );
  assert.equal(
    isAllowedCaller({ origin: "https://watchloom-app.web.app" }, ORIGINS),
    true,
  );
  assert.equal(
    isAllowedCaller({ referer: "http://localhost:5173/search?q=x" }, ORIGINS),
    true,
  );
});

test("caller filter: other sites and header-less scripts are rejected", () => {
  assert.equal(
    isAllowedCaller({ origin: "https://evil.example" }, ORIGINS),
    false,
  );
  assert.equal(
    isAllowedCaller(
      { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
      ORIGINS,
    ),
    false,
  );
  assert.equal(isAllowedCaller({}, ORIGINS), false);
  assert.equal(isAllowedCaller({ referer: "not a url" }, ORIGINS), false);
});

test("rate limiter lets `limit` through immediately, queues the rest", async () => {
  const limiter = new RateLimiter(3, 100, 1000);
  const start = Date.now();
  const done: number[] = [];
  await Promise.all(
    Array.from({ length: 6 }, () =>
      limiter.acquire().then(() => done.push(Date.now() - start)),
    ),
  );
  done.sort((a, b) => a - b);
  assert.ok(done[2] < 50, `first 3 immediate (${done})`);
  assert.ok(done[3] >= 90, `4th waited for the window (${done})`);
  assert.equal(done.length, 6, "nothing dropped — queued");
});

test("rate limiter rejects when the wait would exceed maxWaitMs", async () => {
  const limiter = new RateLimiter(1, 1000, 100);
  await limiter.acquire();
  await assert.rejects(
    limiter.acquire(),
    (e) => e instanceof RateLimitError && e.retryAfterSec === 1,
  );
  // chain still usable afterwards
  const later = new RateLimiter(1, 10, 100);
  await later.acquire();
  await later.acquire();
});
