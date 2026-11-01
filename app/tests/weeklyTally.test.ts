import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyWeek, tallyOwnedBy } from "../src/utils/weeklyTally";

const at = (seconds: number) => ({ lastWatchedAt: { seconds, nanoseconds: 0 } });
const dayOf = (stamp: any) => (stamp ? `d${Math.floor(stamp.seconds / 100)}` : null);

test("tallyWeek: every watch counts on its own day", () => {
	const eps = [at(110), at(120), at(150), at(150), at(260)];
	assert.deepEqual(tallyWeek(eps, [at(130)], dayOf), {
		d1: { episodes: 4, movies: 1 },
		d2: { episodes: 1, movies: 0 },
	});
});

test("tallyWeek: watches without a stamp are skipped", () => {
	assert.deepEqual(tallyWeek([{}], [], dayOf), {});
});

test("a saved weekly tally only counts for the account that built it", () => {
	const days = { "2026-10-26": { episodes: 5, movies: 3 } };
	assert.equal(tallyOwnedBy({ userId: "a", days }, "a")?.days, days);
	// Another account's tally (or a legacy one with no owner) is dropped → rebuilt from the server
	assert.equal(tallyOwnedBy({ userId: "b", days }, "a"), null);
	assert.equal(tallyOwnedBy({ days }, "a"), null);
	assert.equal(tallyOwnedBy({ userId: "a", days }, undefined), null);
});
