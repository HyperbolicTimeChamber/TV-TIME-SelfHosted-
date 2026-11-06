import { test } from "node:test";
import assert from "node:assert/strict";
import { similar, similarProps } from "../src/utils/similarProps";

const onPress = () => {};
const card = (episode: number) => ({ title: "a", next: { season: 1, episode } });

test("a rebuilt card with the same content counts as equal", () => {
	assert.ok(similarProps({ item: card(1), onPress }, { item: card(1), onPress }));
});

test("changed content or a new callback counts as different", () => {
	assert.ok(!similarProps({ item: card(1), onPress }, { item: card(2), onPress }));
	assert.ok(!similarProps({ item: card(1), onPress }, { item: card(1), onPress: () => {} }));
	assert.ok(!similarProps<object>({ item: card(1) }, { item: card(1), isUpdating: true }));
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
