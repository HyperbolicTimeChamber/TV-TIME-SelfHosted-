import { test } from "node:test";
import assert from "node:assert/strict";
import { coldStartHistory, safeHistory } from "../src/utils/watchedHistory";

const at = (time: number, id = String(time)) => ({ id, time });
const times = (items: { time: number }[]) => items.map((i) => i.time);

test("safeHistory: both types have more pages → only rows newer than the later oldest", () => {
	const eps = [at(90), at(70), at(50)];
	const movies = [at(80), at(60)];
	assert.deepEqual(times(safeHistory(eps, movies, true, true)), [60, 70, 80, 90]);
});

test("safeHistory: one type exhausted → the other's pages bound the window", () => {
	assert.deepEqual(times(safeHistory([at(90), at(50)], [at(80), at(10)], true, false)), [50, 80, 90]);
	assert.deepEqual(times(safeHistory([], [at(80), at(10)], false, false)), [10, 80]);
	assert.deepEqual(times(safeHistory([], [at(80)], true, false)), []);
});

test("coldStartHistory: a mark that grew the first page past its size isn't in a fresh load", () => {
	// 6 episodes in memory (a mark added one to the first page of 5), 1 movie, both exhausted
	// as far as this session knows — a cold start fetches only the newest 5 episodes
	const eps = [at(100), at(90), at(80), at(70), at(60), at(10)];
	const movies = [at(65)];
	assert.deepEqual(times(safeHistory(eps, movies, false, false)), [10, 60, 65, 70, 80, 90, 100]);
	assert.deepEqual(times(coldStartHistory(eps, movies, false, false, 5, 5)), [60, 65, 70, 80, 90, 100]);
});

test("coldStartHistory: pages already within their size → same rows as the session", () => {
	const eps = [at(100), at(90), at(80)];
	const movies = [at(95), at(20)];
	assert.deepEqual(
		times(coldStartHistory(eps, movies, false, false, 5, 5)),
		times(safeHistory(eps, movies, false, false)),
	);
});

test("coldStartHistory: unsorted input (a rewatch bumped an old row) is ranked by time", () => {
	const eps = [at(50), at(100), at(90), at(80), at(70), at(60)];
	assert.deepEqual(times(coldStartHistory(eps, [], false, false, 5, 5)), [60, 70, 80, 90, 100]);
});
