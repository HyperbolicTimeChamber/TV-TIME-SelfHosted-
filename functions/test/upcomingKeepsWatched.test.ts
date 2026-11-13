import { test } from "node:test";
import assert from "node:assert/strict";

test("addShowToUpcoming keeps watched episodes (marking leaves Upcoming alone)", async () => {
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
    // E1 (airs today) already watched → pointer on E2, still listed
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
  assert.deepEqual(writes, [
    "users/u/upcoming/tv_1_S01E01",
    "users/u/upcoming/tv_1_S01E02",
  ]);
});

test("upcomingFromDate keeps yesterday's UTC date (late US evening airs)", async () => {
  const { upcomingFromDate } = await import(
    "../src/hooks/upcoming/upcomingFromDate"
  );
  // Sunday 03:00 UTC: Saturday's 23:30 ET episode must still be kept
  assert.equal(upcomingFromDate(new Date("2026-11-08T03:00:00Z")), "2026-11-07");
  assert.equal(upcomingFromDate(new Date("2026-03-01T00:00:00Z")), "2026-02-28");
});
