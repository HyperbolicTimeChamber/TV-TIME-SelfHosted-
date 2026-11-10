import { test } from "node:test";
import assert from "node:assert/strict";
import { createConnectivityGate } from "../src/utils/connectivityGate";

function fakeTimers() {
	let now = 0;
	let next = 1;
	const queue = new Map<number, { at: number; fn: () => void }>();
	return {
		timers: {
			set: (fn: () => void, ms: number) => {
				const id = next++;
				queue.set(id, { at: now + ms, fn });
				return id;
			},
			clear: (id: unknown) => void queue.delete(id as number),
		},
		advance(ms: number) {
			now += ms;
			for (const [id, t] of [...queue]) {
				if (t.at <= now) {
					queue.delete(id);
					t.fn();
				}
			}
		},
	};
}

test("a short drop (Wi-Fi ↔ cellular handover) never reports offline", () => {
	const clock = fakeTimers();
	const seen: boolean[] = [];
	const gate = createConnectivityGate((c) => seen.push(c), 2000, clock.timers);
	gate.update(false);
	clock.advance(600);
	gate.update(true);
	clock.advance(5000);
	assert.deepEqual(seen, [true]);
});

test("offline is reported once it lasts the whole delay, online at once", () => {
	const clock = fakeTimers();
	const seen: boolean[] = [];
	const gate = createConnectivityGate((c) => seen.push(c), 2000, clock.timers);
	gate.update(false);
	clock.advance(1999);
	assert.deepEqual(seen, []);
	gate.update(false); // repeated offline events don't restart the wait
	clock.advance(1);
	assert.deepEqual(seen, [false]);
	gate.update(true);
	assert.deepEqual(seen, [false, true]);
});

test("unknown (null) changes nothing", () => {
	const clock = fakeTimers();
	const seen: boolean[] = [];
	const gate = createConnectivityGate((c) => seen.push(c), 2000, clock.timers);
	gate.update(null);
	clock.advance(5000);
	assert.deepEqual(seen, []);
	gate.update(false);
	gate.update(null);
	clock.advance(2000);
	assert.deepEqual(seen, [false]);
});

test("dispose drops a pending offline", () => {
	const clock = fakeTimers();
	const seen: boolean[] = [];
	const gate = createConnectivityGate((c) => seen.push(c), 2000, clock.timers);
	gate.update(false);
	gate.dispose();
	clock.advance(5000);
	assert.deepEqual(seen, []);
});
