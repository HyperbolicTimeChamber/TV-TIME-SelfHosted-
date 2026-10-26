import { test } from "node:test";
import assert from "node:assert/strict";
import { staggerFinishTimes } from "../src/shared/stagger";

const MIN = 60_000;

test("staggerFinishTimes: back to back, the last finishing at the end time", () => {
  const end = 1_000 * MIN;
  // E1 30m, E2 20m, E3 40m → E3 at end, E2 when E3 started, E1 when E2 started
  assert.deepEqual(staggerFinishTimes([30, 20, 40], end), [
    end - 60 * MIN,
    end - 40 * MIN,
    end,
  ]);
});

test("staggerFinishTimes: unknown runtimes count as 45 minutes", () => {
  const end = 1_000 * MIN;
  assert.deepEqual(staggerFinishTimes([0, null, undefined], end), [
    end - 90 * MIN,
    end - 45 * MIN,
    end,
  ]);
});

test("staggerFinishTimes: every stamp is distinct", () => {
  const times = staggerFinishTimes(
    Array.from({ length: 89 }, () => 22),
    10_000 * MIN,
  );
  assert.equal(new Set(times).size, 89);
});
