import { test } from "node:test";
import assert from "node:assert/strict";
import {
	isFinaleEpisode,
	lastCatalogEpisode,
	needsServerRefresh,
	freshSeasonAddsEpisodes,
	isNewerServerCatalog,
	patchCatalogSeason,
} from "../src/utils";
import { EpisodeType, MediaType, REFRESH_COOLDOWN_MS, RefreshReason, ShowStatus } from "../src/enums";
import type { CatalogEpisode, CatalogShow } from "../src/types";

const ep = (n: number, airDate: string | null, episodeType?: EpisodeType): CatalogEpisode => ({
	episodeNumber: n,
	title: `Title ${n}`,
	overview: "",
	airDate,
	runtime: 45,
	stillPath: null,
	...(episodeType ? { episodeType } : {}),
});

const show = (seasons: Array<[number, CatalogEpisode[]]>, extra: Partial<CatalogShow> = {}): CatalogShow => ({
	tmdbId: 1,
	mediaType: MediaType.TV,
	title: "Show",
	posterPath: "/p.jpg",
	backdropPath: null,
	overview: "",
	status: "Returning Series",
	totalSeasons: seasons.length,
	totalEpisodes: seasons.reduce((n, [, eps]) => n + eps.length, 0),
	runtime: 45,
	voteAverage: 8,
	firstAirDate: "2024-01-01",
	releaseDate: null,
	seasons: seasons.map(([seasonNumber, episodes]) => ({
		seasonNumber,
		episodeCount: episodes.length,
		airDate: null,
		episodes,
	})),
	trackedBy: [],
	trackedByCount: 0,
	lastSyncedAt: null,
	...extra,
});

const TODAY = "2026-10-25";
const NOW = Date.parse("2026-10-25T12:00:00Z");

test("isFinaleEpisode: only TMDB's explicit finale marker counts", () => {
	assert.equal(isFinaleEpisode(ep(10, TODAY, EpisodeType.FINALE)), true);
	assert.equal(isFinaleEpisode(ep(5, TODAY, EpisodeType.MID_SEASON)), false);
	assert.equal(isFinaleEpisode(ep(10, TODAY, EpisodeType.STANDARD)), false);
	// Docs written before episodeType existed (legacy "last listed" flag ignored)
	const legacy: CatalogEpisode = { ...ep(10, TODAY), isSeasonFinale: true };
	assert.equal(isFinaleEpisode(legacy), false);
	assert.equal(isFinaleEpisode(undefined), false);
});

test("lastCatalogEpisode: highest season then episode, specials skipped", () => {
	const c = show([
		[0, [ep(9, "2026-12-01")]],
		[2, [ep(1, "2026-10-01"), ep(3, "2026-10-15"), ep(2, "2026-10-08")]],
		[1, [ep(8, "2025-01-01")]],
	]);
	assert.equal(lastCatalogEpisode(c)?.episodeNumber, 3);
	assert.equal(lastCatalogEpisode(show([])), null);
});

test("needsServerRefresh: last listed episode aired without a finale marker", () => {
	const airedToday = show([[1, [ep(1, "2026-10-18"), ep(2, TODAY)]]]);
	assert.equal(needsServerRefresh(airedToday, TODAY, NOW), true);
	// Aired last week, still no newer episode listed
	assert.equal(needsServerRefresh(show([[1, [ep(1, "2026-10-18")]]]), TODAY, NOW), true);
});

test("needsServerRefresh: finale, future / undated episodes and old airings don't qualify", () => {
	assert.equal(
		needsServerRefresh(show([[1, [ep(1, "2026-10-18"), ep(2, TODAY, EpisodeType.FINALE)]]]), TODAY, NOW),
		false,
	);
	assert.equal(needsServerRefresh(show([[1, [ep(1, TODAY), ep(2, "2026-11-01")]]]), TODAY, NOW), false);
	assert.equal(needsServerRefresh(show([[1, [ep(1, TODAY), ep(2, null)]]]), TODAY, NOW), false);
	// Beyond the window the weekly sync has had its chance
	assert.equal(needsServerRefresh(show([[1, [ep(1, "2026-09-01")]]]), TODAY, NOW), false);
	assert.equal(needsServerRefresh(show([]), TODAY, NOW), false);
});

test("needsServerRefresh: ended, movie, stand-in, missing and recently checked docs skip", () => {
	const eps: Array<[number, CatalogEpisode[]]> = [[1, [ep(1, TODAY)]]];
	assert.equal(needsServerRefresh(show(eps, { status: ShowStatus.ENDED }), TODAY, NOW), false);
	assert.equal(needsServerRefresh(show(eps, { mediaType: MediaType.MOVIE }), TODAY, NOW), false);
	assert.equal(needsServerRefresh(show(eps, { partial: true }), TODAY, NOW), false);
	assert.equal(needsServerRefresh(null, TODAY, NOW), false);
	const cooldown = REFRESH_COOLDOWN_MS[RefreshReason.AIRED_NO_FINALE];
	assert.equal(needsServerRefresh(show(eps, { lastTmdbCheckAt: NOW - 1000 }), TODAY, NOW), false);
	assert.equal(needsServerRefresh(show(eps, { lastTmdbCheckAt: NOW - cooldown }), TODAY, NOW), true);
});

test("freshSeasonAddsEpisodes: TMDB lists episodes the catalog lacks", () => {
	const c = show([[1, [ep(1, TODAY), ep(2, null)]]]);
	assert.equal(freshSeasonAddsEpisodes(c, 1, [{ episode_number: 1 }, { episode_number: 2 }]), false);
	assert.equal(freshSeasonAddsEpisodes(c, 1, [{ episode_number: 1 }, { episode_number: 3 }]), true);
	assert.equal(freshSeasonAddsEpisodes(c, 2, [{ episode_number: 1 }]), true);
	assert.equal(freshSeasonAddsEpisodes(c, 2, []), false);
});

test("isNewerServerCatalog: only a doc refreshed after the cached copy replaces it", () => {
	const cached = show([[1, [ep(1, TODAY)]]], { lastTmdbCheckAt: 100 });
	assert.equal(isNewerServerCatalog({ lastTmdbCheckAt: 200 }, cached), true);
	assert.equal(isNewerServerCatalog({ lastTmdbCheckAt: 100 }, cached), false);
	assert.equal(isNewerServerCatalog({}, show([[1, [ep(1, TODAY)]]])), false);
	assert.equal(isNewerServerCatalog({ lastTmdbCheckAt: 1 }, show([[1, [ep(1, TODAY)]]])), true);
	assert.equal(isNewerServerCatalog({}, null), true);
	assert.equal(isNewerServerCatalog({}, show([], { partial: true })), true);
});

test("patchCatalogSeason: fills episodeType from a fresh TMDB season", () => {
	const c = show([[1, [ep(1, "2026-10-18"), ep(2, TODAY)]]]);
	const patched = patchCatalogSeason(c, 1, [
		{ episode_number: 1, name: "Title 1", episode_type: EpisodeType.STANDARD },
		{ episode_number: 2, name: "Title 2", episode_type: EpisodeType.FINALE },
	]);
	const eps = patched?.seasons[0].episodes;
	assert.equal(eps?.[0].episodeType, EpisodeType.STANDARD);
	assert.equal(eps?.[1].episodeType, EpisodeType.FINALE);
	assert.equal(eps?.[1].isSeasonFinale, true);
	// Same types again → nothing to patch
	assert.equal(patchCatalogSeason(patched!, 1, [{ episode_number: 2, episode_type: EpisodeType.FINALE }]), null);
});
