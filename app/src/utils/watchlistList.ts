import type { WatchlistListItem } from "../types/watchlist";

export const UP_NEXT_TITLE = "What's Up Next";

/**
 * Nothing (yet) up next but there's watch history: keep the "What's Up Next" heading, and once
 * everything has loaded (`settled` — no skeletons left) put the "all caught up" card under it.
 * A list with nothing at all gets the welcome screen instead.
 */
export function withCaughtUp(list: WatchlistListItem[], settled = true): WatchlistListItem[] {
	if (list.length === 0 || list.some((i) => i.type === "show")) return list;
	const history = list.filter((i) => !(i.type === "sectionHeader" && i.title === UP_NEXT_TITLE));
	const header: WatchlistListItem = { type: "sectionHeader", title: UP_NEXT_TITLE };
	return settled ? [...history, header, { type: "caughtUp" }] : [...history, header];
}
