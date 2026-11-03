/**
 * Delta sync for users/{uid}/tracking: the watchlist keeps the pages it has loaded on the device
 * and only reads docs whose `updatedAt` moved since the last sync (plus deletion log entries).
 * Pure helpers — the store (hooks/trackingStore) does the Firestore + AsyncStorage side.
 *
 * The saved docs are always an exact prefix of the Firestore page order (priorityDate desc, doc
 * id desc): everything at or above the last saved doc, nothing below it. Pagination continues
 * from that last doc, and a change only lands in the saved set when it sorts inside that prefix.
 */

/** Firestore Timestamp on both SDKs (RNFirebase + web): exact compare needs the parts */
export interface TimestampLike {
	seconds: number;
	nanoseconds: number;
	toMillis?: () => number;
}

export interface SyncDoc {
	id: string;
	priorityDate?: TimestampLike | null;
	updatedAt?: TimestampLike | null;
}

export type TrackingChange<T extends SyncDoc> =
	| { kind: "upsert"; doc: T }
	/** `at`: the deletion log entry's time; undefined = the listener saw the doc go */
	| { kind: "delete"; id: string; at?: TimestampLike | null };

function isTimestamp(v: unknown): v is TimestampLike {
	return (
		!!v &&
		typeof v === "object" &&
		typeof (v as TimestampLike).seconds === "number" &&
		typeof (v as TimestampLike).nanoseconds === "number"
	);
}

/** <0 when a is earlier. A missing timestamp is earlier than any real one */
export function compareTimestamps(
	a: TimestampLike | null | undefined,
	b: TimestampLike | null | undefined,
): number {
	const ha = isTimestamp(a);
	const hb = isTimestamp(b);
	if (!ha || !hb) return (ha ? 1 : 0) - (hb ? 1 : 0);
	return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
}

/** Firestore page order: priorityDate desc, then doc id desc (the implicit __name__ order) */
export function compareTrackingOrder(a: SyncDoc, b: SyncDoc): number {
	return (
		compareTimestamps(b.priorityDate, a.priorityDate) ||
		(a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
	);
}

/**
 * Applies listener changes to the saved docs. Returns the same array when nothing changed.
 * - an older or same-version copy than the saved one is ignored (a deletion log entry older
 *   than a re-add, too)
 * - with more pages left, a doc that now sorts below the last saved doc leaves the saved set —
 *   its page brings it back; one that moved up into the prefix (marked on another device) joins
 */
export function applyTrackingChanges<T extends SyncDoc>(
	docs: T[],
	changes: TrackingChange<T>[],
	hasMore: boolean,
): T[] {
	if (changes.length === 0) return docs;
	const byId = new Map(docs.map((d) => [d.id, d]));
	let changed = false;
	for (const change of changes) {
		if (change.kind === "delete") {
			const saved = byId.get(change.id);
			if (!saved) continue;
			if (change.at && compareTimestamps(change.at, saved.updatedAt) < 0) continue;
			byId.delete(change.id);
			changed = true;
			continue;
		}
		const { doc } = change;
		const saved = byId.get(doc.id);
		// Older copy, or the same version again (the listener's overlap re-delivers it) → keep
		// the saved object, so nothing downstream re-processes it
		if (saved) {
			const age = compareTimestamps(doc.updatedAt, saved.updatedAt);
			if (age < 0 || (age === 0 && saved.updatedAt)) continue;
		}
		// Without priorityDate Firestore's page query never returns it
		if (!isTimestamp(doc.priorityDate)) {
			if (saved) {
				byId.delete(doc.id);
				changed = true;
			}
			continue;
		}
		if (hasMore) {
			let last: T | undefined;
			for (const d of byId.values()) {
				if (d.id === doc.id) continue;
				if (!last || compareTrackingOrder(d, last) > 0) last = d;
			}
			if (last && compareTrackingOrder(doc, last) > 0) {
				if (saved) {
					byId.delete(doc.id);
					changed = true;
				}
				continue;
			}
		}
		byId.set(doc.id, doc);
		changed = true;
	}
	if (!changed) return docs;
	return [...byId.values()].sort(compareTrackingOrder);
}

/** Newest `updatedAt` among the docs (and `since`) — the next delta listener starts there */
export function latestUpdate(
	since: TimestampLike | null,
	docs: Array<{ updatedAt?: TimestampLike | null }>,
): TimestampLike | null {
	let latest = since;
	for (const d of docs) {
		if (isTimestamp(d.updatedAt) && compareTimestamps(d.updatedAt, latest) > 0) latest = d.updatedAt;
	}
	return latest;
}

/** JSON-safe Timestamp: { seconds, nanoseconds } (both SDKs' toJSON add at most a `type`) */
export function plainTimestamp(ts: TimestampLike): { seconds: number; nanoseconds: number } {
	return { seconds: ts.seconds, nanoseconds: ts.nanoseconds };
}

/** Turns saved { seconds, nanoseconds } objects back into Timestamps, at any depth */
export function reviveTimestamps<V>(
	value: V,
	make: (seconds: number, nanoseconds: number) => TimestampLike,
): V {
	if (Array.isArray(value)) return value.map((v) => reviveTimestamps(v, make)) as V;
	if (!value || typeof value !== "object") return value;
	const keys = Object.keys(value);
	if (
		isTimestamp(value) &&
		keys.every((k) => k === "seconds" || k === "nanoseconds" || k === "type")
	) {
		return make(value.seconds, value.nanoseconds) as V;
	}
	const out: Record<string, unknown> = {};
	for (const k of keys) out[k] = reviveTimestamps((value as Record<string, unknown>)[k], make);
	return out as V;
}

/** Splits the saved docs into values of `size` (Android reads one value through a ~1M-char window) */
export function chunk<T>(list: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
}
