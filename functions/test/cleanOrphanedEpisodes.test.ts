import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanOrphanedEpisodes } from "../src/hooks/upcoming/cleanOrphanedEpisodes";
import { fakeDb, trackingDoc } from "./helpers";
import type { CatalogShow } from "../src/shared/types";

const show = (episodes: number) =>
  ({ seasons: [{ seasonNumber: 1, episodes: Array.from({ length: episodes }, () => ({})) }] }) as unknown as CatalogShow;

test("queries only the candidate shows' watched docs and removes episodes the catalog dropped", async () => {
  const db = fakeDb([
    { tmdbShowId: 1, season: 1, episode: 1, watchCount: 1, runtime: 30 },
    { tmdbShowId: 1, season: 1, episode: 3, watchCount: 2, runtime: 30 }, // dropped from catalog
    { tmdbShowId: 2, season: 1, episode: 9, watchCount: 1, runtime: 30 }, // other show: never read
  ]);
  await cleanOrphanedEpisodes(db, "u", [trackingDoc("tv_1", {})], new Map([["tv_1", show(2)]]));
  assert.equal(db.state.queries, 1, "one `in` query, not a whole-collection read");
  const stats = db.state.writes.find((w) => w.path === "users/u")?.data.stats as Record<string, { operand: number }>;
  assert.ok(stats, "stats decremented for the orphan");
});

test("no candidates → no reads", async () => {
  const db = fakeDb([{ tmdbShowId: 1, season: 1, episode: 5 }]);
  await cleanOrphanedEpisodes(db, "u", [], new Map());
  assert.equal(db.state.queries, 0);
});
