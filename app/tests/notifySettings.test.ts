import { test } from "node:test";
import assert from "node:assert/strict";

process.env.TZ = "Asia/Kolkata";

import { buildAiringPlan, type PlanEpisode, type PlanTitle } from "../src/utils/airingPlan";
import {
	applyPreset,
	DEFAULT_NOTIFY_PREFS,
	parseNotifyPrefs,
	presetOf,
	type NotifyPrefs,
} from "../src/utils/notifyConfig";
import {
	AlertType,
	EpisodeScope,
	MediaType,
	NotifyPreset,
	PictureStyle,
	QuietMode,
	WatchStatus,
} from "../src/enums";

const at = (date: string, h = 0, m = 0) => {
	const [y, mo, d] = date.split("-").map(Number);
	return new Date(y, mo - 1, d, h, m).getTime();
};
const stampOf = (date: string, h: number, m = 0) => new Date(at(date, h, m)).toISOString();
// Monday 2026-11-16, noon
const NOW = at("2026-11-16", 12);

const ep = (episodeNumber: number, date: string, h: number | null, title = `Name ${episodeNumber}`): PlanEpisode => ({
	episodeNumber,
	title,
	airDate: date,
	...(h === null ? {} : { airStamp: stampOf(date, h) }),
});

const show = (
	n: number,
	title: string,
	eps: PlanEpisode[],
	over: Partial<PlanTitle> = {},
	season = 1,
): PlanTitle => ({
	docId: `tv_${n}`,
	tmdbId: n,
	mediaType: MediaType.TV,
	title,
	status: WatchStatus.WATCHING,
	nextEpisode: { season, episode: eps[0]?.episodeNumber ?? 1 },
	releaseDate: null,
	backdropPath: "/b.jpg",
	seasons: [{ seasonNumber: season, episodes: eps }],
	...over,
});

const movie = (n: number, title: string, releaseDate: string): PlanTitle => ({
	docId: `movie_${n}`,
	tmdbId: n,
	mediaType: MediaType.MOVIE,
	title,
	status: WatchStatus.PLAN_TO_WATCH,
	nextEpisode: null,
	releaseDate,
	seasons: [],
});

/** Defaults with a few fields changed; the weekly digest is off unless asked for (keeps plans short) */
const prefs = (over: (p: NotifyPrefs) => void = () => {}): NotifyPrefs => {
	const p = parseNotifyPrefs(null);
	p.weeklyDigest.on = false;
	over(p);
	return p;
};
const plan = (titles: PlanTitle[], p: NotifyPrefs, over: Partial<{ now: number; lastOpenMs: number }> = {}) =>
	buildAiringPlan({ now: NOW, titles, prefs: p, overrides: [], lastOpenMs: 0, ...over });

// ---- parsing / presets --------------------------------------------------------------------------

test("parse: defaults, clamping, junk ignored, round trip", () => {
	assert.deepEqual(parseNotifyPrefs(null), DEFAULT_NOTIFY_PREFS);
	assert.deepEqual(parseNotifyPrefs(JSON.stringify(DEFAULT_NOTIFY_PREFS)), DEFAULT_NOTIFY_PREFS);
	const p = parseNotifyPrefs(
		JSON.stringify({ quiet: { startHour: 99, mode: "nope", days: [1, 9, "x"] }, timing: { horizonDays: -5 }, muted: { a: -1, b: 5 } }),
	);
	assert.equal(p.quiet.startHour, 23);
	assert.equal(p.quiet.mode, QuietMode.DEFER);
	assert.deepEqual(p.quiet.days, [1]);
	assert.equal(p.timing.horizonDays, 1);
	assert.deepEqual(p.muted, { b: 5 });
});

test("parse: the old five switches migrate", () => {
	const p = parseNotifyPrefs(JSON.stringify({ premieres: false, newEpisodes: true, movieReminders: false, weeklyDigest: false, quietHours: false }));
	assert.equal(p.premieres.on, false);
	assert.equal(p.movies.releaseOn, false);
	assert.equal(p.movies.remindOn, false);
	assert.equal(p.weeklyDigest.on, false);
	assert.equal(p.quiet.on, false);
	assert.equal(p.episodes.on, true);
});

test("presets: apply, and the matching one is detected; editing makes it custom", () => {
	assert.equal(presetOf(DEFAULT_NOTIFY_PREFS), NotifyPreset.BALANCED);
	for (const preset of [NotifyPreset.ESSENTIAL, NotifyPreset.BALANCED, NotifyPreset.EVERYTHING]) {
		assert.equal(presetOf(applyPreset(DEFAULT_NOTIFY_PREFS, preset)), preset);
	}
	const essential = applyPreset(DEFAULT_NOTIFY_PREFS, NotifyPreset.ESSENTIAL);
	essential.finales.on = true;
	assert.equal(presetOf(essential), NotifyPreset.CUSTOM);
	// A preset leaves timing, look and mutes alone
	const kept = { ...DEFAULT_NOTIFY_PREFS, muted: { x: 0 }, timing: { ...DEFAULT_NOTIFY_PREFS.timing, horizonDays: 14 } };
	const applied = applyPreset(kept, NotifyPreset.EVERYTHING);
	assert.deepEqual(applied.muted, { x: 0 });
	assert.equal(applied.timing.horizonDays, 14);
});

// ---- pause, vacation, mutes --------------------------------------------------------------------------

const tomorrow20 = () => show(1, "Scrubs", [ep(2, "2026-11-17", 20), ep(3, "2026-11-24", 20)]);

test("pause for good plans nothing; a snooze drops alerts inside it only", () => {
	const t = tomorrow20();
	assert.deepEqual(plan([t], prefs((p) => (p.pause = { on: true, until: 0 }))), []);
	const snoozed = plan([t], prefs((p) => (p.pause = { on: true, until: at("2026-11-20") })));
	assert.deepEqual(snoozed.map((a) => a.fireAt), [at("2026-11-24", 20)]);
});

test("vacation drops alerts on its days, bounds included", () => {
	const t = tomorrow20();
	const off = plan([t], prefs((p) => (p.vacation = { on: true, from: "2026-11-17", to: "2026-11-17" })));
	assert.deepEqual(off.map((a) => a.fireAt), [at("2026-11-24", 20)]);
});

test("muted titles stay silent until the mute ends; solo mode keeps only the chosen", () => {
	const a = tomorrow20();
	const b = show(2, "Other", [ep(2, "2026-11-17", 21)]);
	assert.equal(plan([a, b], prefs((p) => (p.muted = { tv_1: 0 }))).every((x) => x.docId === "tv_2"), true);
	assert.equal(plan([a], prefs((p) => (p.muted = { tv_1: at("2026-11-17") }))).length, 0);
	assert.equal(plan([a], prefs((p) => (p.muted = { tv_1: at("2026-11-10") }))).length, plan([a], prefs()).length);
	const solo = plan([a, b], prefs((p) => ((p.soloOnly = true), (p.solo = ["tv_2"]))));
	assert.deepEqual([...new Set(solo.map((x) => x.docId))], ["tv_2"]);
});

// ---- episodes ---------------------------------------------------------------------------------------

test("scope: a backlog show alerts only in the watching / tracked scopes", () => {
	// Next to watch (E1) aired a week ago → not caught up
	const t = show(1, "Behind", [ep(1, "2026-11-09", 20), ep(2, "2026-11-17", 20)]);
	assert.equal(plan([t], prefs()).length, 0);
	assert.equal(plan([t], prefs((p) => (p.episodes.scope = EpisodeScope.WATCHING))).length, 1);
	const planned = show(2, "Planned", [ep(2, "2026-11-17", 20)], { status: WatchStatus.PLAN_TO_WATCH });
	assert.equal(plan([planned], prefs((p) => (p.episodes.scope = EpisodeScope.WATCHING))).length, 0);
	assert.equal(plan([planned], prefs((p) => (p.episodes.scope = EpisodeScope.TRACKED))).length, 1);
});

test("lead time moves a timed episode earlier; untimed ones stay at the default hour", () => {
	const t = show(1, "A", [ep(2, "2026-11-17", 20)]);
	assert.equal(plan([t], prefs((p) => (p.episodes.leadMin = 30)))[0].fireAt, at("2026-11-17", 19, 30));
	const untimed = show(1, "A", [ep(2, "2026-11-17", null)]);
	assert.equal(plan([untimed], prefs((p) => (p.episodes.leadMin = 30)))[0].fireAt, at("2026-11-17", 9));
	assert.equal(plan([untimed], prefs((p) => (p.timing.defaultHour = 18)))[0].fireAt, at("2026-11-17", 18));
});

test("specials can be skipped", () => {
	const t = show(1, "A", [ep(1, "2026-11-17", 20)], { nextEpisode: { season: 0, episode: 1 } }, 0);
	assert.equal(plan([t], prefs((p) => (p.premieres.on = false))).length, 1);
	assert.equal(plan([t], prefs((p) => ((p.premieres.on = false), (p.episodes.skipSpecials = true)))).length, 0);
});

test("finale: the last episode of a season, a series finale when the show ended", () => {
	const eps = [ep(7, "2026-11-17", 20), ep(8, "2026-11-24", 20)];
	const t = show(1, "A", eps, { nextEpisode: { season: 1, episode: 7 } });
	const off = plan([t], prefs());
	assert.equal(off[1].type, AlertType.EPISODE);
	const on = plan([t], prefs((p) => (p.finales.on = true)));
	assert.equal(on[1].type, AlertType.FINALE);
	assert.equal(on[1].body, "Season 1 finale · Name 8");
	const ended = plan([{ ...t, showStatus: "Ended" }], prefs((p) => (p.finales.on = true)));
	assert.equal(ended[1].type, AlertType.SERIES_FINALE);
	assert.equal(ended[1].body, "Series finale · Name 8");
	// The episode switch off still lets finales through
	const onlyFinale = plan([t], prefs((p) => ((p.episodes.on = false), (p.finales.on = true))));
	assert.deepEqual(onlyFinale.map((a) => a.type), [AlertType.FINALE]);
});

test("premiere heads-up the day before", () => {
	const t = show(1, "A", [ep(1, "2026-11-20", 20), ep(2, "2026-11-27", 20)]);
	const out = plan([t], prefs((p) => (p.premieres.dayBefore = true)));
	const headsUp = out.find((a) => a.type === AlertType.HEADSUP);
	assert.equal(headsUp?.fireAt, at("2026-11-19", 9));
	assert.equal(headsUp?.body, "Season 1 premieres tomorrow");
});

test("spoiler-safe: no episode name, no still", () => {
	const t = show(1, "A", [{ ...ep(2, "2026-11-17", 20, "The Twist"), stillPath: "/s.jpg" }]);
	const normal = plan([t], prefs())[0];
	assert.equal(normal.body, "S1 E2 · The Twist");
	assert.equal(normal.image?.picturePath, "/s.jpg");
	const safe = plan([t], prefs((p) => (p.look.spoilerSafe = true)))[0];
	assert.equal(safe.body, "S1 E2");
	assert.equal(safe.image?.picturePath, "/b.jpg");
	assert.deepEqual(safe.image?.caption, ["S01E02"]);
	assert.equal(plan([t], prefs((p) => (p.look.picture = PictureStyle.PLAIN)))[0].image, undefined);
});

// ---- quiet hours ----------------------------------------------------------------------------------------

test("quiet hours: custom window and morning hour, weekdays, and the drop / important modes", () => {
	const late = show(1, "A", [ep(2, "2026-11-17", 23)]); // Tuesday 23:00
	// Window 23 → 7, back at 8
	const custom = plan([late], prefs((p) => (p.quiet = { ...p.quiet, startHour: 23, endHour: 7, morningHour: 8 })));
	assert.equal(custom[0].fireAt, at("2026-11-18", 8));
	// Window 0 → 6 doesn't hold a 23:00 alert
	assert.equal(plan([late], prefs((p) => (p.quiet = { ...p.quiet, startHour: 0, endHour: 6 })))[0].fireAt, at("2026-11-17", 23));
	// Tuesday isn't a quiet day
	assert.equal(plan([late], prefs((p) => (p.quiet = { ...p.quiet, days: [0, 1, 3] })))[0].fireAt, at("2026-11-17", 23));
	assert.deepEqual(plan([late], prefs((p) => (p.quiet = { ...p.quiet, mode: QuietMode.DROP }))), []);
	// Important: an episode waits, a premiere comes through
	const premiere = show(2, "P", [ep(1, "2026-11-17", 23)]);
	const important = prefs((p) => (p.quiet = { ...p.quiet, mode: QuietMode.IMPORTANT }));
	assert.equal(plan([late], important)[0].fireAt, at("2026-11-18", 9));
	assert.equal(plan([premiere], important)[0].fireAt, at("2026-11-17", 23));
});

test("overnight grouping can be turned off", () => {
	const a = show(1, "A", [ep(2, "2026-11-17", 3)]);
	const b = show(2, "B", [ep(2, "2026-11-17", 4)]);
	assert.equal(plan([a, b], prefs()).length, 1);
	assert.equal(plan([a, b], prefs((p) => (p.grouping.overnight = false))).length, 2);
});

test("episodes of one title: combined by default, one alert each when split", () => {
	const t = show(1, "A", [ep(2, "2026-11-17", 20), ep(3, "2026-11-17", 20), ep(4, "2026-11-17", 20)]);
	assert.equal(plan([t], prefs()).length, 1);
	const split = plan([t], prefs((p) => (p.grouping.combineEpisodes = false)));
	assert.equal(split.length, 3);
	assert.equal(new Set(split.map((a) => a.id)).size, 3);
});

test("expanded rows are capped at maxRows", () => {
	const eps = Array.from({ length: 8 }, (_, i) => ep(i + 2, "2026-11-17", 20));
	const [a] = plan([show(1, "A", eps)], prefs((p) => (p.grouping.maxRows = 3)));
	assert.equal(a.lines?.length, 3);
	assert.equal(a.lines?.[2], "+6 more");
});

// ---- movies ---------------------------------------------------------------------------------------------

test("movie reminders: several lead times, release switch independent", () => {
	const m = movie(1, "Film", "2026-12-10");
	const out = plan([m], prefs((p) => (p.movies.remindDays = [1, 3, 7, 14])));
	assert.deepEqual(
		out.map((a) => [a.fireAt, a.body]),
		[
			[at("2026-11-26", 9), "Out in 14 days"],
			[at("2026-12-03", 9), "Out in 7 days"],
			[at("2026-12-07", 9), "Out in 3 days"],
			[at("2026-12-09", 9), "Out tomorrow"],
			[at("2026-12-10", 9), "Out today"],
		],
	);
	const noRelease = plan([m], prefs((p) => ((p.movies.releaseOn = false), (p.movies.remindDays = [7]))));
	assert.deepEqual(noRelease.map((a) => a.type), [AlertType.MOVIE_REMINDER]);
	assert.equal(plan([m], prefs((p) => (p.timing.defaultHour = 18)))[0].fireAt, at("2026-12-03", 18));
});

// ---- digests, backlog, cap, nudge -----------------------------------------------------------------------------

test("weekly digest: its own weekday, hour and window; daily digest lists today's titles", () => {
	const t = show(1, "A", [ep(2, "2026-11-17", 20), ep(3, "2026-11-19", 20)]);
	const weekly = plan(
		[t],
		prefs((p) => {
			p.episodes.on = false;
			p.premieres.on = false;
			p.weeklyDigest = { on: true, weekday: 3, hour: 18, windowDays: 3 };
		}),
	);
	// Wednesday 18 Nov 18:00, covering the 19th–21st
	assert.deepEqual(weekly.map((a) => [a.type, a.fireAt]), [[AlertType.DIGEST, at("2026-11-18", 18)]]);
	const daily = plan(
		[t],
		prefs((p) => {
			p.episodes.on = false;
			p.premieres.on = false;
			p.dailyDigest = { on: true, hour: 8 };
		}),
	);
	assert.deepEqual(daily.map((a) => [a.type, a.fireAt, a.body]), [
		[AlertType.DAILY, at("2026-11-17", 8), "A"],
		[AlertType.DAILY, at("2026-11-19", 8), "A"],
	]);
});

test("backlog: a weekly count of aired, unwatched episodes", () => {
	const t = show(1, "Behind", [ep(1, "2026-11-02", 20), ep(2, "2026-11-09", 20), ep(3, "2026-11-23", 20)]);
	const out = plan([t], prefs((p) => ((p.backlog = { on: true, weekday: 6, hour: 10 }), (p.episodes.on = false), (p.premieres.on = false))));
	assert.deepEqual(out.map((a) => [a.type, a.fireAt, a.body]), [
		[AlertType.BACKLOG, at("2026-11-21", 10), "2 unwatched episodes across 1 show"],
	]);
	// Nothing behind → no alert
	const caughtUp = show(1, "Ok", [ep(2, "2026-11-17", 20)]);
	assert.equal(plan([caughtUp], prefs((p) => ((p.backlog.on = true), (p.episodes.on = false), (p.premieres.on = false)))).length, 0);
});

test("max per day: the extras fold into one alert", () => {
	const titles = [1, 2, 3, 4, 5].map((n) => show(n, `S${n}`, [ep(2, "2026-11-17", 14 + n)]));
	const out = plan(titles, prefs((p) => (p.timing.maxPerDay = 3)));
	assert.equal(out.length, 4);
	const rolled = out.find((a) => a.type === AlertType.OVERFLOW);
	assert.equal(rolled?.title, "2 More Alerts Today");
	assert.equal(rolled?.body, "S4, S5");
});

test("horizon and nudge follow their settings", () => {
	const far = show(1, "Far", [ep(2, "2026-12-30", 20)]);
	assert.equal(plan([far], prefs()).length, 0);
	assert.equal(plan([far], prefs((p) => (p.timing.horizonDays = 60))).length, 1);
	const nudge = plan([], prefs((p) => (p.movies.releaseOn = true)), { lastOpenMs: NOW });
	assert.equal(nudge[0]?.type, AlertType.NUDGE);
	assert.equal(nudge[0]?.fireAt, at("2026-12-11", 9));
	assert.equal(plan([], prefs((p) => (p.nudge = { on: true, days: 7 })), { lastOpenMs: NOW })[0].fireAt, at("2026-11-23", 9));
	assert.deepEqual(plan([], prefs((p) => (p.nudge.on = false)), { lastOpenMs: NOW }), []);
});
