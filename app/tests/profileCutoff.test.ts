import { test } from "node:test";
import assert from "node:assert/strict";
import { crossesCutoff, cutoffPlacement, previewOrder } from "../src/utils/profileCutoff";
import { MediaType } from "../src/enums";
import type { CustomList } from "../src/types/customList";

/** A list with `n` titles */
const sized = (id: string, n: number): CustomList => ({
	id,
	name: id,
	items: Array.from({ length: n }, (_, i) => ({
		tmdbId: i,
		mediaType: MediaType.TV,
		title: String(i),
		posterPath: null,
		addedAt: i,
	})),
	createdAt: 1,
	updatedAt: 1,
});
const seven = ["a", "b", "c", "d", "e", "f", "g"].map((id) => sized(id, 2));
const ids = (set: Set<string>) => [...set].sort();

test("count 5 of 7: the last two are faded and the line sits on f's top", () => {
	const p = cutoffPlacement(seven, 5);
	assert.deepEqual(ids(p.dimmedIds), ["f", "g"]);
	assert.equal(p.lineTopId, "f");
	assert.equal(p.lineBottomId, null);
});

test("empty lists never count and are faded even above the line", () => {
	const lists = [sized("a", 1), sized("b", 0), sized("c", 2), sized("d", 3)];
	const p = cutoffPlacement(lists, 2);
	assert.deepEqual(ids(p.dimmedIds), ["b", "d"]);
	// a and c are shown; the first list after the last shown one is d
	assert.equal(p.lineTopId, "d");
});

test("count 0: everything is faded, the line is above the first list", () => {
	const p = cutoffPlacement(seven, 0);
	assert.equal(p.dimmedIds.size, 7);
	assert.equal(p.lineTopId, "a");
});

test("fewer non-empty lists than the count: no line when nothing follows the last shown one", () => {
	const p = cutoffPlacement([sized("a", 1), sized("b", 2)], 5);
	assert.equal(p.dimmedIds.size, 0);
	assert.equal(p.lineTopId, null);
	assert.equal(p.lineBottomId, null);
	// empties after the last shown one are faded and get the line
	const q = cutoffPlacement([sized("a", 1), sized("b", 0)], 5);
	assert.deepEqual(ids(q.dimmedIds), ["b"]);
	assert.equal(q.lineTopId, "b");
});

test("no lists: nothing", () => {
	const p = cutoffPlacement([], 5);
	assert.equal(p.dimmedIds.size, 0);
	assert.equal(p.lineTopId, null);
});

test("the line never rides the dragged list: it moves to the list above's bottom", () => {
	const p = cutoffPlacement(seven, 5, "f");
	assert.equal(p.lineTopId, null);
	assert.equal(p.lineBottomId, "e");
	// count 0 and the first list dragged: nothing to attach to
	const z = cutoffPlacement(seven, 0, "a");
	assert.equal(z.lineTopId, null);
	assert.equal(z.lineBottomId, null);
});

test("previewOrder follows the drag, and is the same array without one", () => {
	assert.equal(previewOrder(seven, null), seven);
	assert.deepEqual(
		previewOrder(seven, { id: "a", from: 0, to: 5 }).map((l) => l.id),
		["b", "c", "d", "e", "f", "a", "g"],
	);
	// an index past the end (the library asks about the slot after the last) changes nothing
	assert.equal(previewOrder(seven, { id: "a", from: 0, to: 7 }), seven);
});

test("dragging a shown list below the cutoff fades it and lifts the next one in", () => {
	const drag = { id: "a", from: 0, to: 0 };
	// still above the line at index 4 (b c d e a | f g)
	assert.equal(crossesCutoff(seven, drag, 4, 5), false);
	// one more slot (b c d e f a | g): a is now below the line
	assert.equal(crossesCutoff(seven, drag, 5, 5), true);
	const preview = previewOrder(seven, { ...drag, to: 5 });
	const p = cutoffPlacement(preview, 5, "a");
	assert.deepEqual(ids(p.dimmedIds), ["a", "g"]);
	assert.equal(p.lineBottomId, "f");
});

test("dragging a faded list up above the line flips it back", () => {
	const drag = { id: "g", from: 6, to: 6 };
	assert.equal(crossesCutoff(seven, drag, 5, 5), false);
	assert.equal(crossesCutoff(seven, drag, 4, 5), true);
});
