import {
	getFirestore,
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
	orderBy,
	startAfter,
	limit,
	documentId,
	Timestamp,
} from "@react-native-firebase/firestore";
import type { CatalogShow, HistoryEntry } from "../types";
import { MediaType, WatchStatus } from "../enums";

export const HISTORY_PAGE_SIZE = 20;
/** Firestore `in` filter limit */
const IN_LIMIT = 30;

const ms = (t: unknown) => (t as Timestamp | undefined)?.toMillis?.() ?? 0;

function toEntry(id: string, d: Record<string, any>): HistoryEntry {
	return {
		id,
		tmdbId: d.tmdbId,
		mediaType: d.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV,
		status: (d.status as WatchStatus) ?? WatchStatus.WATCHING,
		nextEpisode: d.nextEpisode ?? null,
		rewatchCount: d.rewatchCount ?? 0,
		historyAt: ms(d.historyAt),
		historyUpdatedAt: ms(d.historyUpdatedAt),
		minutesWatched: d.minutesWatched ?? 0,
		plays: d.plays ?? 0,
	};
}

const trackingCol = (userId: string) =>
	collection(doc(getFirestore(), "users", userId), "tracking");

/** One page, newest watch first. Docs without historyAt (never started) aren't returned */
export async function fetchHistoryPage(
	userId: string,
	mediaType: MediaType,
	after: Pick<HistoryEntry, "historyAt" | "id"> | null,
): Promise<{ entries: HistoryEntry[]; hasMore: boolean }> {
	const snap = await getDocs(
		query(
			trackingCol(userId),
			where("mediaType", "==", mediaType),
			orderBy("historyAt", "desc"),
			// Doc id breaks ties (e.g. imported movies sharing one timestamp) so paging never skips
			orderBy(documentId(), "desc"),
			...(after ? [startAfter(Timestamp.fromMillis(after.historyAt), after.id)] : []),
			limit(HISTORY_PAGE_SIZE),
		),
	);
	return {
		entries: snap.docs.map((d) => toEntry(d.id, d.data())),
		hasMore: snap.docs.length === HISTORY_PAGE_SIZE,
	};
}

/** Rows changed since the cache was last synced — usually 0 docs (1 read minimum) */
export async function fetchHistoryDelta(
	userId: string,
	mediaType: MediaType,
	sinceMs: number,
): Promise<HistoryEntry[]> {
	const snap = await getDocs(
		query(
			trackingCol(userId),
			where("mediaType", "==", mediaType),
			where("historyUpdatedAt", ">", Timestamp.fromMillis(sinceMs)),
		),
	);
	return snap.docs.map((d) => toEntry(d.id, d.data()));
}

/** One tracking doc — a watch on a title the cache doesn't hold yet */
export async function fetchHistoryEntry(userId: string, docId: string): Promise<HistoryEntry | null> {
	const snap = await getDoc(doc(trackingCol(userId), docId));
	return snap.exists() ? toEntry(snap.id, snap.data() as Record<string, any>) : null;
}

/** Catalog docs by id in `in` batches (1 round trip per 30) */
export async function fetchCatalogShows(docIds: string[]): Promise<CatalogShow[]> {
	const showsCol = collection(getFirestore(), "shows");
	const chunks: string[][] = [];
	for (let i = 0; i < docIds.length; i += IN_LIMIT) chunks.push(docIds.slice(i, i + IN_LIMIT));
	const snaps = await Promise.all(
		chunks.map((ids) => getDocs(query(showsCol, where(documentId(), "in", ids)))),
	);
	return snaps.flatMap((s) => s.docs.map((d) => d.data() as CatalogShow));
}
