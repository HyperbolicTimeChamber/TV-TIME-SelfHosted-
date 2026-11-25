import { test } from "node:test";
import assert from "node:assert/strict";

process.env.TZ = "Asia/Kolkata";

import {
	buildAiringPlan,
	DEFAULT_NOTIFY_PREFS,
	mergeOverrides,
	parseNotifyPrefs,
	pruneOverrides,
	toPlanTitle,
	topicDocIds,
	type PlanTitle,
	type PlanInput,
} from "../src/utils/airingPlan";
import { AIRING_CAP, AlertType, ALERT_ID, MediaType, WatchStatus } from "../src/enums";
/** The old five-switch names: `prefs()` migrates them (the saved format before the detailed settings) */
const NotificationKind = {
	PREMIERES: "premieres",
	NEW_EPISODES: "newEpisodes",
	MOVIE_REMINDERS: "movieReminders",
	WEEKLY_DIGEST: "weeklyDigest",
	QUIET_HOURS: "quietHours",
} as const;

/** local ms of "YYYY-MM-DD" at h:m */
const at = (date: string, h = 0, m = 0) => {
	const [y, mo, d] = date.split("-").map(Number);
	return new Date(y, mo - 1, d, h, m).getTime();
};
const stampOf = (date: string, h: number, m = 0) => new Date(at(date, h, m)).toISOString();

// Monday 2026-11-16, noon. Sundays inside 30 days: Nov 22, 29, Dec 6, 13
const NOW = at("2026-11-16", 12);

const ep = (episodeNumber: number, date: string, h: number | null, title = `Name ${episodeNumber}`) => ({
	episodeNumber,
	title,
	airDate: date,
	...(h === null ? {} : { airStamp: stampOf(date, h) }),
});

const show = (
	n: number,
	title: string,
	eps: ReturnType<typeof ep>[],
	season = 1,
	status = WatchStatus.WATCHING,
	// Caught up by default: the next episode to watch is the first one listed
	next: { season: number; episode: number } | null = { season, episode: eps[0]?.episodeNumber ?? 1 },
): PlanTitle => ({
	docId: `tv_${n}`,
	tmdbId: n,
	mediaType: MediaType.TV,
	title,
	status,
	nextEpisode: next,
	releaseDate: null,
	seasons: [{ seasonNumber: season, episodes: eps }],
});

const movie = (n: number, title: string, releaseDate: string | null, status = WatchStatus.PLAN_TO_WATCH): PlanTitle => ({
	docId: `movie_${n}`,
	tmdbId: n,
	mediaType: MediaType.MOVIE,
	title,
	status,
	nextEpisode: null,
	releaseDate,
	seasons: [],
});

const plan = (titles: PlanTitle[], over: Partial<PlanInput> = {}) =>
	buildAiringPlan({ now: NOW, titles, prefs: { ...DEFAULT_NOTIFY_PREFS }, overrides: [], lastOpenMs: 0, ...over });
const prefs = (p: Record<string, boolean>) => parseNotifyPrefs(JSON.stringify(p));
const noDigest = { [NotificationKind.WEEKLY_DIGEST]: false };

test("an episode alerts at its exact air time with a stable id", () => {
	const t = show(1, "Scrubs", [ep(3, "2026-11-17", 20, "My Lunch")]);
	const [a] = plan([t], { prefs: prefs(noDigest) });
	assert.equal(a.fireAt, at("2026-11-17", 20));
	assert.equal(a.id, `${ALERT_ID.AIR}tv_1-${at("2026-11-17", 20)}`);
	assert.equal(a.type, AlertType.EPISODE);
	assert.equal(a.title, "Scrubs");
	assert.equal(a.body, "S1 E3 · My Lunch");
	assert.deepEqual(plan([t], { prefs: prefs(noDigest) }), plan([t], { prefs: prefs(noDigest) }));
});

test("generic episode names are left out of the body", () => {
	const [a] = plan([show(1, "Scrubs", [ep(3, "2026-11-17", 20, "Episode 3")])], { prefs: prefs(noDigest) });
	assert.equal(a.body, "S1 E3");
});

test("all switches off plans nothing, not even the nudge", () => {
	const off = prefs({
		[NotificationKind.PREMIERES]: false,
		[NotificationKind.NEW_EPISODES]: false,
		[NotificationKind.MOVIE_REMINDERS]: false,
		[NotificationKind.WEEKLY_DIGEST]: false,
	});
	assert.deepEqual(plan([show(1, "A", [ep(2, "2026-11-17", 20)])], { prefs: off, lastOpenMs: NOW }), []);
});

test("quiet hours: 3 am waits for 9 am, 22:30 for tomorrow 9 am; off keeps the air time", () => {
	const early = show(1, "A", [ep(2, "2026-11-18", 3)]);
	assert.equal(plan([early], { prefs: prefs(noDigest) })[0].fireAt, at("2026-11-18", 9));
	const late = show(1, "A", [ep(2, "2026-11-18", 22, "x")]);
	const lateStamp = { ...late, seasons: [{ seasonNumber: 1, episodes: [{ ...ep(2, "2026-11-18", null), airStamp: stampOf("2026-11-18", 22, 30) }] }] };
	assert.equal(plan([lateStamp], { prefs: prefs(noDigest) })[0].fireAt, at("2026-11-19", 9));
	const off = prefs({ ...noDigest, [NotificationKind.QUIET_HOURS]: false });
	assert.equal(plan([early], { prefs: off })[0].fireAt, at("2026-11-18", 3));
	// 8:00 sharp is outside quiet hours
	const eight = show(1, "A", [ep(2, "2026-11-18", 8)]);
	assert.equal(plan([eight], { prefs: prefs(noDigest) })[0].fireAt, at("2026-11-18", 8));
});

test("several titles overnight become one grouped alert; one title keeps its own", () => {
	const a = show(1, "A", [ep(2, "2026-11-18", 1), ep(3, "2026-11-18", 2)]);
	const b = show(2, "B", [ep(5, "2026-11-18", 4)]);
	const out = plan([a, b], { prefs: prefs(noDigest) });
	assert.equal(out.length, 1);
	assert.equal(out[0].id, `${ALERT_ID.MORNING}2026-11-18`);
	assert.equal(out[0].type, AlertType.MORNING);
	assert.equal(out[0].title, "3 Episodes to Watch Today");
	assert.equal(out[0].body, "A, B");
	assert.deepEqual(out[0].lines, ["A · S1 E2 · Name 2", "A · S1 E3 · Name 3", "B · S1 E5 · Name 5"]);
	assert.equal(out[0].fireAt, at("2026-11-18", 9));
	const single = plan([a], { prefs: prefs(noDigest) });
	assert.equal(single.length, 1);
	assert.equal(single[0].body, "2 new episodes");
	assert.equal(single[0].title, "A");
	assert.deepEqual(single[0].lines, ["S1 E2 · Name 2", "S1 E3 · Name 3"]);
});

test("a batch drop of one title at one time is one alert", () => {
	const eps = Array.from({ length: 8 }, (_, i) => ep(i + 1, "2026-11-20", 18));
	const out = plan([show(1, "Scrubs", eps)], { prefs: prefs(noDigest) });
	assert.equal(out.length, 1);
	assert.equal(out[0].title, "Scrubs");
	assert.equal(out[0].body, "8 new episodes");
	assert.equal(out[0].type, AlertType.PREMIERE); // contains E1, premieres on
	// Expanded list caps at 6 rows, the rest fold into "+N more"
	assert.equal(out[0].lines?.length, 6);
	assert.equal(out[0].lines?.[0], "Season 1 premiere · Name 1");
	assert.equal(out[0].lines?.[5], "+3 more");
});

test("episode alerts: still + S01E04, premiere: backdrop + Season N Premiere, several add N episodes", () => {
	const withArt = (t: ReturnType<typeof show>) => ({
		...t,
		backdropPath: "/bd.jpg",
		logoPath: "/logo.png",
		seasons: t.seasons.map((s) => ({ ...s, episodes: s.episodes.map((e) => ({ ...e, stillPath: `/still${e.episodeNumber}.jpg` })) })),
	});
	const one = plan([withArt(show(1, "A", [ep(4, "2026-11-20", 18)]))], { prefs: prefs(noDigest) })[0];
	assert.deepEqual(one.image, {
		picturePath: "/still4.jpg",
		still: true,
		logoPath: "/logo.png",
		caption: ["S01E04 · Name 4"],
		heading: "Airing today",
	});
	const two = plan([withArt(show(1, "A", [ep(4, "2026-11-20", 18), ep(5, "2026-11-20", 18)]))], { prefs: prefs(noDigest) })[0];
	assert.deepEqual(two.image?.caption, ["S01E04 · Name 4", "1 more episode"]);
	assert.equal(two.lines?.length, 2); // fallback when the picture can't be downloaded
	const prem = plan([withArt(show(1, "A", [ep(1, "2026-11-20", 18), ep(2, "2026-11-20", 18)]))], { prefs: prefs(noDigest) })[0];
	assert.deepEqual(prem.image, {
		picturePath: "/bd.jpg",
		logoPath: "/logo.png",
		caption: ["Season 1 Premiere", "1 more episode"],
		heading: "Airing today",
	});
	// No art cached → no picture
	assert.equal(plan([show(1, "A", [ep(4, "2026-11-20", 18)])], { prefs: prefs(noDigest) })[0].image, undefined);
});

test("a movie release alert carries its backdrop and logo; the reminder doesn't", () => {
	const film = { ...movie(9, "Film", "2026-11-26"), backdropPath: "/bd.jpg", logoPath: "/logo.png" };
	const out = plan([film], { prefs: prefs(noDigest) });
	assert.deepEqual(out.find((a) => a.type === AlertType.MOVIE)?.image, { picturePath: "/bd.jpg", logoPath: "/logo.png" });
	assert.equal(out.find((a) => a.type === AlertType.MOVIE_REMINDER)?.image, undefined);
	assert.equal(plan([movie(9, "Film", "2026-11-26")], { prefs: prefs(noDigest) })[0].image, undefined);
});

test("premieres / new episodes switches decide E1 and the rest", () => {
	const t = show(1, "A", [ep(1, "2026-11-17", 20), ep(2, "2026-11-18", 20)], 2);
	const both = plan([t], { prefs: prefs(noDigest) });
	assert.deepEqual(both.map((a) => a.type), [AlertType.PREMIERE, AlertType.EPISODE]);
	assert.equal(both[0].body, "Season 2 premiere · Name 1");
	// premieres off + new episodes on: E1 is a plain new episode
	const noPrem = plan([t], { prefs: prefs({ ...noDigest, [NotificationKind.PREMIERES]: false }) });
	assert.deepEqual(noPrem.map((a) => a.type), [AlertType.EPISODE, AlertType.EPISODE]);
	assert.equal(noPrem[0].body, "S2 E1 · Name 1");
	// premieres on + new episodes off: only E1
	const onlyPrem = plan([t], { prefs: prefs({ ...noDigest, [NotificationKind.NEW_EPISODES]: false }) });
	assert.deepEqual(onlyPrem.map((a) => a.type), [AlertType.PREMIERE]);
});

test("paused and plan-to-watch titles and finished movies are skipped; rewatching counts", () => {
	const paused = show(1, "A", [ep(2, "2026-11-17", 20)], 1, WatchStatus.PAUSED);
	const pausedRewatch = show(2, "B", [ep(2, "2026-11-17", 20)], 1, WatchStatus.PAUSED_REWATCH);
	const planned = show(3, "C", [ep(2, "2026-11-17", 20)], 1, WatchStatus.PLAN_TO_WATCH);
	const rewatching = show(5, "E", [ep(2, "2026-11-17", 20)], 1, WatchStatus.REWATCHING);
	const done = movie(4, "M", "2026-11-26", WatchStatus.COMPLETED);
	const out = plan([paused, pausedRewatch, planned, rewatching, done], { prefs: prefs(noDigest) });
	assert.deepEqual(out.map((a) => a.docId), ["tv_5"]);
});

test("untimed episodes alert at 9 am local on their day", () => {
	const out = plan([show(1, "A", [ep(4, "2026-11-19", null)])], { prefs: prefs(noDigest) });
	assert.equal(out[0].fireAt, at("2026-11-19", 9));
});

test("window: only after now and within 30 days", () => {
	const out = plan(
		[show(1, "A", [ep(2, "2026-11-16", 11), ep(3, "2026-11-16", 13), ep(4, "2026-12-16", 11), ep(5, "2026-12-16", 13)], 1, WatchStatus.WATCHING, { season: 1, episode: 3 })],
		{ prefs: prefs(noDigest) },
	);
	assert.deepEqual(out.map((a) => a.fireAt), [at("2026-11-16", 13), at("2026-12-16", 11)]);
});

test("movies: release 9 am, reminder 7 days before, only when still ahead", () => {
	const out = plan([movie(9, "Film", "2026-11-26")], { prefs: prefs(noDigest) });
	assert.deepEqual(
		out.map((a) => [a.id, a.type, a.fireAt, a.body]),
		[
			[`${ALERT_ID.REMINDER}movie_9-2026-11-26`, AlertType.MOVIE_REMINDER, at("2026-11-19", 9), "Out in 7 days"],
			[`${ALERT_ID.MOVIE}movie_9-2026-11-26`, AlertType.MOVIE, at("2026-11-26", 9), "Out today"],
		],
	);
	// reminder already past → only the release alert
	assert.deepEqual(plan([movie(9, "Film", "2026-11-20")], { prefs: prefs(noDigest) }).map((a) => a.type), [AlertType.MOVIE]);
	// switches
	const noRem = prefs({ ...noDigest, [NotificationKind.MOVIE_REMINDERS]: false });
	assert.deepEqual(plan([movie(9, "Film", "2026-11-26")], { prefs: noRem }).map((a) => a.type), [AlertType.MOVIE]);
	const noPrem = prefs({ ...noDigest, [NotificationKind.PREMIERES]: false });
	assert.deepEqual(plan([movie(9, "Film", "2026-11-26")], { prefs: noPrem }).map((a) => a.type), [AlertType.MOVIE_REMINDER]);
	assert.deepEqual(plan([movie(9, "Film", null)], { prefs: prefs(noDigest) }), []);
});

test("overrides move an episode and add one the catalog lacks", () => {
	const t = show(1, "A", [ep(2, "2026-11-17", 20)]);
	const moved = { docId: "tv_1", season: 1, episode: 2, name: "Moved", airStamp: stampOf("2026-11-18", 21) };
	const added = { docId: "tv_1", season: 1, episode: 3, name: "Brand New", airStamp: stampOf("2026-11-19", 20) };
	const out = plan([t], { prefs: prefs(noDigest), overrides: [moved, added] });
	assert.deepEqual(out.map((a) => [a.fireAt, a.body]), [
		[at("2026-11-18", 21), "S1 E2 · Moved"],
		[at("2026-11-19", 20), "S1 E3 · Brand New"],
	]);
	// another title's override is ignored
	assert.equal(plan([t], { prefs: prefs(noDigest), overrides: [{ ...moved, docId: "tv_99" }] })[0].fireAt, at("2026-11-17", 20));
});

test("pruneOverrides drops corrections more than a day past; mergeOverrides replaces the same episode", () => {
	const old = { docId: "a", season: 1, episode: 1, name: "", airStamp: stampOf("2026-11-10", 20) };
	const live = { docId: "a", season: 1, episode: 2, name: "", airStamp: stampOf("2026-11-20", 20) };
	assert.deepEqual(pruneOverrides([old, live], NOW), [live]);
	const newer = { ...live, airStamp: stampOf("2026-11-21", 20) };
	assert.deepEqual(mergeOverrides([live], [newer]), [newer]);
});

test("cap: at most 60 alerts, nearest first, the nudge always kept", () => {
	const titles = Array.from({ length: 70 }, (_, i) => show(i + 1, `T${i + 1}`, [ep(2, "2026-11-17", 10 + (i % 8), "x")].map((e, k) => ({ ...e, airStamp: new Date(at("2026-11-17", 10) + i * 60000).toISOString(), episodeNumber: 2 + k }))));
	const out = plan(titles, { prefs: prefs(noDigest), lastOpenMs: NOW });
	assert.equal(out.length, AIRING_CAP);
	assert.ok(out.some((a) => a.id === ALERT_ID.NUDGE));
	const episodes = out.filter((a) => a.id !== ALERT_ID.NUDGE);
	assert.equal(episodes.length, AIRING_CAP - 1);
	// the 59 kept are the 59 earliest (T1..T59)
	assert.deepEqual(episodes.map((a) => a.docId), titles.slice(0, AIRING_CAP - 1).map((t) => t.docId));
});

test("weekly digest: Sunday 9 am lists Monday-Saturday ahead, skips empty weeks and an off switch", () => {
	const t = show(1, "Scrubs", [ep(2, "2026-11-23", 20), ep(3, "2026-11-28", 20), ep(4, "2026-11-29", 20)]);
	const m = movie(9, "Film", "2026-11-25");
	const digests = plan([t, m]).filter((a) => a.type === AlertType.DIGEST);
	assert.equal(digests.length, 1); // Nov 29's week (30th - Dec 5) has nothing
	assert.equal(digests[0].id, `${ALERT_ID.DIGEST}2026-11-22`);
	assert.equal(digests[0].fireAt, at("2026-11-22", 9));
	assert.equal(digests[0].body, "Scrubs, Film");
	assert.equal(plan([t, m], { prefs: prefs(noDigest) }).some((a) => a.type === AlertType.DIGEST), false);
	// more than 3 names are folded
	const many = [1, 2, 3, 4, 5].map((n) => show(n, `S${n}`, [ep(2, "2026-11-24", 20)]));
	assert.equal(plan(many).find((a) => a.type === AlertType.DIGEST)?.body, "S1, S2, S3, +2 more");
});

test("reopen nudge: 9 am, 25 days after the last open, never in the past", () => {
	const out = plan([], { lastOpenMs: NOW });
	assert.equal(out.length, 1);
	assert.equal(out[0].id, ALERT_ID.NUDGE);
	assert.equal(out[0].type, AlertType.NUDGE);
	assert.equal(out[0].fireAt, at("2026-12-11", 9));
	assert.equal(out[0].body, "Open Watchloom to keep your episode alerts coming.");
	assert.deepEqual(plan([], { lastOpenMs: at("2026-10-01", 10) }), []);
	assert.deepEqual(plan([], { lastOpenMs: 0 }), []);
});

test("parseNotifyPrefs: defaults on, saved booleans win, junk ignored", () => {
	assert.deepEqual(parseNotifyPrefs(null), DEFAULT_NOTIFY_PREFS);
	assert.equal(parseNotifyPrefs(JSON.stringify({ premieres: false, newEpisodes: "no" })).premieres.on, false);
	assert.equal(parseNotifyPrefs(JSON.stringify({ premieres: false, newEpisodes: "no" })).episodes.on, true);
	assert.deepEqual(parseNotifyPrefs("not json"), DEFAULT_NOTIFY_PREFS);
	assert.deepEqual(parseNotifyPrefs("5"), DEFAULT_NOTIFY_PREFS);
});

test("coverage: a caught-up show alerts only from its next episode on", () => {
	const t = show(1, "A", [ep(2, "2026-11-17", 20), ep(3, "2026-11-18", 20), ep(4, "2026-11-19", 20)], 1, WatchStatus.WATCHING, {
		season: 1,
		episode: 3,
	});
	const out = plan([t], { prefs: prefs(noDigest) });
	assert.deepEqual(out.map((a) => a.fireAt), [at("2026-11-18", 20), at("2026-11-19", 20)]);
});

test("coverage: an aired unwatched next episode (backlog) gets no episode alerts; no next episode neither", () => {
	const eps = [ep(2, "2026-11-14", 20), ep(3, "2026-11-17", 20)];
	assert.deepEqual(plan([show(1, "A", eps)], { prefs: prefs(noDigest) }), []);
	assert.deepEqual(plan([show(1, "A", eps, 1, WatchStatus.WATCHING, null)], { prefs: prefs(noDigest) }), []);
	// untimed: aired by its day
	assert.deepEqual(plan([show(1, "A", [ep(2, "2026-11-16", null), ep(3, "2026-11-20", 20)])], { prefs: prefs(noDigest) }), []);
});

test("coverage: only watching / rewatching titles get episode alerts, movies are unchanged", () => {
	const eps = [ep(2, "2026-11-17", 20)];
	for (const status of [WatchStatus.PLAN_TO_WATCH, WatchStatus.COMPLETED, WatchStatus.PAUSED, WatchStatus.PAUSED_REWATCH]) {
		assert.deepEqual(plan([show(1, "A", eps, 1, status)], { prefs: prefs(noDigest) }), []);
	}
	assert.equal(plan([show(1, "A", eps, 1, WatchStatus.REWATCHING)], { prefs: prefs(noDigest) }).length, 1);
	assert.equal(plan([movie(9, "Film", "2026-11-26")], { prefs: prefs(noDigest) }).length, 2);
});

test("toPlanTitle needs a cached title; topicDocIds skips paused and watched movies", () => {
	const doc = { tmdbId: 5, mediaType: MediaType.TV, status: WatchStatus.WATCHING };
	assert.equal(toPlanTitle(doc, null), null);
	const t = toPlanTitle(doc, { title: "X", seasons: [{ seasonNumber: 1, episodes: [{ episodeNumber: 1, title: "e", airDate: "2026-11-17" }] }] });
	assert.equal(t?.docId, "tv_5");
	assert.equal(t?.seasons[0].episodes[0].airStamp, undefined);
	assert.deepEqual(
		topicDocIds([
			doc,
			{ tmdbId: 6, mediaType: MediaType.TV, status: WatchStatus.PAUSED },
			{ tmdbId: 7, mediaType: MediaType.MOVIE, status: WatchStatus.COMPLETED },
			{ tmdbId: 8, mediaType: MediaType.MOVIE, status: WatchStatus.PLAN_TO_WATCH },
		]),
		["tv_5", "movie_8"],
	);
});

test("an overnight episode that has aired keeps its 9 am alert until it fires (replan at 2 am)", () => {
	const t = show(1, "Scrubs", [ep(3, "2026-11-16", 23)]);
	const out = plan([t], { now: at("2026-11-17", 2), prefs: prefs(noDigest) });
	assert.equal(out.length, 1);
	assert.equal(out[0].fireAt, at("2026-11-17", 9));
	// after 9 am it is a backlog episode: nothing
	assert.deepEqual(plan([t], { now: at("2026-11-17", 9, 30), prefs: prefs(noDigest) }), []);
	// quiet hours off: aired at 11 pm, nothing left to fire
	assert.deepEqual(plan([t], { now: at("2026-11-17", 2), prefs: prefs({ ...noDigest, [NotificationKind.QUIET_HOURS]: false }) }), []);
});
