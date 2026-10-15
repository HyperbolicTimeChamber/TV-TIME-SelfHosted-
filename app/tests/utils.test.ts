import { test } from "node:test";
import assert from "node:assert/strict";
import {
	isGenericEpisodeTitle,
	pickEpisodeTitle,
	isIncompleteCatalog,
	hasMissingDisplayData,
	needsTmdbHeal,
	selectStaleCatalogItems,
	trimPastQueue,
	placeholderTargets,
	titlesFromCatalog,
	applyTitles,
	todayStr,
} from "../src/utils";
import { isShowVisible } from "../src/hooks/useVisibleTracking";
import { MediaType, WatchStatus } from "../src/enums";
import type { CatalogShow, UpcomingEpisode } from "../src/types";

// ---------- episode titles ----------
test("placeholder episode names are detected", () => {
	for (const t of ["Episode 1", "episode 12", " Episode 3 ", "", null, undefined]) {
		assert.equal(isGenericEpisodeTitle(t), true, String(t));
	}
	for (const t of ["Pilot", "Episode One", "The Episode 1 Story", "1st Quarter"]) {
		assert.equal(isGenericEpisodeTitle(t), false, t);
	}
});

test("pickEpisodeTitle prefers a real title", () => {
	assert.equal(pickEpisodeTitle("Episode 1", "Pilot"), "Pilot");
	assert.equal(pickEpisodeTitle("Pilot", "Episode 1"), "Pilot");
	assert.equal(pickEpisodeTitle("Episode 1", null), "Episode 1");
	assert.equal(pickEpisodeTitle(null, undefined), null);
});

// ---------- cache → Firestore → TMDB ----------
const cat = (o: Partial<CatalogShow> = {}) =>
	({
		title: "Show",
		posterPath: "/p.jpg",
		status: "Returning Series",
		seasons: [
			{
				seasonNumber: 1,
				episodes: [
					{ episodeNumber: 1, title: "Pilot" },
					{ episodeNumber: 2, title: "Episode 2" },
				],
			},
		],
		...o,
	}) as unknown as CatalogShow;
const item = (o: Record<string, unknown> = {}) => ({
	id: "tv_1",
	mediaType: MediaType.TV,
	nextEpisode: { season: 1, episode: 1 },
	nextEpisodeName: "Pilot",
	catalogShow: cat() as CatalogShow | null,
	...o,
});

test("complete cached catalog → no Firestore read, no TMDB call", () => {
	const i = item();
	assert.equal(hasMissingDisplayData(i, i.catalogShow!), false);
	assert.equal(needsTmdbHeal(i, false), false);
	assert.equal(needsTmdbHeal(i, true), false);
});

test("missing poster → Firestore first; TMDB only after Firestore was tried", () => {
	const i = item({ catalogShow: cat({ posterPath: null }) });
	assert.equal(hasMissingDisplayData(i, i.catalogShow!), true);
	assert.equal(needsTmdbHeal(i, false), false);
	assert.equal(needsTmdbHeal(i, true), true);
});

test("placeholder next-episode name triggers refresh", () => {
	const i = item({ nextEpisode: { season: 1, episode: 2 }, nextEpisodeName: "Episode 2" });
	assert.equal(hasMissingDisplayData(i, i.catalogShow!), true);
});

test("movie credits: missing → refresh, present → none", () => {
	const m = item({ mediaType: MediaType.MOVIE });
	assert.equal(hasMissingDisplayData(m, m.catalogShow!), true);
	const m2 = item({
		mediaType: MediaType.MOVIE,
		catalogShow: cat({ credits: { directors: [], writers: [], producers: [] } }),
	});
	assert.equal(hasMissingDisplayData(m2, m2.catalogShow!), false);
});

test("no catalog / search stand-in → TMDB only after Firestore was tried", () => {
	assert.equal(needsTmdbHeal(item({ catalogShow: null }), false), false);
	assert.equal(needsTmdbHeal(item({ catalogShow: null }), true), true);
	assert.equal(isIncompleteCatalog(cat({ partial: true })), true);
	assert.equal(isIncompleteCatalog(cat({ title: "" })), true);
});

test("after a server sync only changed shows are re-read", () => {
	const items = [
		item({ id: "tv_1" }),
		item({ id: "tv_2" }),
		item({ id: "tv_3", catalogShow: cat({ status: "Ended" }) }),
		item({ id: "movie_9", mediaType: MediaType.MOVIE }),
	];
	const ids = (r: typeof items) => r.map((i) => i.id);
	assert.deepEqual(ids(selectStaleCatalogItems(items, "S1", "S1", ["tv_2"])), ["tv_2"]);
	assert.deepEqual(ids(selectStaleCatalogItems(items, "S1", "S1", [])), []);
	assert.deepEqual(ids(selectStaleCatalogItems(items, "S0", "S1", ["tv_2"])), ["tv_1", "tv_2"]);
	assert.deepEqual(ids(selectStaleCatalogItems(items, null, "S1", ["tv_2"])), ["tv_1", "tv_2"]);
	assert.deepEqual(ids(selectStaleCatalogItems(items, "S1", "S1", null)), ["tv_1", "tv_2"]);
});

// ---------- upcoming past-days queue ----------
const ep = (date: string, id = 1, e = 1): UpcomingEpisode => ({
	tmdbShowId: id,
	showTitle: "S",
	posterPath: null,
	season: 1,
	episode: e,
	episodeTitle: `Episode ${e}`,
	airDate: date,
	runtime: null,
});
const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

test("past queue keeps only aired episodes, sorted and deduped", () => {
	const r = trimPastQueue(
		[ep(day(9)), ep(day(5), 2), ep(day(3), 3), ep(day(5), 2), ep(day(12), 4)],
		day(9),
	);
	assert.deepEqual(
		r.map((e) => e.airDate),
		[day(3), day(5)],
	);
});

test("past queue: the 21st day pushes out the oldest", () => {
	let q: UpcomingEpisode[] = [];
	for (let d = 1; d <= 20; d++) q = trimPastQueue([...q, ep(day(d), d)], day(d + 1));
	assert.equal(new Set(q.map((e) => e.airDate)).size, 20);
	q = trimPastQueue([...q, ep(day(21), 21)], day(22));
	const dates = [...new Set(q.map((e) => e.airDate))];
	assert.equal(dates.length, 20);
	assert.equal(dates[0], day(2));
	assert.equal(dates[dates.length - 1], day(21));
});

test("past queue: several episodes on one day count as one day", () => {
	assert.equal(trimPastQueue([ep(day(1), 1), ep(day(1), 2), ep(day(1), 3)], day(2)).length, 3);
});

test("placeholder titles: targets, cache lookup, patch", () => {
	const eps: UpcomingEpisode[] = [
		ep(day(10), 5, 1),
		ep(day(11), 5, 2),
		{ ...ep(day(10), 6, 1), episodeTitle: "Real" },
		{ ...ep(day(10), 7, 1), mediaType: MediaType.MOVIE },
	];
	assert.deepEqual([...placeholderTargets(eps, new Set()).keys()], ["5_1"]);
	assert.equal(placeholderTargets(eps, new Set(["5_1"])).size, 0);
	const titles = titlesFromCatalog(cat(), 5, 1);
	assert.deepEqual([...titles], [["5_1_1", "Pilot"]]);
	const patched = applyTitles(eps, titles);
	assert.equal(patched[0].episodeTitle, "Pilot");
	assert.equal(patched[1].episodeTitle, "Episode 2");
	assert.equal(applyTitles(patched, titles), patched, "unchanged → same reference");
	assert.equal(
		applyTitles([eps[2]], new Map([["6_1_1", "Other"]]))[0].episodeTitle,
		"Real",
		"never overwrites a real title",
	);
});

// ---------- watchlist visibility ----------
test("unreleased show without catalog or air date stays off the watchlist", () => {
	const base = {
		status: WatchStatus.WATCHING,
		mediaType: MediaType.TV,
		nextEpisode: { season: 1, episode: 1 },
		nextEpisodeAirDate: null as string | null,
		catalogShow: null as CatalogShow | null,
	} as any;
	assert.equal(isShowVisible(base), false);
	assert.equal(isShowVisible({ ...base, nextEpisodeAirDate: "2020-01-01" }), true);
	assert.equal(isShowVisible({ ...base, nextEpisodeAirDate: "2999-01-01" }), false);
	const withEp = (airDate: string | null) =>
		({ seasons: [{ seasonNumber: 1, episodes: [{ episodeNumber: 1, airDate }] }] }) as any;
	assert.equal(isShowVisible({ ...base, catalogShow: withEp(todayStr()) }), true);
	assert.equal(isShowVisible({ ...base, catalogShow: withEp(null) }), false);
	assert.equal(
		isShowVisible({ ...base, status: WatchStatus.COMPLETED, nextEpisodeAirDate: "2020-01-01" }),
		false,
	);
});

test("share URLs point at the web show page", async () => {
	const { showShareUrl } = await import("../src/utils");
	assert.equal(showShareUrl(MediaType.TV, 1399), "https://watchloom-app.web.app/show/tv/1399");
	assert.equal(showShareUrl(MediaType.MOVIE, 550), "https://watchloom-app.web.app/show/movie/550");
});

test("profile formatters", async () => {
	const { formatCount, formatTime, scaledPhotoURL } = await import("../src/utils");
	assert.equal(formatCount(999), "999");
	assert.equal(formatCount(1200), "1.2K");
	assert.equal(formatCount(2000), "2K");
	assert.equal(formatCount(2_500_000), "2.5M");
	assert.equal(formatTime(40), "40m");
	assert.equal(formatTime(312), "5h 12m");
	assert.equal(formatTime(3 * 1440 + 240), "3d 4h");
	assert.equal(formatTime(380 * 1440), "1y 15d");
	assert.equal(scaledPhotoURL("https://x/photo=s96-c", 100, 2), "https://x/photo=s200-c");
});

test("load errors map to not found / offline / server copy", async () => {
	const { describeLoadError } = await import("../src/utils");
	const { LoadErrorKind } = await import("../src/enums");
	const nf = describeLoadError({ response: { status: 404 } }, MediaType.MOVIE);
	assert.equal(nf.kind, LoadErrorKind.NOT_FOUND);
	assert.equal(nf.title, "You might be lost");
	assert.equal(nf.canRetry, false);
	assert.equal(nf.code, "404");
	assert.equal(describeLoadError(null, MediaType.TV).kind, LoadErrorKind.NOT_FOUND, "no data = not found");
	const off = describeLoadError({ code: "ERR_NETWORK", message: "Network Error" }, MediaType.TV);
	assert.deepEqual([off.kind, off.canRetry, off.code], [LoadErrorKind.OFFLINE, true, "NETWORK"]);
	const srv = describeLoadError({ response: { status: 500 } }, MediaType.TV);
	assert.deepEqual([srv.kind, srv.canRetry, srv.code], [LoadErrorKind.SERVER, true, "500"]);
	assert.match(srv.message, /this show/);
});

test("ordinal + markWatchedLabel: rewatch runs get an ordinal label", async () => {
	const { ordinal, markWatchedLabel } = await import("../src/utils/format");
	assert.deepEqual(
		[1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal),
		["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"],
	);
	assert.equal(markWatchedLabel(0), "Mark as Watched");
	assert.equal(markWatchedLabel(2), "Mark 2nd Rewatch");
});

test("groupCalendarDay: one card per show, episodes sorted; movies stay single", async () => {
	const { groupCalendarDay, episodeCountLabel } = await import("../src/utils/calendarGroups");
	const { MediaType } = await import("../src/enums");
	const ep = (id: number, season: number, episode: number, mediaType = MediaType.TV) => ({
		tmdbShowId: id,
		mediaType,
		season,
		episode,
	});
	const groups = groupCalendarDay([ep(1, 1, 3), ep(2, 0, 0, MediaType.MOVIE), ep(1, 1, 1), ep(3, 2, 5), ep(1, 1, 2)]);
	assert.deepEqual(
		groups.map((g) => [g.key, g.episodes.map((e) => e.episode)]),
		[
			["tv_1", [1, 2, 3]],
			["movie_2", [0]],
			["tv_3", [5]],
		],
	);
	assert.equal(groups[0].first.episode, 1);
	assert.equal(episodeCountLabel(groups[0].episodes), "3 Episodes");
	const { seasonRangeLabel } = await import("../src/utils/calendarGroups");
	assert.equal(seasonRangeLabel(groups[0].episodes), "Season 01");
	assert.equal(seasonRangeLabel([ep(1, 1, 10), ep(1, 2, 2)]), "Season 01–02");
});
