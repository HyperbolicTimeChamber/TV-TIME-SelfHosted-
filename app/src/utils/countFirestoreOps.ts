import { recordFirestoreOps } from "../services/mixpanel";

/**
 * Wraps the modular Firestore functions so every read / write / delete is tallied for Mixpanel
 * (firestore_ops). Same shape on RNFirebase and the web SDK, so app (metro alias) and web
 * (platform/firestore.ts) share it — no call site changes.
 *
 * Approximates billing: cache hits count 0, a query counts max(docs, 1), a listener counts the
 * docs each server snapshot changes, batch / transaction ops count once they commit.
 */

type Fn = (...args: any[]) => any;

interface Snap {
	metadata?: { fromCache?: boolean };
	size?: number;
	docChanges?: () => unknown[];
}

export interface FirestoreOpFns {
	getDoc: Fn;
	getDocs: Fn;
	getDocFromServer: Fn;
	getDocsFromServer: Fn;
	getCountFromServer: Fn;
	onSnapshot: Fn;
	setDoc: Fn;
	updateDoc: Fn;
	addDoc: Fn;
	deleteDoc: Fn;
	writeBatch: Fn;
	runTransaction: Fn;
}

interface Tally {
	reads: number;
	writes: number;
	deletes: number;
}

const reads = (n: number) => recordFirestoreOps(n, 0, 0);
const fromServer = (snap: Snap) => !snap?.metadata?.fromCache;
// A query bills its docs, and one read when empty; a doc snapshot is one read
const snapReads = (snap: Snap) => (typeof snap?.size === "number" ? Math.max(snap.size, 1) : 1);

function afterRead(promise: Promise<Snap>, serverOnly = false) {
	return promise.then((snap) => {
		if (serverOnly || fromServer(snap)) reads(snapReads(snap));
		return snap;
	});
}

function afterWrite<T>(promise: Promise<T>, writes: number, deletes: number) {
	return promise.then((result) => {
		recordFirestoreOps(0, writes, deletes);
		return result;
	});
}

/** Listener: count what each server snapshot delivers */
function countingListener(onNext: (snap: Snap) => void) {
	return (snap: Snap) => {
		if (fromServer(snap)) {
			reads(typeof snap.docChanges === "function" ? snap.docChanges().length : 1);
		}
		onNext(snap);
	};
}

/** Batch / transaction stand-in: queues the same ops, counting into `tally` */
function countingWriter<W extends Record<string, Fn>>(target: W, tally: Tally): W {
	const proxy: Record<string, Fn> = {
		set: (...a) => (target.set(...a), tally.writes++, proxy),
		update: (...a) => (target.update(...a), tally.writes++, proxy),
		delete: (...a) => (target.delete(...a), tally.deletes++, proxy),
	};
	if (typeof target.get === "function") {
		proxy.get = (...a) => target.get(...a).then((snap: Snap) => (tally.reads++, snap));
	}
	if (typeof target.commit === "function") {
		proxy.commit = (...a) =>
			target.commit(...a).then((result: unknown) => {
				recordFirestoreOps(tally.reads, tally.writes, tally.deletes);
				return result;
			});
	}
	return proxy as W;
}

export function countFirestoreOps<B extends FirestoreOpFns>(
	base: B,
): Pick<B, keyof FirestoreOpFns> {
	const counted: FirestoreOpFns = {
		getDoc: (...a) => afterRead(base.getDoc(...a)),
		getDocs: (...a) => afterRead(base.getDocs(...a)),
		getDocFromServer: (...a) => afterRead(base.getDocFromServer(...a), true),
		getDocsFromServer: (...a) => afterRead(base.getDocsFromServer(...a), true),
		getCountFromServer: (...a) => base.getCountFromServer(...a).then((r: unknown) => (reads(1), r)),
		setDoc: (...a) => afterWrite(base.setDoc(...a), 1, 0),
		updateDoc: (...a) => afterWrite(base.updateDoc(...a), 1, 0),
		addDoc: (...a) => afterWrite(base.addDoc(...a), 1, 0),
		deleteDoc: (...a) => afterWrite(base.deleteDoc(...a), 0, 1),
		onSnapshot: (ref, ...rest) => {
			// onNext is the first function, or an observer's `next`
			const i = rest.findIndex(
				(arg) => typeof arg === "function" || typeof arg?.next === "function",
			);
			if (i >= 0) {
				const arg = rest[i];
				rest[i] =
					typeof arg === "function"
						? countingListener(arg)
						: { ...arg, next: countingListener(arg.next.bind(arg)) };
			}
			return base.onSnapshot(ref, ...rest);
		},
		writeBatch: (...a) =>
			countingWriter(base.writeBatch(...a), { reads: 0, writes: 0, deletes: 0 }),
		runTransaction: (db, update: Fn, ...rest) => {
			// Retries rerun `update` — only the attempt that commits counts
			let tally: Tally = { reads: 0, writes: 0, deletes: 0 };
			return base
				.runTransaction(
					db,
					(tx: Record<string, Fn>) => {
						tally = { reads: 0, writes: 0, deletes: 0 };
						return update(countingWriter(tx, tally));
					},
					...rest,
				)
				.then((result: unknown) => {
					recordFirestoreOps(tally.reads, tally.writes, tally.deletes);
					return result;
				});
		},
	};
	return counted as unknown as Pick<B, keyof FirestoreOpFns>;
}
