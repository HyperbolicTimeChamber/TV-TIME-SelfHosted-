import { test } from "node:test";
import assert from "node:assert/strict";
import {
	applyTrackingChanges,
	compareTimestamps,
	latestUpdate,
	reviveTimestamps,
	type SyncDoc,
	type TrackingChange,
} from "../src/utils/trackingSync";
import { stampTrackingWrites } from "../src/utils/stampTrackingWrites";
import { TRACKING_UPDATED_AT, UserCollection } from "../src/enums";

const ts = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });
const d = (id: string, priority: number, updated?: number): SyncDoc => ({
	id,
	priorityDate: ts(priority),
	...(updated !== undefined ? { updatedAt: ts(updated) } : {}),
});
const ids = (docs: SyncDoc[]) => docs.map((x) => x.id);
const up = (doc: SyncDoc): TrackingChange<SyncDoc> => ({ kind: "upsert", doc });

test("compareTimestamps orders by seconds then nanoseconds; missing is earliest", () => {
	assert.ok(compareTimestamps(ts(1, 5), ts(1, 6)) < 0);
	assert.ok(compareTimestamps(ts(2), ts(1, 999)) > 0);
	assert.equal(compareTimestamps(ts(3, 3), ts(3, 3)), 0);
	assert.ok(compareTimestamps(null, ts(0)) < 0);
	assert.equal(compareTimestamps(undefined, null), 0);
});

test("applyTrackingChanges keeps the saved docs an exact prefix of the page order", () => {
	// Saved: first page of a longer list (hasMore), last saved doc = c (priority 70)
	const saved = [d("a", 90, 1), d("b", 80, 1), d("c", 70, 1)];
	// Marked on another device → priority now → joins at the top
	const lifted = applyTrackingChanges(saved, [up(d("z", 100, 5))], true);
	assert.deepEqual(ids(lifted), ["z", "a", "b", "c"]);
	// A doc below the last saved one stays out (its page brings it)
	assert.equal(applyTrackingChanges(saved, [up(d("y", 10, 5))], true), saved);
	// A saved doc that moved below the boundary leaves
	assert.deepEqual(ids(applyTrackingChanges(saved, [up(d("a", 5, 5))], true)), ["b", "c"]);
	// Everything loaded (no more pages) → anything joins
	assert.deepEqual(ids(applyTrackingChanges(saved, [up(d("y", 10, 5))], false)), [
		"a",
		"b",
		"c",
		"y",
	]);
	// Same priority: doc id desc, like Firestore's implicit __name__ order
	assert.deepEqual(ids(applyTrackingChanges([d("m", 50, 1)], [up(d("q", 50, 2))], false)), [
		"q",
		"m",
	]);
});

test("applyTrackingChanges ignores stale copies and honours the deletion log", () => {
	const saved = [d("a", 90, 10), d("b", 80, 10)];
	// Older copy than the saved one (overlap re-delivery) → nothing changes
	assert.equal(applyTrackingChanges(saved, [up(d("a", 95, 9))], true), saved);
	// Deletion log entry newer than the saved copy → gone
	assert.deepEqual(
		ids(applyTrackingChanges(saved, [{ kind: "delete", id: "a", at: ts(11) }], true)),
		["b"],
	);
	// Older than a re-add → the re-added copy stays
	assert.equal(applyTrackingChanges(saved, [{ kind: "delete", id: "a", at: ts(5) }], true), saved);
	// Unknown id → same array
	assert.equal(applyTrackingChanges(saved, [{ kind: "delete", id: "x", at: ts(50) }], true), saved);
	// A local insert (no updatedAt) is replaced by the server's stamped copy
	const local = applyTrackingChanges(saved, [up(d("n", 100))], true);
	const confirmed = applyTrackingChanges(local, [up({ ...d("n", 100, 12), id: "n" })], true);
	assert.deepEqual(confirmed[0].updatedAt, ts(12));
	// Without priorityDate Firestore pages never return it → out
	assert.deepEqual(
		ids(applyTrackingChanges(saved, [up({ id: "a", priorityDate: null, updatedAt: ts(20) })], true)),
		["b"],
	);
});

test("latestUpdate keeps the newest stamp and skips docs without one", () => {
	assert.deepEqual(latestUpdate(ts(5), [{ updatedAt: ts(3) }, { updatedAt: ts(7, 1) }, {}]), ts(7, 1));
	assert.equal(latestUpdate(null, []), null);
});

test("reviveTimestamps restores saved { seconds, nanoseconds } at any depth only", () => {
	const make = (s: number, ns: number) => ({ seconds: s, nanoseconds: ns, revived: true });
	const out = reviveTimestamps(
		{
			priorityDate: { seconds: 1, nanoseconds: 2 },
			web: { seconds: 3, nanoseconds: 4, type: "firestore/timestamp/1.1.0" },
			nextEpisode: { season: 1, episode: 2 },
			list: [{ seconds: 5, nanoseconds: 6 }],
			plain: "x",
		},
		make,
	);
	assert.deepEqual(out.priorityDate, make(1, 2));
	assert.deepEqual(out.web, make(3, 4));
	assert.deepEqual(out.nextEpisode, { season: 1, episode: 2 });
	assert.deepEqual(out.list[0], make(5, 6));
	assert.equal(out.plain, "x");
});

test("stampTrackingWrites stamps tracking writes and logs tracking deletes", async () => {
	const calls: Array<[string, ...unknown[]]> = [];
	const STAMP = { serverTime: true };
	const ref = (path: string) => ({ path, firestore: "db" });
	const batchOps = () => ({
		set: (...a: unknown[]) => calls.push(["batch.set", ...a]),
		update: (...a: unknown[]) => calls.push(["batch.update", ...a]),
		delete: (...a: unknown[]) => calls.push(["batch.delete", ...a]),
		commit: async () => calls.push(["commit"]),
	});
	const fns = stampTrackingWrites({
		doc: (_db: unknown, ...segments: string[]) => ref(segments.join("/")),
		setDoc: async (...a: unknown[]) => calls.push(["setDoc", ...a]),
		updateDoc: async (...a: unknown[]) => calls.push(["updateDoc", ...a]),
		deleteDoc: async (...a: unknown[]) => calls.push(["deleteDoc", ...a]),
		writeBatch: batchOps,
		runTransaction: async (_db: unknown, fn: (tx: unknown) => unknown) => fn(batchOps()),
		serverTimestamp: () => STAMP,
		Timestamp: { fromMillis: (ms: number) => ({ ms }) },
	});
	const tracking = ref(`users/u1/${UserCollection.TRACKING}/tv_1`);
	const other = ref("users/u1/watchedEpisodes/1_S01E01");

	await fns.setDoc(tracking, { status: "watching" }, { merge: true });
	assert.deepEqual(calls.pop(), [
		"setDoc",
		tracking,
		{ status: "watching", [TRACKING_UPDATED_AT]: STAMP },
		{ merge: true },
	]);
	await fns.setDoc(other, { runtime: 1 });
	assert.deepEqual(calls.pop(), ["setDoc", other, { runtime: 1 }]);
	await fns.updateDoc(tracking, "status", "paused");
	assert.deepEqual(calls.pop(), ["updateDoc", tracking, "status", "paused", TRACKING_UPDATED_AT, STAMP]);

	const batch = fns.writeBatch("db");
	batch.update(tracking, { rewatchCount: 1 });
	batch.delete(tracking);
	batch.delete(other);
	const ops = calls.splice(0);
	assert.deepEqual(ops[0], ["batch.update", tracking, { rewatchCount: 1, [TRACKING_UPDATED_AT]: STAMP }]);
	assert.deepEqual(ops[1], ["batch.delete", tracking]);
	assert.equal(ops[2][0], "batch.set");
	assert.deepEqual(ops[2][1], ref(`users/u1/${UserCollection.TRACKING_DELETIONS}/tv_1`));
	const entry = ops[2][2] as Record<string, unknown>;
	assert.equal(entry[TRACKING_UPDATED_AT], STAMP);
	assert.ok((entry.expireAt as { ms: number }).ms > Date.now());
	// Non-tracking delete: no log entry
	assert.deepEqual(ops.slice(3), [["batch.delete", other]]);

	// deleteDoc on a tracking doc → one batch: delete + log entry
	await fns.deleteDoc(tracking);
	assert.deepEqual(
		calls.splice(0).map((c) => c[0]),
		["batch.delete", "batch.set", "commit"],
	);
	// Transaction writes are stamped too
	await fns.runTransaction("db", async (tx: any) => tx.set(tracking, { status: "paused" }));
	assert.deepEqual(calls.pop(), [
		"batch.set",
		tracking,
		{ status: "paused", [TRACKING_UPDATED_AT]: STAMP },
	]);
});

test("applyTrackingChanges keeps the saved object for a re-delivered same version", () => {
	const saved = [d("a", 90, 10)];
	assert.equal(applyTrackingChanges(saved, [up(d("a", 90, 10))], true), saved);
	// Local inserts (no stamp) are replaceable by another local copy
	const local = [d("n", 90)];
	assert.notEqual(applyTrackingChanges(local, [up(d("n", 95))], true), local);
});
