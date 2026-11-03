import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	getFirestore,
	collection,
	doc,
	getDocs,
	onSnapshot,
	query,
	where,
	orderBy,
	limit,
	startAfter,
	documentId,
	Timestamp,
} from "@react-native-firebase/firestore";
import {
	CacheKey,
	DocChangeType,
	TRACKING_SYNC_OVERLAP_MS,
	TRACKING_UPDATED_AT,
	UserCollection,
} from "../enums";
import type { TrackingItem } from "../types";
import { todayStr } from "../utils";
import {
	applyTrackingChanges,
	chunk,
	latestUpdate,
	plainTimestamp,
	reviveTimestamps,
	type TimestampLike,
	type TrackingChange,
} from "../utils/trackingSync";

/**
 * Tracking docs for the watchlist, delta-synced (one store for every useWatchlist instance).
 *
 * - The pages loaded so far are saved on the device and shown at once on launch. Pagination
 *   continues after the last saved doc; a page fetched once stays saved.
 * - A launch reads only what changed: docs with `updatedAt` past the last sync, and deletion log
 *   entries past it (deleted docs never match a query). Nothing changed → ~2 reads.
 * - Once a day the saved pages are fetched again in full, healing anything a write without the
 *   stamp (e.g. an old app build) left stale.
 *
 * `updatedAt` is stamped on every tracking write (stampTrackingWrites on clients,
 * shared/trackingSync in Cloud Functions).
 */

export const TRACKING_PAGE_SIZE = 50;
const PERSIST_DELAY_MS = 500;

export type TrackingDoc = TrackingItem & { updatedAt?: TimestampLike | null };

export interface TrackingState {
	docs: TrackingDoc[];
	hasMore: boolean;
	/** Nothing to show yet (no saved pages, first fetch under way) */
	loading: boolean;
	loadingMore: boolean;
}

interface SavedSync {
	userId: string;
	lastSync: { seconds: number; nanoseconds: number } | null;
	pageCount: number;
	hasMore: boolean;
	/** Day (todayStr) of the last full fetch */
	fullSyncDay: string;
}

type Listener = (state: TrackingState) => void;

interface Store {
	uid: string;
	state: TrackingState;
	listeners: Set<Listener>;
	lastSync: TimestampLike | null;
	fullSyncDay: string;
	savedPages: number;
	started: Promise<void> | null;
	unsubscribe: (() => void) | null;
	persistTimer: ReturnType<typeof setTimeout> | null;
	/** Bumped on teardown — async work of an old run drops its result */
	run: number;
}

let store: Store | null = null;

const makeTimestamp = (s: number, ns: number) => new Timestamp(s, ns);
const trackingCol = (uid: string) =>
	collection(doc(getFirestore(), "users", uid), UserCollection.TRACKING);
const deletionsCol = (uid: string) =>
	collection(doc(getFirestore(), "users", uid), UserCollection.TRACKING_DELETIONS);
const pageKey = (uid: string, i: number) => `${CacheKey.TRACKING_PAGE}${uid}_${i}`;

function emit(s: Store, patch: Partial<TrackingState>) {
	s.state = { ...s.state, ...patch };
	for (const l of s.listeners) l(s.state);
}

function schedulePersist(s: Store) {
	if (s.persistTimer) clearTimeout(s.persistTimer);
	s.persistTimer = setTimeout(() => {
		s.persistTimer = null;
		const pages = chunk(s.state.docs, TRACKING_PAGE_SIZE);
		const values: Record<string, string> = {};
		pages.forEach((page, i) => (values[pageKey(s.uid, i)] = JSON.stringify(page)));
		const saved: SavedSync = {
			userId: s.uid,
			lastSync: s.lastSync ? plainTimestamp(s.lastSync) : null,
			pageCount: pages.length,
			hasMore: s.state.hasMore,
			fullSyncDay: s.fullSyncDay,
		};
		values[CacheKey.TRACKING_SYNC + s.uid] = JSON.stringify(saved);
		const stale = Array.from(
			{ length: Math.max(0, s.savedPages - pages.length) },
			(_, k) => pageKey(s.uid, pages.length + k),
		);
		s.savedPages = pages.length;
		AsyncStorage.setMany(values).catch(() => {});
		if (stale.length) AsyncStorage.removeMany(stale).catch(() => {});
	}, PERSIST_DELAY_MS);
}

async function restore(uid: string): Promise<{ sync: SavedSync; docs: TrackingDoc[] } | null> {
	try {
		const raw = await AsyncStorage.getItem(CacheKey.TRACKING_SYNC + uid);
		if (!raw) return null;
		const sync = JSON.parse(raw) as SavedSync;
		if (sync.userId !== uid || sync.pageCount < 1) return null;
		const keys = Array.from({ length: sync.pageCount }, (_, i) => pageKey(uid, i));
		const rows = await AsyncStorage.getMany(keys);
		const docs: TrackingDoc[] = [];
		for (const key of keys) {
			// A missing page breaks the prefix — start over
			if (!rows[key]) return null;
			docs.push(...reviveTimestamps(JSON.parse(rows[key]!) as TrackingDoc[], makeTimestamp));
		}
		return { sync, docs };
	} catch {
		return null;
	}
}

/** A tracking doc as the store keeps (and saves) it — without genres / keywords: only Watch
 *  History's filters read those (in its own query), and ~40 keywords a title would bloat the
 *  saved pages */
const toDoc = (d: { id: string; data: () => unknown }) => {
	const { genres: _genres, keywords: _keywords, ...data } = d.data() as Record<string, unknown>;
	return { id: d.id, ...data } as TrackingDoc;
};

/** One page in Firestore order, after `after` (the last doc already held) */
async function fetchPage(uid: string, after: TrackingDoc | null): Promise<TrackingDoc[]> {
	const q = after
		? query(
				trackingCol(uid),
				orderBy("priorityDate", "desc"),
				orderBy(documentId(), "desc"),
				startAfter(after.priorityDate, after.id),
				limit(TRACKING_PAGE_SIZE),
			)
		: query(
				trackingCol(uid),
				orderBy("priorityDate", "desc"),
				orderBy(documentId(), "desc"),
				limit(TRACKING_PAGE_SIZE),
			);
	const snap = await getDocs(q);
	return snap.docs.map(toDoc);
}

/** Newest stamp on the server (1 read) — a fresh start syncs from there, never the device clock */
async function newestStamp(uid: string): Promise<TimestampLike> {
	const snap = await getDocs(
		query(trackingCol(uid), orderBy(TRACKING_UPDATED_AT, "desc"), limit(1)),
	);
	const stamp = snap.docs[0]?.data()?.[TRACKING_UPDATED_AT] as TimestampLike | undefined;
	return stamp ?? makeTimestamp(0, 0);
}

/** Live delta: changed docs + deletion log entries since `since` (minus a small overlap) */
function listen(s: Store, since: TimestampLike) {
	s.unsubscribe?.();
	const ms = since.seconds * 1000 + Math.floor(since.nanoseconds / 1e6);
	const from = Timestamp.fromMillis(Math.max(0, ms - TRACKING_SYNC_OVERLAP_MS));
	const apply = (changes: TrackingChange<TrackingDoc>[], stamps: TimestampLike[]) => {
		if (store !== s) return;
		s.lastSync = latestUpdate(
			s.lastSync,
			stamps.map((updatedAt) => ({ updatedAt })),
		);
		const docs = applyTrackingChanges(s.state.docs, changes, s.state.hasMore);
		if (docs !== s.state.docs) emit(s, { docs });
		schedulePersist(s);
	};
	const offDocs = onSnapshot(
		query(trackingCol(s.uid), where(TRACKING_UPDATED_AT, ">", from)),
		(snap: any) => {
			const changes: TrackingChange<TrackingDoc>[] = [];
			const stamps: TimestampLike[] = [];
			for (const c of snap.docChanges()) {
				// Removed from the result = deleted (the deletion log covers it) or a local pending
				// write — never treat it as a delete here
				if (c.type === DocChangeType.REMOVED) continue;
				const d = toDoc(c.doc);
				// Pending local write (no server time yet) → its confirmed copy follows
				if (!d.updatedAt) continue;
				changes.push({ kind: "upsert", doc: d });
				stamps.push(d.updatedAt);
			}
			apply(changes, stamps);
		},
		(err: unknown) => console.error("Tracking delta listener error:", err),
	);
	const offDeletes = onSnapshot(
		query(deletionsCol(s.uid), where(TRACKING_UPDATED_AT, ">", from)),
		(snap: any) => {
			const changes: TrackingChange<TrackingDoc>[] = [];
			const stamps: TimestampLike[] = [];
			for (const c of snap.docChanges()) {
				if (c.type === DocChangeType.REMOVED) continue;
				const at = c.doc.data()?.[TRACKING_UPDATED_AT] as TimestampLike | undefined;
				if (!at) continue;
				changes.push({ kind: "delete", id: c.doc.id, at });
				stamps.push(at);
			}
			apply(changes, stamps);
		},
		(err: unknown) => console.error("Tracking deletion listener error:", err),
	);
	s.unsubscribe = () => {
		offDocs();
		offDeletes();
	};
}

/** Full fetch of `pages` pages (fresh start, or the daily heal of the saved ones) */
async function fullFetch(s: Store, pages: number) {
	const run = s.run;
	const baseline = await newestStamp(s.uid);
	const docs: TrackingDoc[] = [];
	let hasMore = true;
	for (let i = 0; i < pages && hasMore; i++) {
		const page = await fetchPage(s.uid, docs[docs.length - 1] ?? null);
		docs.push(...page);
		hasMore = page.length >= TRACKING_PAGE_SIZE;
	}
	if (store !== s || s.run !== run) return;
	s.lastSync = latestUpdate(baseline, docs);
	s.fullSyncDay = todayStr();
	emit(s, { docs, hasMore, loading: false });
	schedulePersist(s);
	if (s.listeners.size > 0) listen(s, s.lastSync!);
}

async function start(s: Store) {
	const saved = await restore(s.uid);
	if (store !== s) return;
	if (!saved) {
		await fullFetch(s, 1);
		return;
	}
	s.lastSync = saved.sync.lastSync
		? makeTimestamp(saved.sync.lastSync.seconds, saved.sync.lastSync.nanoseconds)
		: null;
	s.fullSyncDay = saved.sync.fullSyncDay;
	s.savedPages = saved.sync.pageCount;
	emit(s, { docs: saved.docs, hasMore: saved.sync.hasMore, loading: false });
	if (saved.sync.fullSyncDay !== todayStr() || !s.lastSync) {
		// Once a day: the saved pages again in full (shown meanwhile). Failed (offline) → the
		// saved docs + the delta from their last sync; tomorrow's launch tries again
		try {
			await fullFetch(s, saved.sync.pageCount);
			return;
		} catch (err) {
			console.error("Tracking full fetch error:", err);
			if (store !== s || !s.lastSync) return;
		}
	}
	if (s.listeners.size > 0) listen(s, s.lastSync);
}

function ensureStore(uid: string): Store {
	if (store?.uid === uid) return store;
	if (store) teardown(store);
	store = {
		uid,
		state: { docs: [], hasMore: true, loading: true, loadingMore: false },
		listeners: new Set(),
		lastSync: null,
		fullSyncDay: "",
		savedPages: 0,
		started: null,
		unsubscribe: null,
		persistTimer: null,
		run: 0,
	};
	return store;
}

function teardown(s: Store) {
	s.run++;
	s.unsubscribe?.();
	s.unsubscribe = null;
}

/**
 * Subscribe to a user's tracking docs. The first subscriber starts the sync; the last one
 * leaving stops the listeners (docs stay in memory — the next subscriber resumes from them)
 */
export function subscribeTracking(uid: string, listener: Listener): () => void {
	const s = ensureStore(uid);
	s.listeners.add(listener);
	if (!s.started) {
		s.started = start(s).catch((err) => {
			console.error("Tracking sync start error:", err);
			if (store !== s) return;
			// The next subscriber tries again
			s.started = null;
			emit(s, { loading: false });
		});
	} else if (!s.unsubscribe && !s.state.loading && s.lastSync) {
		listen(s, s.lastSync);
	}
	listener(s.state);
	return () => {
		s.listeners.delete(listener);
		if (s.listeners.size === 0 && store === s) {
			s.unsubscribe?.();
			s.unsubscribe = null;
		}
	};
}

/** Next page after the last held doc; it stays saved from then on */
export async function loadMoreTracking(uid: string): Promise<void> {
	const s = store;
	if (!s || s.uid !== uid || s.state.loading || s.state.loadingMore || !s.state.hasMore) return;
	emit(s, { loadingMore: true });
	try {
		const page = await fetchPage(uid, s.state.docs[s.state.docs.length - 1] ?? null);
		if (store !== s) return;
		const hasMore = page.length >= TRACKING_PAGE_SIZE;
		// Past the old last doc: everything joins (a listener copy newer than the page's wins)
		const docs = applyTrackingChanges(
			s.state.docs,
			page.map((doc) => ({ kind: "upsert" as const, doc })),
			false,
		);
		emit(s, { docs, hasMore });
		schedulePersist(s);
	} catch (error) {
		console.error("Load more tracking error:", error);
	} finally {
		if (store === s) emit(s, { loadingMore: false });
	}
}

/** Card removed on this device — out of the saved docs now (its deletion entry confirms it) */
export function removeTrackingLocal(uid: string, tmdbId: number) {
	const s = store;
	if (!s || s.uid !== uid) return;
	const docs = s.state.docs.filter((d) => d.tmdbId !== tmdbId);
	if (docs.length === s.state.docs.length) return;
	emit(s, { docs });
	schedulePersist(s);
}

/** Card added on this device — in the saved docs now; the server's stamped copy replaces it */
export function upsertTrackingLocal(uid: string, item: TrackingDoc) {
	const s = store;
	if (!s || s.uid !== uid) return;
	const docs = applyTrackingChanges(
		s.state.docs,
		[{ kind: "upsert", doc: item }],
		s.state.hasMore,
	);
	if (docs === s.state.docs) return;
	emit(s, { docs });
	schedulePersist(s);
}
