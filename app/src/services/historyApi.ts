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
import type { CatalogShow, HistoryEntry, HistoryFacets } from "../types";
import { HistorySort, MediaType, UserCollection, WatchStatus } from "../enums";
import { localizeCatalog } from "../utils/airTime";
import { matchesHistoryView, type UserFacetsDoc } from "../utils/historyView";

export const HISTORY_PAGE_SIZE = 20;
/** Firestore `in` filter limit */
const IN_LIMIT = 30;

const ms = (t: unknown) => (t as Timestamp | undefined)?.toMillis?.() ?? 0;

/** `withFacets`: keep genres / keywords — a filtered view's page (checked on the phone, kept
 *  in memory). The cached default list leaves them out: it's one saved value per tab */
export function toEntry(id: string, d: Record<string, any>, withFacets = false): HistoryEntry {
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
		lastEpisode: d.lastEpisode ?? null,
		...(withFacets ? { genres: d.genres ?? [], keywords: d.keywords ?? [] } : {}),
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

/**
 * One page of a sorted / filtered view (Firestore does the work, so it stays paginated):
 * newest watch or most time spent first, optionally only some statuses / genres / keywords.
 * Firestore takes one array-contains-any per query: the genres (else the keywords) run there,
 * the rest (statuses with it, the keywords beside genres) are checked here — so a page can come
 * back short. `cursor` is the page's last doc either way, for the next page.
 */
export async function fetchHistoryViewPage(
	userId: string,
	mediaType: MediaType,
	sort: HistorySort,
	statuses: WatchStatus[],
	facets: HistoryFacets,
	after: Pick<HistoryEntry, "historyAt" | "minutesWatched" | "id"> | null,
): Promise<{ entries: HistoryEntry[]; hasMore: boolean; cursor: HistoryEntry | null }> {
	const bySpent = sort === HistorySort.TIME_SPENT;
	const field = bySpent ? "minutesWatched" : "historyAt";
	const cursor = after
		? bySpent
			? after.minutesWatched
			: Timestamp.fromMillis(after.historyAt)
		: null;
	const facet =
		facets.genres.size > 0
			? where("genres", "array-contains-any", [...facets.genres])
			: facets.keywords.size > 0
				? where("keywords", "array-contains-any", [...facets.keywords])
				: null;
	const snap = await getDocs(
		query(
			trackingCol(userId),
			where("mediaType", "==", mediaType),
			...(facet ? [facet] : statuses.length > 0 ? [where("status", "in", statuses)] : []),
			orderBy(field, "desc"),
			orderBy(documentId(), "desc"),
			...(after ? [startAfter(cursor, after.id)] : []),
			limit(HISTORY_PAGE_SIZE),
		),
	);
	const all = snap.docs.map((d) => toEntry(d.id, d.data(), true));
	return {
		// Never-watched titles (plays 0) can carry minutesWatched 0 — not history
		entries: all.filter((e) => e.plays > 0 && matchesHistoryView(e, statuses, facets)),
		hasMore: snap.docs.length === HISTORY_PAGE_SIZE,
		cursor: all[all.length - 1] ?? null,
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
export async function fetchHistoryEntry(
	userId: string,
	docId: string,
): Promise<HistoryEntry | null> {
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
	return snaps.flatMap((s) => s.docs.map((d) => localizeCatalog(d.data() as CatalogShow)));
}

/** The user's filter choices for a tab (one doc, kept by the Cloud Functions) */
export async function fetchUserFacets(
	userId: string,
	mediaType: MediaType,
): Promise<UserFacetsDoc | null> {
	const snap = await getDoc(
		doc(getFirestore(), "users", userId, UserCollection.FACETS, mediaType),
	);
	return snap.exists() ? (snap.data() as UserFacetsDoc) : null;
}
