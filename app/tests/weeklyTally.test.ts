import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyWeek } from "../src/utils/weeklyTally";

// Stamps as Firestore gives them; the day is just the seconds bucketed for the test
const at = (seconds: number, nanoseconds = 0) => ({ lastWatchedAt: { seconds, nanoseconds } });
const dayOf = (stamp: any) => (stamp ? `d${Math.floor(stamp.seconds / 100)}` : null);

test("tallyWeek: bulk marks (one shared stamp) don't count; single marks do", () => {
	const season = Array.from({ length: 22 }, () => at(150, 7)); // one bulk season mark
	const singles = [at(110, 1), at(120, 2), at(260, 3)];
	const days = tallyWeek([...season, ...singles], [at(130, 4)], dayOf);
	assert.deepEqual(days, {
		d1: { episodes: 2, movies: 1 },
		d2: { episodes: 1, movies: 0 },
	});
});

test("tallyWeek: same second, different nanoseconds are separate marks", () => {
	const days = tallyWeek([at(150, 1), at(150, 2)], [], dayOf);
	assert.deepEqual(days, { d1: { episodes: 2, movies: 0 } });
});
