import { test } from "node:test";
import assert from "node:assert/strict";
import {
	COMPLETED_CACHE_VERSION,
	COMPLETED_MOVIE_LIMIT,
	COMPLETED_TV_POOL,
	completedTypesToRefill,
	dropCompleted,
	mergeCompleted,
	trimCompleted,
	upsertCompleted,
	type CompletedCache,
	type CompletedItem,
} from "../src/utils";
import { MediaType, WatchStatus } from "../src/enums";
import type { HistoryEntry } from "../src/types";

const item = (
	tmdbId: number,
	mediaType = MediaType.MOVIE,
	completedAt = tmdbId,
): CompletedItem => ({
	tmdbId,
	mediaType,
	title: `T${tmdbId}`,
	posterPath: null,
	genres: [],
	completedAt,
});
const row = (o: Partial<HistoryEntry> = {}): HistoryEntry => ({
	id: `${o.mediaType ?? MediaType.MOVIE}_${o.tmdbId ?? 1}`,
	tmdbId: 1,
	mediaType: MediaType.MOVIE,
	status: WatchStatus.COMPLETED,
	nextEpisode: null,
	rewatchCount: 0,
	historyAt: 500,
	historyUpdatedAt: 900,
	minutesWatched: 100,
	plays: 1,
	lastEpisode: null,
	...o,
});
const cache = (items: CompletedItem[], exhausted: MediaType[] = []): CompletedCache => ({
	version: COMPLETED_CACHE_VERSION,
	userId: "u",
	items,
	checkedAt: 100,
	exhausted,
});
const toItem = (r: HistoryEntry, prev?: CompletedItem): CompletedItem => ({
	...(prev ?? item(r.tmdbId, r.mediaType)),
	completedAt: r.historyAt,
});

test("trimCompleted keeps newest per type and clears exhausted when cut", () => {
	const movies = Array.from({ length: COMPLETED_MOVIE_LIMIT + 2 }, (_, i) => item(i + 1));
	const tv = [item(1, MediaType.TV, 5)];
	const out = trimCompleted([...movies, ...tv], [MediaType.MOVIE, MediaType.TV]);
	const kept = out.items.filter((i) => i.mediaType === MediaType.MOVIE);
	assert.equal(kept.length, COMPLETED_MOVIE_LIMIT);
	assert.equal(kept[0].tmdbId, COMPLETED_MOVIE_LIMIT + 2);
	assert.deepEqual(out.exhausted, [MediaType.TV]);
});

test("mergeCompleted upserts completed rows, drops others, advances cursor", () => {
	const base = cache([item(1), item(2), item(3, MediaType.TV)]);
	const out = mergeCompleted(
		base,
		[
			row({ tmdbId: 1, historyAt: 1000, historyUpdatedAt: 1200 }),
			row({ tmdbId: 2, status: WatchStatus.REWATCHING }),
			row({ tmdbId: 3, mediaType: MediaType.TV, plays: 0 }),
			row({ tmdbId: 9, status: WatchStatus.WATCHING, historyUpdatedAt: 1500 }),
			row({ tmdbId: 4, historyAt: 50 }),
		],
		toItem,
	);
	assert.deepEqual(
		out.items.map((i) => [i.mediaType, i.tmdbId, i.completedAt]),
		[
			[MediaType.MOVIE, 1, 1000],
			[MediaType.MOVIE, 4, 50],
		],
	);
	assert.equal(out.checkedAt, 1500);
});

test("mergeCompleted keeps TV and movies sharing a TMDB id apart", () => {
	const out = mergeCompleted(
		cache([item(7), item(7, MediaType.TV)]),
		[row({ tmdbId: 7, status: WatchStatus.WATCHING })],
		toItem,
	);
	assert.deepEqual(
		out.items.map((i) => i.mediaType),
		[MediaType.TV],
	);
});

test("completedTypesToRefill: short and not exhausted only", () => {
	assert.deepEqual(completedTypesToRefill(cache([item(1)], [MediaType.TV])), [MediaType.MOVIE]);
	const fullTv = Array.from({ length: COMPLETED_TV_POOL }, (_, i) => item(i + 1, MediaType.TV));
	const fullMovies = Array.from({ length: COMPLETED_MOVIE_LIMIT }, (_, i) => item(i + 1));
	assert.deepEqual(completedTypesToRefill(cache([...fullTv, ...fullMovies])), []);
});

test("dropCompleted / upsertCompleted", () => {
	const base = cache([item(1), item(2)]);
	assert.equal(dropCompleted(base, 5, MediaType.MOVIE), base);
	assert.deepEqual(
		dropCompleted(base, 1, MediaType.MOVIE).items.map((i) => i.tmdbId),
		[2],
	);
	const up = upsertCompleted(base, item(1, MediaType.MOVIE, 99));
	assert.deepEqual(
		up.items.map((i) => [i.tmdbId, i.completedAt]),
		[
			[1, 99],
			[2, 2],
		],
	);
});
