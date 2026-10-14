import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChange, deriveHistoryCard, mergeEntries } from "../src/utils";
import { HistoryPill, HistoryProgress, MediaType, WatchStatus } from "../src/enums";
import type { CatalogShow, HistoryEntry, HistoryState } from "../src/types";

const entry = (o: Partial<HistoryEntry> = {}): HistoryEntry => ({
	id: "tv_1",
	tmdbId: 1,
	mediaType: MediaType.TV,
	status: WatchStatus.WATCHING,
	nextEpisode: { season: 1, episode: 3 },
	rewatchCount: 0,
	historyAt: 100,
	historyUpdatedAt: 100,
	minutesWatched: 90,
	plays: 2,
	...o,
});
const state = (items: HistoryEntry[]): HistoryState => ({
	userId: "u",
	items,
	hasMore: false,
	checkedAt: 0,
});
const ep = (n: number, airDate: string | null) => ({
	episodeNumber: n,
	title: `E${n}`,
	overview: "",
	airDate,
	runtime: 30,
	stillPath: null,
});
const catalog = (o: Partial<CatalogShow> = {}): CatalogShow =>
	({
		tmdbId: 1,
		mediaType: MediaType.TV,
		title: "Show",
		posterPath: null,
		backdropPath: "/b.jpg",
		logoPath: "/logo.png",
		status: "Returning Series",
		releaseDate: null,
		seasons: [
			{ seasonNumber: 1, episodeCount: 4, airDate: null, episodes: [ep(1, "2020-01-01"), ep(2, "2020-01-08"), ep(3, "2020-01-15"), ep(4, "2999-01-01")] },
		],
		...o,
	}) as CatalogShow;

test("mergeEntries: upserts, newest watch first, drops unwatched, advances cursor", () => {
	const s = mergeEntries(state([entry({ id: "tv_1", historyAt: 100 }), entry({ id: "tv_2", tmdbId: 2, historyAt: 50 })]), [
		entry({ id: "tv_2", tmdbId: 2, historyAt: 300, historyUpdatedAt: 300 }),
		entry({ id: "tv_1", plays: 0, historyUpdatedAt: 200 }),
		entry({ id: "tv_3", tmdbId: 3, historyAt: 200, historyUpdatedAt: 250 }),
	]);
	assert.deepEqual(s.items.map((e) => e.id), ["tv_2", "tv_3"]);
	assert.equal(s.checkedAt, 300);
});

test("applyChange: watch moves to top with totals; unknown title → missing", () => {
	const s = state([entry({ id: "tv_2", tmdbId: 2, historyAt: 500 }), entry()]);
	const { state: next, missing } = applyChange(
		s,
		{ userId: "u", tmdbId: 1, mediaType: MediaType.TV, watched: true, minutesDelta: 30, playsDelta: 1, nextEpisode: { season: 1, episode: 4 } },
		1000,
	);
	assert.equal(missing, false);
	assert.equal(next.items[0].id, "tv_1");
	assert.equal(next.items[0].minutesWatched, 120);
	assert.deepEqual(next.items[0].nextEpisode, { season: 1, episode: 4 });

	assert.equal(applyChange(s, { userId: "u", tmdbId: 9, mediaType: MediaType.TV, watched: true }).missing, true);
	assert.equal(applyChange(s, { userId: "u", tmdbId: 1, mediaType: MediaType.TV, cleared: true }).state.items.length, 1);
	// Unwatching the last play removes the card
	assert.equal(applyChange(s, { userId: "u", tmdbId: 1, mediaType: MediaType.TV, playsDelta: -2 }).state.items.length, 1);
});

test("deriveHistoryCard: watching shows % of aired eps; caught up on airing show → up to date", () => {
	const today = "2026-10-14";
	const watching = deriveHistoryCard(entry(), catalog(), today);
	assert.equal(watching.pill, HistoryPill.WATCHING);
	assert.deepEqual(watching.progress, { kind: HistoryProgress.PERCENT, percent: 67 });
	assert.equal(watching.watchCount, null);
	assert.equal(watching.tag, "Ongoing");
	assert.equal(watching.logoPath, "/logo.png");
	assert.equal(watching.timeSpent, "1h 30m");

	const caughtUp = deriveHistoryCard(entry({ nextEpisode: { season: 1, episode: 4 } }), catalog(), today);
	assert.deepEqual(caughtUp.progress, { kind: HistoryProgress.UP_TO_DATE });
	// Ended show caught up → finished (Completed, no ring), not "up to date"
	const ended = deriveHistoryCard(entry({ nextEpisode: null }), catalog({ status: "Ended" }), today);
	assert.equal(ended.pill, HistoryPill.COMPLETED);
	assert.equal(ended.tag, "Ended");
});

test("deriveHistoryCard: completed but still airing → Currently Watching + up to date", () => {
	const today = "2026-10-14";
	const airing = deriveHistoryCard(entry({ status: WatchStatus.COMPLETED, nextEpisode: null }), catalog(), today);
	assert.equal(airing.pill, HistoryPill.WATCHING);
	assert.deepEqual(airing.progress, { kind: HistoryProgress.UP_TO_DATE });
	assert.equal(airing.watchCount, null);
	assert.equal(airing.tag, "Ongoing");
	// Ended show stays Completed
	const ended = deriveHistoryCard(entry({ status: WatchStatus.COMPLETED }), catalog({ status: "Ended" }), today);
	assert.equal(ended.pill, HistoryPill.COMPLETED);
	assert.equal(ended.progress, null);
});

test("deriveHistoryCard: still 'watching' an ended show with nothing left → Completed", () => {
	const today = "2026-10-14";
	const card = deriveHistoryCard(entry({ nextEpisode: null }), catalog({ status: "Canceled" }), today);
	assert.equal(card.pill, HistoryPill.COMPLETED);
	assert.equal(card.progress, null);
	assert.equal(card.watchCount, 1);
	// Not finished yet → stays watching with progress
	const midway = deriveHistoryCard(entry(), catalog({ status: "Ended" }), today);
	assert.equal(midway.pill, HistoryPill.WATCHING);
	assert.deepEqual(midway.progress, { kind: HistoryProgress.PERCENT, percent: 67 });
});

test("deriveHistoryCard: paused, rewatching, completed, movie", () => {
	const today = "2026-10-14";
	assert.deepEqual(
		deriveHistoryCard(entry({ status: WatchStatus.PAUSED_REWATCH }), catalog(), today).progress,
		{ kind: HistoryProgress.PAUSED },
	);
	const rewatch = deriveHistoryCard(entry({ status: WatchStatus.REWATCHING, rewatchCount: 2 }), catalog(), today);
	assert.equal(rewatch.pill, HistoryPill.REWATCHING);
	assert.equal(rewatch.watchCount, 2);
	const done = deriveHistoryCard(entry({ status: WatchStatus.COMPLETED, rewatchCount: 1 }), catalog({ status: "Ended" }), today);
	assert.equal(done.progress, null);
	assert.equal(done.watchCount, 2);
	const movie = deriveHistoryCard(
		entry({ id: "movie_5", mediaType: MediaType.MOVIE, status: WatchStatus.COMPLETED, plays: 3, nextEpisode: null }),
		catalog({ mediaType: MediaType.MOVIE, releaseDate: "2014-11-07", logoPath: null }),
		today,
	);
	assert.equal(movie.pill, null);
	assert.equal(movie.watchCount, 3);
	assert.equal(movie.tag, "2014");
	assert.equal(movie.logoPath, null);
});
