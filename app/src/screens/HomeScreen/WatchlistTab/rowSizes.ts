import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey } from "../../../enums";
import type { WatchlistListItem } from "../../../types/watchlist";

/**
 * Watchlist row heights by row type, measured last session. The list opens at "What's Up Next"
 * with the Previously Watched rows above it; guessed at the list's one estimated size, those rows
 * were re-measured a moment after launch and the list corrected its scroll — the view slid by the
 * guess's error a second or two in. Given as LegendList's getFixedItemSize, a remembered height
 * places them right from the first frame; the list still measures each row and a different real
 * height wins (font size, a two-line title), so a stale value costs only that correction.
 */

/** Row types with one height (the cards vary: tags, rows of text) */
export enum RowSizeType {
	HEADER = "header",
	WATCHED_EPISODE = "watchedEpisode",
	WATCHED_MOVIE = "watchedMovie",
	SHOW = "show",
	CAUGHT_UP = "caughtUp",
}

export function rowSizeType(item: WatchlistListItem): RowSizeType {
	if (item.type === "sectionHeader") return RowSizeType.HEADER;
	if (item.type === "watchedEpisode") return RowSizeType.WATCHED_EPISODE;
	if (item.type === "watchedMovie") return RowSizeType.WATCHED_MOVIE;
	if (item.type === "caughtUp") return RowSizeType.CAUGHT_UP;
	return RowSizeType.SHOW;
}

/** Types whose remembered height is used up front */
const FIXED_TYPES: ReadonlySet<RowSizeType> = new Set([
	RowSizeType.HEADER,
	RowSizeType.WATCHED_EPISODE,
	RowSizeType.WATCHED_MOVIE,
]);

let remembered: Partial<Record<RowSizeType, number>> = {};
// Read at startup (the list waits on its own cached data longer than this read takes)
const loaded = AsyncStorage.getItem(CacheKey.WATCHLIST_ROW_SIZES)
	.then((raw) => {
		if (raw) remembered = JSON.parse(raw) ?? {};
	})
	.catch(() => {});

/** Wait for the remembered heights (so the first layout already uses them) */
export function rowSizesReady(): Promise<void> {
	return loaded;
}

/** LegendList getFixedItemSize: the remembered height of the row's type, if it has one */
export function rememberedRowSize(item: WatchlistListItem): number | undefined {
	const type = rowSizeType(item);
	return FIXED_TYPES.has(type) ? remembered[type] : undefined;
}

/** Most common measured height per type, from the list's measured sizes */
export function saveRowSizes(
	data: readonly WatchlistListItem[],
	sizeAtIndex: (index: number) => number | undefined,
): void {
	const counts = new Map<RowSizeType, Map<number, number>>();
	data.forEach((item, i) => {
		const size = sizeAtIndex(i);
		if (!size) return;
		const type = rowSizeType(item);
		if (!FIXED_TYPES.has(type)) return;
		const bySize = counts.get(type) ?? new Map<number, number>();
		// Exactly as the list measured it: a remembered height that differs by a rounding step
		// isn't "the same", and the list re-measured and re-placed every such row
		bySize.set(size, (bySize.get(size) ?? 0) + 1);
		counts.set(type, bySize);
	});
	const next: Partial<Record<RowSizeType, number>> = { ...remembered };
	for (const [type, bySize] of counts) {
		next[type] = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0];
	}
	if (JSON.stringify(next) === JSON.stringify(remembered)) return;
	remembered = next;
	AsyncStorage.setItem(CacheKey.WATCHLIST_ROW_SIZES, JSON.stringify(next)).catch(() => {});
}
