import { test } from "node:test";
import assert from "node:assert/strict";
import { createRowStabilizer, similar } from "../src/utils/stableRows";

type Row = { key: string; card: { title: string; next: { season: number; episode: number } | null } };
const keyOf = (r: Row) => r.key;
const row = (key: string, episode: number): Row => ({
	key,
	card: { title: key, next: { season: 1, episode } },
});

test("an unchanged row keeps its object, a changed one is replaced", () => {
	const stabilize = createRowStabilizer<Row>(keyOf);
	const first = stabilize([row("a", 1), row("b", 1)]);
	const second = stabilize([row("a", 1), row("b", 2)]);
	assert.equal(second[0], first[0]);
	assert.notEqual(second[1], first[1]);
	assert.equal(second[1].card.next?.episode, 2);
});

test("nothing changed → the previous array itself", () => {
	const stabilize = createRowStabilizer<Row>(keyOf);
	const first = stabilize([row("a", 1), row("b", 1)]);
	assert.equal(stabilize([row("a", 1), row("b", 1)]), first);
});

test("reordered rows keep their objects in a new array", () => {
	const stabilize = createRowStabilizer<Row>(keyOf);
	const first = stabilize([row("a", 1), row("b", 1)]);
	const second = stabilize([row("b", 1), row("a", 1)]);
	assert.notEqual(second, first);
	assert.equal(second[0], first[1]);
	assert.equal(second[1], first[0]);
});

test("similar compares plain values only down to the given depth", () => {
	assert.ok(similar({ a: { b: 1 } }, { a: { b: 1 } }, 2));
	assert.ok(!similar({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } }, 2));
	class Stamp {
		constructor(readonly s: number) {}
	}
	// Class instances (e.g. Firestore Timestamps) compare by reference
	assert.ok(!similar({ t: new Stamp(1) }, { t: new Stamp(1) }, 3));
});
