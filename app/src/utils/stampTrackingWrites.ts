import {
	TRACKING_DELETION_TTL_MS,
	TRACKING_UPDATED_AT,
	UserCollection,
} from "../enums";

/**
 * Tracking delta sync, client side: every write to users/{uid}/tracking/{id} gets
 * `updatedAt: serverTimestamp()`, and every delete also writes users/{uid}/trackingDeletions/{id}
 * in the same batch — so another device's delta listener sees it. Wraps the modular functions
 * (app: metro alias, web: platform/firestore.ts), so no call site can forget it; firestore.rules
 * holds the written `updatedAt` to request.time.
 */

type Fn = (...args: any[]) => any;

export interface StampFns {
	doc: Fn;
	setDoc: Fn;
	updateDoc: Fn;
	deleteDoc: Fn;
	writeBatch: Fn;
	runTransaction: Fn;
	serverTimestamp: Fn;
	Timestamp: { fromMillis: (ms: number) => unknown };
}

interface Ref {
	path?: string;
	firestore?: unknown;
}

const TRACKING_PATH = new RegExp(`^users/([^/]+)/${UserCollection.TRACKING}/([^/]+)$`);

function trackingPath(ref: Ref): { uid: string; id: string } | null {
	const m = typeof ref?.path === "string" ? TRACKING_PATH.exec(ref.path) : null;
	return m ? { uid: m[1], id: m[2] } : null;
}

export function stampTrackingWrites<B extends StampFns>(base: B) {
	const stampData = (data: unknown) =>
		data && typeof data === "object"
			? { ...(data as object), [TRACKING_UPDATED_AT]: base.serverTimestamp() }
			: data;
	// updateDoc / batch.update take (ref, data) or (ref, field, value, …)
	const stampUpdateArgs = (args: unknown[]) =>
		args.length === 1
			? [stampData(args[0])]
			: [...args, TRACKING_UPDATED_AT, base.serverTimestamp()];
	const deletionEntry = (ref: Ref) => {
		const t = trackingPath(ref)!;
		return [
			base.doc(ref.firestore, "users", t.uid, UserCollection.TRACKING_DELETIONS, t.id),
			{
				[TRACKING_UPDATED_AT]: base.serverTimestamp(),
				expireAt: base.Timestamp.fromMillis(Date.now() + TRACKING_DELETION_TTL_MS),
			},
		] as const;
	};

	/** Batch / transaction: the same ops, tracking ones stamped */
	function stampingWriter<W extends Record<string, Fn>>(target: W): W {
		const proxy: Record<string, Fn> = Object.create(target);
		proxy.set = (ref: Ref, data: unknown, ...rest: unknown[]) => (
			target.set(ref, trackingPath(ref) ? stampData(data) : data, ...rest), proxy
		);
		proxy.update = (ref: Ref, ...args: unknown[]) => (
			target.update(ref, ...(trackingPath(ref) ? stampUpdateArgs(args) : args)), proxy
		);
		proxy.delete = (ref: Ref) => {
			target.delete(ref);
			if (trackingPath(ref)) target.set(...deletionEntry(ref));
			return proxy;
		};
		for (const key of ["get", "commit"]) {
			if (typeof target[key] === "function") proxy[key] = target[key].bind(target);
		}
		return proxy as W;
	}

	return {
		setDoc: (ref: Ref, data: unknown, ...rest: unknown[]) =>
			base.setDoc(ref, trackingPath(ref) ? stampData(data) : data, ...rest),
		updateDoc: (ref: Ref, ...args: unknown[]) =>
			base.updateDoc(ref, ...(trackingPath(ref) ? stampUpdateArgs(args) : args)),
		deleteDoc: (ref: Ref) => {
			if (!trackingPath(ref)) return base.deleteDoc(ref);
			const batch = base.writeBatch(ref.firestore);
			batch.delete(ref);
			batch.set(...deletionEntry(ref));
			return batch.commit();
		},
		writeBatch: (...a: unknown[]) => stampingWriter(base.writeBatch(...a)),
		runTransaction: (db: unknown, update: Fn, ...rest: unknown[]) =>
			base.runTransaction(db, (tx: Record<string, Fn>) => update(stampingWriter(tx)), ...rest),
	};
}
