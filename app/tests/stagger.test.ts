import { test } from "node:test";
import assert from "node:assert/strict";
import { batchEndOffsets } from "../src/utils/stagger";

const MIN = 60_000;

test("batchEndOffsets: the last batch ends now, earlier ones end where the next starts", () => {
	// S1: 2 × 30m, S2: 20m + 40m, S3: 1 × 25m
	assert.deepEqual(batchEndOffsets([[30, 30], [20, 40], [25]]), [85 * MIN, 25 * MIN, 0]);
});

test("batchEndOffsets: unknown runtimes count as 45 minutes", () => {
	assert.deepEqual(batchEndOffsets([[0, 0], [10]]), [10 * MIN, 0]);
});

test("staggerFinishTimes (app): same layout as the function writes", async () => {
	const { staggerFinishTimes } = await import("../src/utils/stagger");
	const end = 1_000 * MIN;
	assert.deepEqual(staggerFinishTimes([30, 0, 40], end), [end - 85 * MIN, end - 40 * MIN, end]);
});

test("packed (Speedster backfill): a second apart ending now, runtimes ignored", async () => {
	const { staggerFinishTimes, PACKED_MARK_GAP_MS } = await import("../src/utils/stagger");
	const end = 1_000_000_000;
	assert.deepEqual(staggerFinishTimes([22, 0, 45], end, true), [
		end - 2 * PACKED_MARK_GAP_MS,
		end - PACKED_MARK_GAP_MS,
		end,
	]);
	// Seasons of one packed catch-up still lay end to end, a second per episode
	assert.deepEqual(batchEndOffsets([[30, 30], [20]], true), [PACKED_MARK_GAP_MS, 0]);
});
