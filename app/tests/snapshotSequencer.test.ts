import { test } from "node:test";
import assert from "node:assert/strict";
import { createSnapshotSequencer } from "../src/utils/snapshotSequencer";
import { DocChangeType } from "../src/enums";

const mod = (id: string) => ({ id, type: DocChangeType.MODIFIED });
const del = (id: string) => ({ id, type: DocChangeType.REMOVED });

test("an older snapshot finishing last can't overwrite a newer one", () => {
	const s = createSnapshotSequencer();
	s.receive([mod("a")]);
	const cached = s.begin(); // offline-cache snapshot, slow to enrich
	s.receive([mod("b")]);
	const fresh = s.begin(); // server snapshot
	assert.equal(s.commit(fresh), true);
	assert.equal(s.commit(cached), false);
});

test("changes of a skipped snapshot carry into the next one", () => {
	const s = createSnapshotSequencer();
	s.receive([mod("a")]);
	const first = s.begin();
	s.receive([mod("b"), del("c")]);
	const second = s.begin();
	assert.deepEqual([...second.changed].sort(), ["a", "b", "c"]);
	assert.deepEqual([...second.removed], ["c"]);
	assert.equal(s.commit(second), true);
	assert.equal(s.commit(first), false);
	// Everything applied: nothing left over for the next snapshot
	s.receive([mod("d")]);
	assert.deepEqual([...s.begin().changed], ["d"]);
});

test("a change arriving mid-enrich stays pending after the commit", () => {
	const s = createSnapshotSequencer();
	s.receive([mod("a")]);
	const t = s.begin();
	s.receive([mod("b")]); // listener fired again, its own begin() not run yet
	assert.equal(s.commit(t), false); // superseded by the snapshot carrying b
	const next = s.begin();
	assert.deepEqual([...next.changed].sort(), ["a", "b"]);
});
