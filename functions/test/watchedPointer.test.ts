import { test } from "node:test";
import assert from "node:assert/strict";
import { isBeforePointer } from "../src/hooks/upcoming/watchedPointer";

test("episodes before the pointer count as watched", () => {
  const p = { season: 2, episode: 3 };
  assert.equal(isBeforePointer(1, 9, p), true);
  assert.equal(isBeforePointer(2, 2, p), true);
  assert.equal(isBeforePointer(2, 3, p), false); // next to watch
  assert.equal(isBeforePointer(2, 4, p), false);
  assert.equal(isBeforePointer(3, 1, p), false);
});

test("no pointer → nothing treated as watched", () => {
  assert.equal(isBeforePointer(1, 1, null), false);
  assert.equal(isBeforePointer(5, 5, undefined), false);
});

test("addShowToUpcoming skips watched episodes airing today", async () => {
  const { addShowToUpcoming } = await import(
    "../src/hooks/upcoming/addShowToUpcoming"
  );
  const today = new Date().toISOString().slice(0, 10);
  const later = "2999-01-01";
  const ep = (n: number, airDate: string) => ({
    episodeNumber: n,
    title: `E${n}`,
    airDate,
    overview: "",
    runtime: 30,
    stillPath: null,
  });
  const docs: Record<string, unknown> = {
    "shows/tv_1": {
      tmdbId: 1,
      title: "Show",
      posterPath: null,
      seasons: [{ seasonNumber: 1, episodes: [ep(1, today), ep(2, later)] }],
    },
    // E1 (airs today) already watched → pointer on E2
    "users/u/tracking/tv_1": { nextEpisode: { season: 1, episode: 2 } },
  };
  const writes: string[] = [];
  const db = {
    doc: (path: string) => ({
      get: async () => ({ exists: path in docs, data: () => docs[path] }),
    }),
    collection: (path: string) => ({
      doc: (id: string) => ({ path: `${path}/${id}` }),
    }),
    batch: () => ({
      set: (ref: { path: string }) => writes.push(ref.path),
      commit: async () => undefined,
    }),
  } as unknown as FirebaseFirestore.Firestore;

  await addShowToUpcoming(db, "u", 1);
  assert.deepEqual(writes, ["users/u/upcoming/tv_1_S01E02"]);
});
