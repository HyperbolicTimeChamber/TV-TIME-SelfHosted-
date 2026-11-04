import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("firebase.json native callable pool matches NATIVE_CALLABLE_THREADS; foreground keeps its threads", async () => {
	const { NATIVE_CALLABLE_THREADS, FOREGROUND_RESERVED_THREADS } = await import("../src/enums");
	const { BACKGROUND_CONCURRENCY } = await import("../src/services/callQueue");
	const json = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "firebase.json"), "utf8"));
	assert.equal(
		json["react-native"].android_task_executor_maximum_pool_size,
		NATIVE_CALLABLE_THREADS,
	);
	assert.ok(FOREGROUND_RESERVED_THREADS >= 1);
	assert.equal(BACKGROUND_CONCURRENCY + FOREGROUND_RESERVED_THREADS, NATIVE_CALLABLE_THREADS);
});

test("background calls never exceed their share, and wait while a foreground call runs", async () => {
	const { backgroundCall, foregroundCall, BACKGROUND_CONCURRENCY } =
		await import("../src/services/callQueue");
	let live = 0;
	let peak = 0;
	const releases: Array<() => void> = [];
	const bg = () =>
		backgroundCall(
			() =>
				new Promise<void>((resolve) => {
					live++;
					peak = Math.max(peak, live);
					releases.push(() => {
						live--;
						resolve();
					});
				}),
		);
	let fgDone!: () => void;
	const fg = foregroundCall(() => new Promise<void>((r) => (fgDone = r)));
	const all = Array.from({ length: 10 }, bg);
	await new Promise((r) => setTimeout(r, 0));
	assert.equal(live, 0, "no background call starts while a foreground call is in flight");
	fgDone();
	await fg;
	await new Promise((r) => setTimeout(r, 0));
	assert.equal(live, BACKGROUND_CONCURRENCY);
	while (releases.length) {
		releases.shift()!();
		await new Promise((r) => setTimeout(r, 0));
	}
	await Promise.all(all);
	assert.equal(peak, BACKGROUND_CONCURRENCY);
});
