import { DocChangeType } from "../enums";

interface DocChange {
	id: string;
	type: DocChangeType;
}

export interface SnapshotTicket {
	seq: number;
	/** Docs changed since the last applied snapshot, this one's included */
	changed: Set<string>;
	/** The subset that were removed */
	removed: Set<string>;
}

/**
 * Orders a listener's snapshots when each is processed asynchronously. A cold start delivers the
 * offline cache first, then the server's copy; the cache pass enriches the whole list and can
 * finish last, writing stale data over fresh (an episode marked on another device never showed
 * up). Only the newest snapshot may apply, and doc changes from snapshots skipped that way carry
 * over to it — an incremental pass only re-enriches what changed since the last applied one.
 */
export function createSnapshotSequencer() {
	let seq = 0;
	const changed = new Set<string>();
	const removed = new Set<string>();
	return {
		/** On every snapshot, as it arrives */
		receive(changes: DocChange[]) {
			seq++;
			for (const c of changes) {
				changed.add(c.id);
				if (c.type === DocChangeType.REMOVED) removed.add(c.id);
			}
		},
		/** When processing starts */
		begin(): SnapshotTicket {
			return { seq, changed: new Set(changed), removed: new Set(removed) };
		},
		/** After the async work: true → apply it. False → a newer snapshot will */
		commit(ticket: SnapshotTicket): boolean {
			if (ticket.seq !== seq) return false;
			for (const id of ticket.changed) changed.delete(id);
			for (const id of ticket.removed) removed.delete(id);
			return true;
		},
	};
}
