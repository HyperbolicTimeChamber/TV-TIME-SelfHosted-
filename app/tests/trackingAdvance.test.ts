import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrackingAdvance, computeJumpFrom, epKey, EpisodeRef } from "../src/utils";
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
