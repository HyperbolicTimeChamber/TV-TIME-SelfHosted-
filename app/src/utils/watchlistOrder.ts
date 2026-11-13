import { CardEntryMode, WATCHLIST_BULK_CHANGE_CARDS } from "../enums";

type ListItem = { type: string; card?: { tmdbId: number } };

/**
 * Shows just marked (tmdbId → when) moved to the top of the active section, newest first, before
 * Firestore confirms the new priority. Saved as-is, so closing the app right after a mark doesn't
 * bring the card back in its old spot on the next launch. Nothing to promote → the same list.
 */
export function promoteShows<T extends ListItem>(list: T[], promoted: ReadonlyMap<number, number>): T[] {
	if (promoted.size === 0) return list;
	const lifted = list
		.filter((i) => i.type === "show" && i.card && promoted.has(i.card.tmdbId))
		.sort((a, b) => promoted.get(b.card!.tmdbId)! - promoted.get(a.card!.tmdbId)!);
	if (lifted.length === 0) return list;
	const rest = list.filter((i) => !lifted.includes(i));
	const firstShow = rest.findIndex((i) => i.type === "show");
	// Right after the active section's header (before its first show, or at the end)
	const at = firstShow === -1 ? rest.length : firstShow;
	return [...rest.slice(0, at), ...lifted, ...rest.slice(at)];
}

/**
 * Live tracking pages arrive by Firestore priorityDate, but the list sorts by effective priority
 * (a freshly aired episode lifts a card past its priorityDate) — such a card can rank near the
 * top yet sit on a later page. Saved cards the live pages haven't reached keep their saved spot
 * between the live ones (appended at the end, they vanished from the top and jumped back once
 * their page loaded). All saved cards live → the live list as-is.
 */
export function mergeCachedShows<T extends ListItem>(cached: T[], live: T[]): T[] {
	const liveIds = new Set<number>();
	for (const i of live) if (i.type === "show" && i.card) liveIds.add(i.card.tmdbId);
	const saved = cached.filter((i) => i.type === "show" && i.card);
	if (saved.every((i) => liveIds.has(i.card!.tmdbId))) return live;
	const savedAt = new Map(saved.map((i, k) => [i.card!.tmdbId, k]));
	const out: T[] = [];
	let next = 0;
	const flushTo = (end: number) => {
		for (; next < end; next++) if (!liveIds.has(saved[next].card!.tmdbId)) out.push(saved[next]);
	};
	for (const item of live) {
		const at = item.type === "show" && item.card ? savedAt.get(item.card.tmdbId) : undefined;
		if (at !== undefined) flushTo(at);
		out.push(item);
		if (at !== undefined) next = Math.max(next, at + 1);
	}
	if (liveIds.size === 0) {
		// The saved active section's own header (not "Previously Watched")
		const header = cached[cached.indexOf(saved[0]) - 1];
		if (header?.type === "sectionHeader") out.push(header);
	}
	flushTo(saved.length);
	return out;
}

/** The tmdb ids of a list's show cards */
export function showCardIds<T extends ListItem>(list: readonly T[]): Set<number> {
	const ids = new Set<number>();
	for (const i of list) if (i.type === "show" && i.card) ids.add(i.card.tmdbId);
	return ids;
}

/** When a saved card that wasn't out yet at save time comes out */
export interface CardRelease {
	airStamp?: string;
	airDate: string | null;
}

/**
 * Cards whose episode came out while the app was closed, at the top of the active section (a new
 * section when there's none), so the launch draws them with the first frame. Ones the list has
 * already are left alone
 */
export function addAiredCards<T extends ListItem>(list: T[], aired: readonly T[], header: T): T[] {
	const have = showCardIds(list);
	const fresh = aired.filter((i) => i.card && !have.has(i.card.tmdbId));
	if (fresh.length === 0) return list;
	const firstShow = list.findIndex((i) => i.type === "show");
	if (firstShow < 0) return [...list, header, ...fresh];
	return [...list.slice(0, firstShow), ...fresh, ...list.slice(firstShow)];
}

/** Cards that joined + left between two lists of card ids. `countLeft: false` for a `next` list
 *  that may still be loading (its missing cards aren't gone yet) */
export function changedCardCount(
	prev: ReadonlySet<number>,
	next: ReadonlySet<number>,
	countLeft = true,
): number {
	let count = 0;
	for (const id of next) if (!prev.has(id)) count += 1;
	if (countLeft) for (const id of prev) if (!next.has(id)) count += 1;
	return count;
}

/** Whether this many card changes are applied as one list swap instead of animated */
export function isBulkCardChange(changes: number): boolean {
	return changes >= WATCHLIST_BULK_CHANGE_CARDS;
}

/** How cards joining together come in: none, one at a time, or (a catch-up) one list swap */
export function cardEntryMode(joining: number): CardEntryMode {
	if (joining <= 0) return CardEntryMode.NONE;
	return isBulkCardChange(joining) ? CardEntryMode.SWAP : CardEntryMode.STAGED;
}

/**
 * The order cards waiting to come in are let through: as they sit in the list, top first (the
 * top of "What's Up Next" is where the eye is). Ones the list no longer has (marked, removed,
 * paused elsewhere) are dropped, so they can't hold the queue
 */
export function cardEntryOrder<T extends ListItem>(
	pending: ReadonlySet<number>,
	list: readonly T[],
): number[] {
	if (pending.size === 0) return [];
	const out: number[] = [];
	for (const i of list) if (i.type === "show" && i.card && pending.has(i.card.tmdbId)) out.push(i.card.tmdbId);
	return out;
}

/** Live cards the saved list didn't have and that haven't been let through yet */
export function unseenCardIds<T extends ListItem>(
	saved: ReadonlySet<number> | null,
	released: ReadonlySet<number>,
	live: readonly T[],
): ReadonlySet<number> {
	if (!saved) return new Set();
	return new Set([...showCardIds(live)].filter((id) => !saved.has(id) && !released.has(id)));
}
