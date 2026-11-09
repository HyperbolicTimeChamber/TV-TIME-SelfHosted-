import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Timestamp } from "@react-native-firebase/firestore";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { CacheKey } from "../enums";
import { todayStr } from "../utils/todayStr";
import { reviveTimestamps } from "../utils/trackingSync";

/**
 * Previously Watched history (all titles) is fetched once a day: its first page is saved per
 * user and restored on launch, so a cold start reads no history docs. Marks and unwatches change
 * it through the query cache (insert / remove helpers), and the hook saves every change. The
 * first launch of a new day fetches page one again (picks up other devices' history).
 *
 * Only the newest page-size rows are saved — exactly what a fresh fetch returns — so a restored
 * session matches the saved watchlist (utils/watchedHistory coldStartHistory)
 */
interface SavedHistory<Row> {
	userId: string;
	day: string;
	rows: Row[];
	hasMore: boolean;
}

/** One loaded history page: its rows + the cursor for the next (a doc, or the last row's time) */
export interface HistoryPage<Row> {
	rows: Row[];
	lastDoc: unknown;
}

type Timed = { lastWatchedAt?: { seconds: number; nanoseconds: number; toMillis?: () => number } | null };

const millis = (row: Timed) => row.lastWatchedAt?.toMillis?.() ?? 0;
const makeTimestamp = (s: number, ns: number) => new Timestamp(s, ns);
/** History queries restored this session (one AsyncStorage read each, whatever mounts them) */
const restored = new Set<string>();

/**
 * Restore the saved first page into the query cache before the query may run.
 * Returns whether the query can start (false while the saved page is being read)
 */
export function useRestoredHistory<Row extends Timed, Page>(
	queryClient: QueryClient,
	queryKey: readonly unknown[],
	cacheKey: CacheKey,
	userId: string | undefined,
	enabled: boolean,
	toPage: (page: HistoryPage<Row>) => Page,
): boolean {
	const id = `${cacheKey}${userId}`;
	const [ready, setReady] = useState(() => !enabled || !userId || restored.has(id));
	useEffect(() => {
		if (!enabled || !userId || restored.has(id)) {
			setReady(true);
			return;
		}
		let alive = true;
		AsyncStorage.getItem(id)
			.then((raw) => {
				if (!raw || queryClient.getQueryData(queryKey)) return;
				const saved = JSON.parse(raw) as SavedHistory<Row>;
				if (saved.userId !== userId || saved.day !== todayStr()) return;
				const rows = reviveTimestamps(saved.rows, makeTimestamp);
				const last = rows[rows.length - 1];
				const page = toPage({ rows, lastDoc: saved.hasMore && last ? last.lastWatchedAt : null });
				queryClient.setQueryData<InfiniteData<Page>>(queryKey, { pages: [page], pageParams: [null] });
			})
			.catch(() => {})
			.finally(() => {
				restored.add(id);
				if (alive) setReady(true);
			});
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey / toPage: per key, read once
	}, [id, enabled, userId]);
	return ready;
}

/** Save the newest page-size rows (what a fresh fetch would return) with today's date */
export function useSaveHistory<Row extends Timed>(
	cacheKey: CacheKey,
	userId: string | undefined,
	enabled: boolean,
	rows: Row[] | undefined,
	hasNextPage: boolean,
	pageSize: number,
) {
	useEffect(() => {
		if (!enabled || !userId || !rows) return;
		const newest = [...rows].sort((a, b) => millis(b) - millis(a));
		const saved: SavedHistory<Row> = {
			userId,
			day: todayStr(),
			// Timestamps serialise as { seconds, nanoseconds } (+ type) — revived on restore
			rows: newest.slice(0, pageSize),
			hasMore: hasNextPage || newest.length > pageSize,
		};
		AsyncStorage.setItem(`${cacheKey}${userId}`, JSON.stringify(saved)).catch(() => {});
	}, [cacheKey, userId, enabled, rows, hasNextPage, pageSize]);
}
