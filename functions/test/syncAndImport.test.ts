import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCatalogChanged } from "../src/hooks/syncCatalog/hasCatalogChanged";
import { buildImportOps } from "../src/hooks/importMatches/buildImportOps";
import { CatalogShow } from "../src/shared/types";
import { MediaType, WatchStatus } from "../src/shared/enums";
import { fakeDb } from "./helpers";

const fresh = {
  title: "A",
  posterPath: "/p",
  backdropPath: null,
  overview: "o",
  status: "x",
  totalEpisodes: 1,
  seasons: [
    {
      seasonNumber: 1,
      episodeCount: 1,
      airDate: null,
      episodes: [
        {
          episodeNumber: 1,
          title: "T",
          overview: "",
          airDate: null,
          runtime: null,
          stillPath: null,
        },
      ],
    },
  ],
} as unknown as CatalogShow;

test("hasCatalogChanged ignores Firestore key order", () => {
  const reordered = JSON.parse(JSON.stringify(fresh));
  reordered.seasons[0] = {
    episodes: [
      {
        stillPath: null,
        runtime: null,
        airDate: null,
        overview: "",
        title: "T",
        episodeNumber: 1,
      },
    ],
    airDate: null,
    episodeCount: 1,
    seasonNumber: 1,
  };
  assert.equal(hasCatalogChanged(reordered, fresh), false);
});

test("hasCatalogChanged catches poster and episode-title changes", () => {
  assert.equal(hasCatalogChanged({ ...fresh, posterPath: null }, fresh), true);
  const renamed = JSON.parse(JSON.stringify(fresh));
  renamed.seasons[0].episodes[0].title = "Episode 1";
  assert.equal(hasCatalogChanged(renamed, fresh), true);
});

test("import stores next episode name and air date", async () => {
  const db = fakeDb();
  const ep = (n: number, title: string, airDate: string) => ({
    episodeNumber: n,
    title,
    airDate,
    overview: "",
    runtime: 30,
    stillPath: null,
  });
  const cat = {
    tmdbId: 1,
    seasons: [
      {
        seasonNumber: 1,
        episodeCount: 3,
        airDate: null,
        episodes: [
          ep(1, "A", "2025-01-01"),
          ep(2, "B", "2025-01-08"),
          ep(3, "C", "2026-11-01"),
        ],
      },
    ],
  } as unknown as CatalogShow;
  const { writes, history } = buildImportOps(
    db,
    "u",
    [
      {
        tmdbId: 1,
        mediaType: MediaType.TV,
        status: WatchStatus.WATCHING,
        watchedEpisodes: [
          { season: 1, episode: 1, watchedAt: "2025-01-02" },
          { season: 1, episode: 2, watchedAt: "2025-01-09" },
        ],
      },
    ],
    new Map([[1, cat]]),
    new Set(),
  );
  const t = writes.find((w) => w.ref.path === "users/u/tracking/tv_1")!.data;
  assert.deepEqual(t.nextEpisode, { season: 1, episode: 3 });
  assert.equal(t.nextEpisodeName, "C");
  assert.equal(t.nextEpisodeAirDate, "2026-11-01");
  // Watched episodes are create-only history, never part of the overwriting tracking writes
  assert.deepEqual(
    history.map((w) => w.ref.path),
    ["users/u/watchedEpisodes/1_S01E01", "users/u/watchedEpisodes/1_S01E02"],
  );
  assert.equal(writes.length, 1);
});
