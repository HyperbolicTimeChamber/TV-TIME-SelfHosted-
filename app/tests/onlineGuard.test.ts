import { test } from "node:test";
import assert from "node:assert/strict";
import { createOnlineGuard } from "../src/utils/onlineGuard";

function setup(online: boolean) {
	let state = online;
	let blocked = 0;
	const guard = createOnlineGuard(
		() => state,
		() => {
			blocked++;
		},
	);
	return {
		guard,
		setOnline: (v: boolean) => {
			state = v;
		},
		blocked: () => blocked,
	};
}

test("online: the action runs and no popup opens", () => {
	const s = setup(true);
	assert.equal(s.guard(), true);
	assert.equal(s.blocked(), 0);
});

test("offline: the action is refused and the popup opens", () => {
	const s = setup(false);
	assert.equal(s.guard(), false);
	assert.equal(s.blocked(), 1);
});

test("reads the state at call time: back online runs again", () => {
	const s = setup(false);
	assert.equal(s.guard(), false);
	s.setOnline(true);
	assert.equal(s.guard(), true);
	assert.equal(s.blocked(), 1);
});

test("every refused try opens the popup", () => {
	const s = setup(false);
	s.guard();
	s.guard();
	assert.equal(s.blocked(), 2);
});
