import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyedRateLimiter } from "../src/hooks/keyedRateLimit";

test("allows up to the limit per key inside the window, then rejects", () => {
  let t = 0;
  const rl = new KeyedRateLimiter(3, 1000, 100, () => t);
  assert.equal(rl.hit("a"), true);
  assert.equal(rl.hit("a"), true);
  assert.equal(rl.hit("a"), true);
  assert.equal(rl.hit("a"), false);
  assert.equal(rl.hit("b"), true, "other keys unaffected");
  t = 1000;
  assert.equal(rl.hit("a"), true, "window slid past the old hits");
});

test("rejected hits don't extend the block", () => {
  let t = 0;
  const rl = new KeyedRateLimiter(1, 1000, 100, () => t);
  rl.hit("a");
  t = 500;
  assert.equal(rl.hit("a"), false);
  t = 1000;
  assert.equal(rl.hit("a"), true);
});

test("memory stays bounded when keys rotate", () => {
  let t = 0;
  const rl = new KeyedRateLimiter(5, 1000, 50, () => t);
  for (let i = 0; i < 500; i++) rl.hit(`k${i}`);
  // @ts-expect-error private, checked for the bound only
  assert.ok(rl.hits.size <= 50);
});
