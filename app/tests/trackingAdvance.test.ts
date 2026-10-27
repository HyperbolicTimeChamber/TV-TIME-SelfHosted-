import { test } from "node:test";
import assert from "node:assert/strict";
import {
	computeTrackingAdvance,
	computeJumpFrom,
	rewatchLevel,
	firstSkippedBefore,
	jumpPromptFor,
	seasonMarkEpisodes,
	seasonMarkCopy,
	seasonSkipAheadCopy,
	startRewatchCopy,
	observedRewatchRun,
	carouselRunBase,
	firstSkippedSeason,
	rewatchUpToRefs,
	epKey,
	EpisodeRef,
} from "../src/utils";
import { WatchStatus } from "../src/enums";

const TODAY = "2026-10-09";
// S1E1–6 + S2E1–6, all aired
const order: EpisodeRef[] = [
	...Array.from({ length: 6 }, (_, i) => ({ season: 1, episode: i + 1, airDate: "2025-01-01" })),
	...Array.from({ length: 6 }, (_, i) => ({ season: 2, episode: i + 1, airDate: "2025-06-01" })),
];
const counts = (arr: number[]) =>
	new Map(arr.map((c, i) => [epKey(order[i].season, order[i].episode), c]));
const mk = (s: number, e: number) => [{ season: s, episode: e }];
const all = (c: number) => Array(12).fill(c) as number[];
const { WATCHING: W, COMPLETED: C, REWATCHING: R, PAUSED_REWATCH: PR } = WatchStatus;
const adv = (
	c: number[],
	marked: { season: number; episode: number }[],
	status: WatchStatus,
	nextEpisode: { season: number; episode: number } | null,
	o: EpisodeRef[] = order,
) => computeTrackingAdvance(o, counts(c), marked, { status, nextEpisode }, TODAY);

test("normal mark advances to next episode", () => {
	const r = adv([1, ...Array(11).fill(0)], mk(1, 1), W, { season: 1, episode: 1 });
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status],
		[true, { season: 1, episode: 2 }, undefined],
	);
});

test("filling a gap skips already-watched episodes (no jump back)", () => {
	const r = adv([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], mk(1, 3), W, { season: 2, episode: 4 });
	assert.equal(r.advance, true);
	assert.deepEqual(r.nextEpisode, { season: 2, episode: 4 });
});

test("watching an episode in between (earlier unwatched) leaves watchlist alone", () => {
	const r = adv([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], mk(1, 5), W, { season: 1, episode: 1 });
	assert.equal(r.advance, false);
});

test("marking the pointer's episode advances even when an earlier count is missing", () => {
	// Another device marked E4 (pointer → E5); this one's per-show cache still has E4 at 0
	const r = adv([1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], mk(1, 5), W, { season: 1, episode: 5 });
	assert.equal(r.advance, true);
	assert.deepEqual(r.nextEpisode, { season: 1, episode: 6 });
});

test("crosses season boundary", () => {
	const r = adv([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], mk(1, 6), W, { season: 1, episode: 6 });
	assert.deepEqual(r.nextEpisode, { season: 2, episode: 1 });
});

test("finale completes the show", () => {
	const r = adv(all(1), mk(2, 6), W, { season: 2, episode: 6 });
	assert.deepEqual([r.advance, r.nextEpisode, r.status], [true, null, C]);
});

test("season mark uses the last marked episode", () => {
	const marked = [1, 2, 3, 4, 5, 6].map((e) => ({ season: 1, episode: e }));
	const r = adv([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], marked, W, { season: 1, episode: 1 });
	assert.deepEqual(r.nextEpisode, { season: 2, episode: 1 });
});

test("no tracking → nothing moves", () => {
	assert.equal(computeTrackingAdvance(order, counts(all(1)), mk(1, 1), null, TODAY).advance, false);
});

// --- starting a rewatch ---
test("rewatch starts when ep 1 is re-marked and every other episode has the same count", () => {
	const r = adv([2, ...Array(11).fill(1)], mk(1, 1), C, null);
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status, r.incrementRewatch],
		[true, { season: 1, episode: 2 }, R, true],
	);
});

test("rewatch start works even if status was never set to completed (all watched)", () => {
	const r = adv([2, ...Array(11).fill(1)], mk(1, 1), W, null);
	assert.equal(r.status, R);
});

test("rewatch does NOT start from ep 1 when counts are uneven", () => {
	// ep 7 was watched twice already
	const r = adv([2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1], mk(1, 1), C, null);
	assert.equal(r.advance, false);
});

test("rewatch does NOT start mid-watch (later episodes unwatched)", () => {
	const r = adv([2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], mk(1, 1), W, { season: 1, episode: 4 });
	assert.equal(r.advance, false);
});

test("unaired, unwatched episodes don't block starting a rewatch", () => {
	const o: EpisodeRef[] = [...order.slice(0, 11), { season: 2, episode: 6, airDate: "2099-01-01" }];
	const r = adv([2, ...Array(10).fill(1), 0], mk(1, 1), W, { season: 2, episode: 6 }, o);
	assert.equal(r.status, R);
});

test("re-marking a random episode of a finished show never starts a rewatch", () => {
	const r = adv([1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1], mk(1, 5), C, null);
	assert.equal(r.advance, false);
});

test("re-marking season 1 of a uniformly watched show starts a rewatch at S2E1", () => {
	const marked = [1, 2, 3, 4, 5, 6].map((e) => ({ season: 1, episode: e }));
	const r = adv([2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1], marked, C, null);
	assert.deepEqual([r.nextEpisode, r.status], [{ season: 2, episode: 1 }, R]);
});

test("re-marking season 2 (not ep 1) of a finished show doesn't start a rewatch", () => {
	const marked = [1, 2, 3, 4, 5, 6].map((e) => ({ season: 2, episode: e }));
	const r = adv([1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2], marked, C, null);
	assert.equal(r.advance, false);
});

// --- during a rewatch ---
test("rewatch at ep 2: marking ep 5 does not jump ahead", () => {
	const r = adv([2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1], mk(1, 5), R, { season: 1, episode: 2 });
	assert.equal(r.advance, false);
});

test("rewatch: marking the current episode advances without another rewatch bump", () => {
	const r = adv([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], mk(1, 2), R, { season: 1, episode: 2 });
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status, r.incrementRewatch],
		[true, { season: 1, episode: 3 }, R, false],
	);
});

test("paused rewatch resumes without bumping rewatchCount", () => {
	const r = adv([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], mk(1, 2), PR, { season: 1, episode: 2 });
	assert.deepEqual([r.status, r.incrementRewatch], [R, false]);
});

test("first-time watch of an episode mid-rewatch doesn't move the rewatch pointer", () => {
	const r = adv([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], mk(2, 6), R, { season: 1, episode: 2 });
	assert.equal(r.advance, false);
});

test("finishing a rewatch completes the show", () => {
	const r = adv([...Array(11).fill(2), 2], mk(2, 6), R, { season: 2, episode: 6 });
	assert.deepEqual([r.nextEpisode, r.status], [null, C]);
});

// --- explicit "watch / rewatch from here" (modal yes) ---
test("jump: rewatch from a random episode of a finished show", () => {
	const r = computeJumpFrom(order, counts([1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]), mk(1, 5), {
		status: C,
	});
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status, r.incrementRewatch],
		[true, { season: 1, episode: 6 }, R, true],
	);
});

test("jump: watch from here skips ahead past unwatched earlier episodes", () => {
	const r = computeJumpFrom(order, counts([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]), mk(1, 5), {
		status: W,
	});
	assert.deepEqual(
		[r.nextEpisode, r.status, r.incrementRewatch],
		[{ season: 1, episode: 6 }, undefined, false],
	);
});

test("jump: skips episodes already watched at that level", () => {
	const r = computeJumpFrom(order, counts([0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]), mk(1, 5), {
		status: W,
	});
	assert.deepEqual(r.nextEpisode, { season: 2, episode: 2 });
});

test("jump: first-time watch during a rewatch switches back to watching", () => {
	const r = computeJumpFrom(order, counts([2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]), mk(1, 5), {
		status: R,
	});
	assert.deepEqual([r.nextEpisode, r.status], [{ season: 1, episode: 6 }, W]);
});

// --- rewatch skips (watchlist "Skip") ---
test("rewatch: after skipping ep 2, marking ep 3 continues the rewatch", () => {
	// ep 2 skipped → still count 1; pointer moved to ep 3
	const r = adv([2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1], mk(1, 3), R, { season: 1, episode: 3 });
	assert.deepEqual([r.advance, r.nextEpisode, r.status], [true, { season: 1, episode: 4 }, R]);
});

test("rewatch: re-marking an episode before the pointer doesn't move it", () => {
	const r = adv([3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1], mk(1, 1), R, { season: 1, episode: 4 });
	assert.equal(r.advance, false);
});

test("filling the last first-watch gap mid-rewatch turns it into a rewatch (pointer kept)", () => {
	// E1–E4 rewatched (×2) except E3, which was never watched; pointer at E5 — mark E3 once
	const r = adv([2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1], mk(1, 3), W, { season: 1, episode: 5 });
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status, r.incrementRewatch],
		[true, { season: 1, episode: 5 }, R, true],
	);
	// Not a rewatch while gaps remain
	const gap = adv([2, 2, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1], mk(1, 3), W, { season: 1, episode: 5 });
	assert.notEqual(gap.status, R);
});

// ── Show-page prompts (counts BEFORE the mark) ──
const tr = (status: WatchStatus, s: number, e: number) => ({
	status,
	nextEpisode: { season: s, episode: e },
});
const ep = (s: number, e: number) => ({ season: s, episode: e });

test("rewatch level: pointer count + 1, from the episode before a hole, never below 2", () => {
	assert.equal(rewatchLevel(order, counts([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), tr(R, 1, 3)), 2);
	assert.equal(rewatchLevel(order, counts([3, 3, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2]), tr(R, 1, 3)), 3);
	assert.equal(rewatchLevel(order, counts(all(1)), tr(PR, 1, 1)), 2);
	assert.equal(rewatchLevel(order, counts(all(1)), tr(C, 1, 1)), null);
	assert.equal(rewatchLevel(order, counts(all(1)), tr(W, 1, 1)), null);
});

test("speedster: first watch prompts over earlier unwatched episodes of the season", () => {
	const c = counts([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
	assert.deepEqual(firstSkippedBefore(order, c, tr(W, 1, 2), ep(1, 5)), {
		firstSkipped: 2,
		level: 1,
	});
	// Next episode → no prompt
	assert.equal(firstSkippedBefore(order, c, tr(W, 1, 2), ep(1, 2)), null);
});

test("speedster: re-marking a finished show (not rewatching) doesn't prompt", () => {
	assert.equal(firstSkippedBefore(order, counts(all(1)), tr(C, 1, 1), ep(1, 5)), null);
});

test("speedster: skipping ahead mid-rewatch prompts from the rewatch pointer", () => {
	// Rewatch at S1E3 (E1–E2 ×2), mark E6 (×1)
	const c = counts([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
	assert.deepEqual(firstSkippedBefore(order, c, tr(R, 1, 3), ep(1, 6)), {
		firstSkipped: 3,
		level: 2,
	});
	// Episodes skipped before the pointer aren't offered
	const skipped = counts([2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
	assert.deepEqual(firstSkippedBefore(order, skipped, tr(R, 1, 4), ep(1, 6)), {
		firstSkipped: 4,
		level: 2,
	});
	// Pointer episode itself / behind the pointer / already rewatched → no prompt
	assert.equal(firstSkippedBefore(order, c, tr(R, 1, 3), ep(1, 3)), null);
	assert.equal(firstSkippedBefore(order, skipped, tr(R, 1, 4), ep(1, 2)), null);
	assert.equal(firstSkippedBefore(order, c, tr(R, 1, 3), ep(1, 1)), null);
});

test("speedster: pointer in an earlier season → range starts at E1 of this season", () => {
	const c = counts([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
	assert.deepEqual(firstSkippedBefore(order, c, tr(R, 1, 3), ep(2, 4)), {
		firstSkipped: 1,
		level: 2,
	});
});

test("jump prompt: finished show offers to start a rewatch", () => {
	assert.deepEqual(jumpPromptFor(order, counts(all(1)), tr(C, 1, 1), ep(1, 5)), {
		rewatch: true,
		skipsPrevious: false,
		inRewatch: false,
	});
});

test("jump prompt: ahead of the rewatch pointer → skip within the rewatch, not a new rewatch", () => {
	const c = counts([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
	assert.deepEqual(jumpPromptFor(order, c, tr(R, 1, 3), ep(1, 6)), {
		rewatch: false,
		skipsPrevious: true,
		inRewatch: true,
	});
	// Confirming jumps the rewatch pointer past it without bumping rewatchCount
	const j = computeJumpFrom(order, counts([2, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1]), mk(1, 6), {
		status: R,
	});
	assert.deepEqual(
		[j.advance, j.nextEpisode, j.status, j.incrementRewatch],
		[true, { season: 2, episode: 1 }, R, false],
	);
});

test("jump prompt: behind the rewatch pointer or past the level → just mark", () => {
	const c = counts([2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
	assert.equal(jumpPromptFor(order, c, tr(R, 1, 4), ep(1, 2)), null);
	assert.equal(jumpPromptFor(order, c, tr(R, 1, 4), ep(1, 1)), null);
});

test("jump prompt: first-time watch of a hole mid-rewatch keeps the watch-from-here prompt", () => {
	const c = counts([2, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1]);
	assert.deepEqual(jumpPromptFor(order, c, tr(R, 1, 3), ep(1, 5)), {
		rewatch: false,
		skipsPrevious: false,
		inRewatch: false,
	});
});

test("season mark mid-rewatch only bumps episodes not yet rewatched", () => {
	const eps = [1, 2, 3, 4, 5, 6];
	const c = counts([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
	assert.deepEqual(seasonMarkEpisodes(order, c, tr(R, 1, 3), 1, eps), [3, 4, 5, 6]);
	// Whole season already rewatched → every episode (extra watch)
	assert.deepEqual(seasonMarkEpisodes(order, c, tr(R, 2, 1), 1, [1, 2]), [1, 2]);
	// Finished season, not rewatching → every episode ("Rewatch Season")
	assert.deepEqual(seasonMarkEpisodes(order, counts(all(1)), tr(C, 1, 1), 1, eps), eps);
	// Result advances the rewatch to S2E1
	const after = counts([2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]);
	const r = computeTrackingAdvance(
		order,
		after,
		[3, 4, 5, 6].map((e) => ep(1, e)),
		tr(R, 1, 3),
		TODAY,
	);
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status, r.incrementRewatch],
		[true, ep(2, 1), R, false],
	);
});

test("first-watch season mark on a partly watched season only marks unwatched episodes", () => {
	const eps = [1, 2, 3, 4, 5, 6];
	const c = counts([1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
	assert.deepEqual(seasonMarkEpisodes(order, c, tr(W, 1, 2), 1, eps), [2, 4, 5, 6]);
	// Untracked (no tracking doc yet) behaves the same
	assert.deepEqual(seasonMarkEpisodes(order, c, null, 1, eps), [2, 4, 5, 6]);
	// Nothing ends up at ×2, so the pointer just moves on — no rewatch
	const after = counts([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
	const r = computeTrackingAdvance(
		order,
		after,
		[2, 4, 5, 6].map((e) => ep(1, e)),
		tr(W, 1, 2),
		TODAY,
	);
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status, r.incrementRewatch],
		[true, ep(2, 1), undefined, false],
	);
});

test("season confirm copy says what the mark really does", () => {
	const base = { seasonNumber: 1, seasonName: "Season 1", total: 6 };
	assert.equal(
		seasonMarkCopy({ ...base, toMark: 6, allWatched: false, inRewatch: false }).title,
		"Mark Season 1 as Watched",
	);
	const partial = seasonMarkCopy({ ...base, toMark: 4, allWatched: false, inRewatch: false });
	assert.match(partial.hint, /4 episodes of Season 1 you haven't watched yet/);
	assert.equal(partial.confirmLabel, "Mark Season");
	const finished = seasonMarkCopy({ ...base, toMark: 6, allWatched: true, inRewatch: false });
	assert.deepEqual(
		[finished.title, finished.confirmLabel],
		["Rewatch Season 1", "Rewatch Season"],
	);
	const rest = seasonMarkCopy({ ...base, toMark: 1, allWatched: true, inRewatch: true });
	assert.equal(rest.title, "Rewatch Rest of Season 1");
	assert.match(rest.hint, /5 episodes of Season 1 are already rewatched/);
	assert.match(rest.hint, /other 1 episode/);
	assert.deepEqual([rest.confirmLabel, rest.secondaryLabel], ["Mark Rest", "Mark All Again"]);
	// Only the mid-rewatch partial case offers "Mark All Again"
	assert.equal(partial.secondaryLabel, undefined);
	assert.equal(finished.secondaryLabel, undefined);
	// Rewatch reaching a season nobody rewatched yet → whole season
	assert.equal(
		seasonMarkCopy({ ...base, toMark: 6, allWatched: true, inRewatch: true }).title,
		"Rewatch Season 1",
	);
});

// ── rewatch run number stays in line with the episode counts ──
test("rewatch writes carry the absolute run number (level − 1)", () => {
	// Starting rewatch 1 from E1
	const start = adv([2, ...Array(11).fill(1)], mk(1, 1), C, null);
	assert.deepEqual([start.incrementRewatch, start.rewatchCount], [true, 1]);
	// Continuing: no bump, but the run number is restated
	const cont = adv([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], mk(1, 2), R, ep(1, 2));
	assert.deepEqual([cont.incrementRewatch, cont.rewatchCount], [false, 1]);
	// First watch / completion carry none
	assert.equal(adv([1, ...Array(11).fill(0)], mk(1, 1), W, ep(1, 1)).rewatchCount, undefined);
	assert.equal(adv(all(2), mk(2, 6), R, ep(2, 6)).rewatchCount, undefined);
});

test("Scrubs: a new run under a REWATCHING status that never flipped stores run 4, not 3", () => {
	// E1–E3 ×5, rest ×4, status still rewatching (stored run 3) — marking E4 continues run 4
	const before = [5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4];
	assert.equal(rewatchLevel(order, counts(before), tr(R, 1, 4)), 5);
	assert.equal(observedRewatchRun(order, counts(before), tr(R, 1, 4)), 4);
	const r = adv([5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4], mk(1, 4), R, ep(1, 4));
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status, r.incrementRewatch, r.rewatchCount],
		[true, ep(1, 5), R, false, 4],
	);
});

test("filling the last first-watch gap mid-rewatch stores the run under way", () => {
	const r = adv([2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1], mk(1, 3), W, ep(1, 5));
	assert.equal(r.rewatchCount, 1);
});

test("observed rewatch run: only trusted when the pointer and the episode before agree", () => {
	// Pointer at run start (E1)
	assert.equal(observedRewatchRun(order, counts(all(3)), tr(R, 1, 1)), 3);
	// Episode before skipped (same count) still agrees
	assert.equal(observedRewatchRun(order, counts([3, 2, 2, ...Array(9).fill(2)]), tr(R, 1, 3)), 2);
	// Pointer on a first-watch hole / stray extra counts before it / not rewatching → unknown
	assert.equal(observedRewatchRun(order, counts([2, 2, 0, ...Array(9).fill(1)]), tr(R, 1, 3)), null);
	assert.equal(observedRewatchRun(order, counts([2, 5, 1, ...Array(9).fill(1)]), tr(R, 1, 3)), null);
	assert.equal(observedRewatchRun(order, counts(all(2)), tr(C, 1, 3)), null);
	assert.equal(observedRewatchRun(order, counts(all(2)), { status: R, nextEpisode: null }), null);
});

test("carousel run base: from the pointer's count, not a stale stored number", () => {
	// Scrubs: pointer E15 at ×4, stored run 3 → base 4 → E15 is NOT watched in this run
	assert.equal(carouselRunBase(true, 4, 5, 3), 4);
	assert.ok(!(4 > carouselRunBase(true, 4, 5, 3)));
	// First watch → 0
	assert.equal(carouselRunBase(false, 1, 1, 0), 0);
	// Pointer on a hole → one below the episode before it
	assert.equal(carouselRunBase(true, 0, 3, 1), 2);
	// Nothing known → stored run (≥ 1)
	assert.equal(carouselRunBase(true, null, null, 0), 1);
	assert.equal(carouselRunBase(true, null, null, 2), 2);
});

// ── season speedster ──
test("season speedster (first watch): earlier seasons' unwatched episodes", () => {
	const c = counts([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
	const r = firstSkippedSeason(order, c, tr(W, 1, 3), 2, TODAY);
	assert.deepEqual(r, { firstSeason: 1, level: 1, refs: [3, 4, 5, 6].map((e) => ep(1, e)) });
	// Season 1 finished → no prompt
	assert.equal(
		firstSkippedSeason(order, counts([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]), tr(W, 2, 1), 2, TODAY),
		null,
	);
	// Season 1 itself never prompts
	assert.equal(firstSkippedSeason(order, c, tr(W, 1, 3), 1, TODAY), null);
	// Extra watch of a finished season (nothing below the level) → no prompt
	assert.equal(
		firstSkippedSeason(order, counts([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]), tr(W, 1, 1), 2, TODAY),
		null,
	);
});

test("season speedster: unaired unwatched earlier episodes don't count", () => {
	const o: EpisodeRef[] = [
		...order.slice(0, 5),
		{ season: 1, episode: 6, airDate: "2099-01-01" },
		...order.slice(6),
	];
	const c = new Map(o.map((e, i) => [epKey(e.season, e.episode), i < 5 ? 1 : 0]));
	assert.equal(firstSkippedSeason(o, c, tr(W, 1, 6), 2, TODAY), null);
});

test("season speedster (rewatch): from the rewatch pointer, at the rewatch level", () => {
	const c = counts([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
	assert.deepEqual(firstSkippedSeason(order, c, tr(R, 1, 3), 2, TODAY), {
		firstSeason: 1,
		level: 2,
		refs: [3, 4, 5, 6].map((e) => ep(1, e)),
	});
	// Pointer already in the season → plain season mark
	assert.equal(
		firstSkippedSeason(order, counts([2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1]), tr(R, 2, 2), 2, TODAY),
		null,
	);
	// The combined mark (S1E3–E6 + S2) continues the rewatch to the end
	const after = counts(all(2));
	const marked = [...[3, 4, 5, 6].map((e) => ep(1, e)), ...[1, 2, 3, 4, 5, 6].map((e) => ep(2, e))];
	const r = computeTrackingAdvance(order, after, marked, tr(R, 1, 3), TODAY);
	assert.deepEqual([r.advance, r.nextEpisode, r.status], [true, null, C]);
});

test("season speedster copy", () => {
	const many = seasonSkipAheadCopy(1, 4, false);
	assert.equal(many.hint, "You've jumped ahead a few seasons. Mark Seasons 1–3 too, or just this season?");
	assert.deepEqual([many.confirmLabel, many.secondaryLabel], ["Mark S1–S4 Watched", "Just This Season"]);
	assert.match(seasonSkipAheadCopy(1, 2, false).hint, /ahead a season\. Mark Season 1 too/);
	assert.match(seasonSkipAheadCopy(2, 4, true).hint, /in this rewatch\. Rewatch the rest of Seasons 2–3/);
});

// ── "Start a Rewatch?" → Rewatch Up To Here ──
test("rewatch up to here: E1 → target at the new level, holes and extra counts left alone", () => {
	assert.deepEqual(
		rewatchUpToRefs(order, counts(all(1)), ep(2, 2)),
		[...[1, 2, 3, 4, 5, 6].map((e) => ep(1, e)), ep(2, 1), ep(2, 2)],
	);
	// S1E2 never watched (hole), S1E3 already ×2 (extra) → both skipped
	assert.deepEqual(rewatchUpToRefs(order, counts([1, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1]), ep(1, 5)), [
		ep(1, 1),
		ep(1, 4),
		ep(1, 5),
	]);
	// Unwatched target → nothing
	assert.deepEqual(rewatchUpToRefs(order, counts(all(0)), ep(1, 3)), []);
	// Marking them starts rewatch 1 continuing after the target
	const marked = rewatchUpToRefs(order, counts(all(1)), ep(2, 2));
	const after = counts([2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1]);
	const r = computeJumpFrom(order, after, marked, { status: C });
	assert.deepEqual(
		[r.advance, r.nextEpisode, r.status, r.incrementRewatch, r.rewatchCount],
		[true, ep(2, 3), R, true, 1],
	);
});

test("start rewatch copy: Up To Here only when it covers more than the one episode", () => {
	const multi = startRewatchCopy({ label: "S02E02", firstLabel: "S01E01", upTo: 8 });
	assert.deepEqual(
		[multi.confirmLabel, multi.secondaryLabel, multi.tertiaryLabel],
		["Rewatch Up To Here", "Rewatch From Here", "Just Mark It"],
	);
	assert.match(multi.hint, /S01E01–S02E02 \(8 episodes\)/);
	const one = startRewatchCopy({ label: "S01E01", firstLabel: "S01E01", upTo: 1 });
	assert.deepEqual(
		[one.confirmLabel, one.secondaryLabel, one.tertiaryLabel],
		["Rewatch From Here", "Just Mark It", undefined],
	);
});
