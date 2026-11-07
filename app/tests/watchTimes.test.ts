import { test } from "node:test";
import assert from "node:assert/strict";
import { watchTimesOnMark, watchTimeOnUnwatch } from "../src/utils/watchTimes";

const at = (ms: number) => ({ ms, toMillis: () => ms });
const FIRST = at(1_000);
const RUN4 = at(5_000);
const NOW = at(9_000);

test("watchTimesOnMark: a first watch gets watchedAt, nothing to pair", () => {
	assert.deepEqual(watchTimesOnMark(undefined, NOW), { lastWatchedAt: NOW, watchedAt: NOW });
});

test("watchTimesOnMark: a rewatch keeps the replaced last watch, paired with this one", () => {
	assert.deepEqual(watchTimesOnMark({ watchedAt: FIRST, lastWatchedAt: RUN4 }, NOW), {
		lastWatchedAt: NOW,
		prevWatchedAt: RUN4,
		prevWatchedFor: NOW,
	});
});

test("watchTimesOnMark: a record without lastWatchedAt pairs its first watch", () => {
	assert.equal(watchTimesOnMark({ watchedAt: FIRST }, NOW).prevWatchedAt, FIRST);
});

test("watchTimeOnUnwatch: one play off its paired watch → the watch before it", () => {
	const data = { watchedAt: FIRST, lastWatchedAt: NOW, prevWatchedAt: RUN4, prevWatchedFor: NOW };
	// Mid-rewatch, down to the rewatch floor: the previous run's time, not the first-ever watch
	assert.equal(watchTimeOnUnwatch(data, 1, 4, 4), RUN4);
	assert.equal(watchTimeOnUnwatch(data, 1, 4, 1), RUN4);
});

test("watchTimeOnUnwatch: a broken pair (a later bulk write) is ignored", () => {
	const data = { watchedAt: FIRST, lastWatchedAt: at(12_000), prevWatchedAt: RUN4, prevWatchedFor: NOW };
	assert.equal(watchTimeOnUnwatch(data, 1, 3, 1), null);
	assert.equal(watchTimeOnUnwatch(data, 1, 1, 1), FIRST);
});

test("watchTimeOnUnwatch: several plays off → first watch at the floor, else unchanged", () => {
	const data = { watchedAt: FIRST, lastWatchedAt: NOW, prevWatchedAt: RUN4, prevWatchedFor: NOW };
	assert.equal(watchTimeOnUnwatch(data, 2, 1, 1), FIRST);
	assert.equal(watchTimeOnUnwatch(data, 2, 3, 1), null);
});

test("watchTimeOnUnwatch: no watchedAt and no pair → unchanged; gone → nothing", () => {
	assert.equal(watchTimeOnUnwatch({ lastWatchedAt: NOW }, 1, 4, 4), null);
	assert.equal(
		watchTimeOnUnwatch({ watchedAt: FIRST, lastWatchedAt: NOW, prevWatchedAt: RUN4, prevWatchedFor: NOW }, 1, 0, 1),
		null,
	);
});
