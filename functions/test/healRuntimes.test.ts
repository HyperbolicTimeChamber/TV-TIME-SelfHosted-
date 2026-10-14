import { test } from "node:test";
import assert from "node:assert/strict";
import { filledRuntimes, healedMinutes } from "../src/hooks/runtimeHeal/healRuntimes";

const show = (eps: Array<[number, number, number | null]>) => ({
  seasons: [1, 2].map((s) => ({
    seasonNumber: s,
    episodeCount: 0,
    airDate: null,
    episodes: eps
      .filter(([season]) => season === s)
      .map(([, e, runtime]) => ({ episodeNumber: e, title: "", overview: "", airDate: null, runtime, stillPath: null })),
  })),
});

test("filledRuntimes: only episodes that gained a runtime", () => {
  const before = show([[1, 1, 30], [1, 2, null], [2, 1, 0]]);
  const after = show([[1, 1, 31], [1, 2, 45], [2, 1, 50], [2, 2, null]]);
  assert.deepEqual([...filledRuntimes(before as any, after as any)], [["1_2", 45], ["2_1", 50]]);
});

test("healedMinutes: runtime × watchCount for episodes the catalog now knows", () => {
  const runtimes = new Map([["1_2", 45], ["2_1", 50]]);
  const { minutes, healed } = healedMinutes(
    [
      { season: 1, episode: 2, watchCount: 2 },
      { season: 2, episode: 1 }, // watchCount missing → 1
      { season: 3, episode: 1 }, // still unknown → left alone
    ],
    runtimes,
  );
  assert.equal(minutes, 140);
  assert.equal(healed.length, 2);
});
