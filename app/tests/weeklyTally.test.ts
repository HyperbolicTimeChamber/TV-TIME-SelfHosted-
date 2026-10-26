import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyWeek } from "../src/utils/weeklyTally";

// Stamps as Firestore gives them; the day is just the seconds bucketed for the test
const at = (seconds: number, nanoseconds = 0, runtime = 30) => ({
	lastWatchedAt: { seconds, nanoseconds },
	runtime,
});
const dayOf = (stamp: any) => (stamp ? `d${Math.floor(stamp.seconds / 100)}` : null);

test("tallyWeek: a small bulk mark counts like any other watch", () => {
	// Woah There Speedster "mark all": 4 earlier episodes in one go, plus the one watched
	const speedster = Array.from({ length: 4 }, () => at(150, 7));
	const days = tallyWeek([...speedster, at(151, 1)], [], dayOf);
	assert.deepEqual(days, { d1: { episodes: 5, movies: 0 } });
});

test("tallyWeek: a day holds at most 24 hours of watching", () => {
	// 89 half-hour episodes marked at once would be 44.5 hours; only 48 fit in a day
	const bulk = Array.from({ length: 89 }, () => at(150, 7));
	assert.deepEqual(tallyWeek(bulk, [], dayOf), { d1: { episodes: 48, movies: 0 } });
});

test("tallyWeek: single marks and movies fill the day before bulk marks", () => {
	const bulk = Array.from({ length: 60 }, () => at(150, 7, 30));
	const singles = [at(110, 1, 60), at(120, 2, 60)]; // 2h
	const movies = [at(130, 3, 120)]; // 2h
	// 24h - 4h = 20h left → 40 of the bulk half-hours
	assert.deepEqual(tallyWeek([...bulk, ...singles], movies, dayOf), {
		d1: { episodes: 42, movies: 1 },
	});
});

test("tallyWeek: unknown runtimes count as 45 min (episode) / 2h (movie)", () => {
	const bulk = Array.from({ length: 60 }, () => at(150, 7, 0));
	// 24h / 45 min = 32
	assert.deepEqual(tallyWeek(bulk, [], dayOf), { d1: { episodes: 32, movies: 0 } });
});

test("tallyWeek: each day has its own 24 hours", () => {
	const dayOne = Array.from({ length: 50 }, () => at(150, 7));
	const dayTwo = [at(250, 1)];
	assert.deepEqual(tallyWeek([...dayOne, ...dayTwo], [], dayOf), {
		d1: { episodes: 48, movies: 0 },
		d2: { episodes: 1, movies: 0 },
	});
});
