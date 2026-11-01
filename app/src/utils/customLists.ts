import { CUSTOM_LIST_ITEM_MAX, CUSTOM_LIST_NAME_MAX, MediaType } from "../enums";
import type { CustomList, CustomListEntry, CustomListItem, TMDBShow } from "../types";

/** One title across lists — also the key of a membership Set */
export const listItemKey = (tmdbId: number, mediaType: MediaType) => `${mediaType}_${tmdbId}`;

/** Search results sometimes lack media_type (a TV-only endpoint); first_air_date / name tell them apart */
export function searchMediaType(item: TMDBShow): MediaType {
	return (
		item.media_type ||
		(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE)
	);
}

export function entryFromSearchResult(item: TMDBShow): CustomListEntry {
	return {
		tmdbId: item.id,
		mediaType: searchMediaType(item),
		title: item.name || item.title || "",
		posterPath: item.poster_path ?? null,
	};
}

/** Trimmed, inner whitespace collapsed, capped — "" when nothing usable is left */
export function cleanListName(raw: string): string {
	return raw.replace(/\s+/g, " ").trim().slice(0, CUSTOM_LIST_NAME_MAX).trim();
}

/** Names are unique per user, ignoring case (and the list being renamed) */
export function isListNameTaken(lists: CustomList[], name: string, exceptId?: string): boolean {
	const wanted = name.toLowerCase();
	return lists.some((l) => l.id !== exceptId && l.name.toLowerCase() === wanted);
}

export function listHasItem(list: CustomList, tmdbId: number, mediaType: MediaType): boolean {
	return list.items.some((i) => i.tmdbId === tmdbId && i.mediaType === mediaType);
}

/**
 * New titles go to the END — the same place the server puts an arrayUnion element, so the cached
 * list and a reload always agree on the order (which is the order the user sees, reorders and exports).
 * The same list back when the title is already in or the list is full.
 */
export function addItemToList(list: CustomList, entry: CustomListEntry, now: number): CustomList {
	if (listHasItem(list, entry.tmdbId, entry.mediaType)) return list;
	if (list.items.length >= CUSTOM_LIST_ITEM_MAX) return list;
	return { ...list, items: [...list.items, { ...entry, addedAt: now }], updatedAt: now };
}

export function removeItemFromList(
	list: CustomList,
	tmdbId: number,
	mediaType: MediaType,
	now: number,
): CustomList {
	if (!listHasItem(list, tmdbId, mediaType)) return list;
	return {
		...list,
		items: list.items.filter((i) => !(i.tmdbId === tmdbId && i.mediaType === mediaType)),
		updatedAt: now,
	};
}

/** Ids of the lists holding this title */
export function listIdsContaining(
	lists: CustomList[],
	tmdbId: number,
	mediaType: MediaType,
): Set<string> {
	return new Set(lists.filter((l) => listHasItem(l, tmdbId, mediaType)).map((l) => l.id));
}

/** Every title that is in at least one list (search cards show it as "listed") */
export function listedTitleKeys(lists: CustomList[]): Set<string> {
	const keys = new Set<string>();
	for (const l of lists) for (const i of l.items) keys.add(listItemKey(i.tmdbId, i.mediaType));
	return keys;
}

/** Where a list sits: the user's saved order, else when it was made (a huge number → after any saved order) */
const listPosition = (l: CustomList) => l.order ?? l.createdAt;

/** User order first (Favorites leads), unordered lists oldest first — positions stay put as lists are added */
export const sortLists = (lists: CustomList[]): CustomList[] =>
	[...lists].sort((a, b) => listPosition(a) - listPosition(b) || a.createdAt - b.createdAt);

const byRecent = (a: CustomList, b: CustomList) =>
	b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;

/**
 * Add to List sheet order: lists already holding `entry` first, then most recently created or
 * modified. `pinned` = the ids in the order the sheet opened with — kept while it is open so a
 * ticked row never jumps under the finger; lists made since go on top. null = not opened yet.
 */
export function sheetListOrder(
	lists: CustomList[],
	pinned: string[] | null,
	entry?: Pick<CustomListEntry, "tmdbId" | "mediaType">,
): CustomList[] {
	if (!pinned) {
		const holds = (l: CustomList) => (entry && listHasItem(l, entry.tmdbId, entry.mediaType) ? 1 : 0);
		return [...lists].sort((a, b) => holds(b) - holds(a) || byRecent(a, b));
	}
	const rank = new Map(pinned.map((id, i) => [id, i]));
	const fresh = lists.filter((l) => !rank.has(l.id)).sort(byRecent);
	const kept = lists.filter((l) => rank.has(l.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
	return [...fresh, ...kept];
}

/** The title a list shows as its cover: the one added last (null when empty) */
export function listCoverItem(list: CustomList): CustomListItem | null {
	let cover: CustomListItem | null = null;
	for (const item of list.items) if (!cover || item.addedAt > cover.addedAt) cover = item;
	return cover;
}

/** Array with the element at `from` moved to `to` (a new array; same one back when nothing moves) */
export function moveElement<T>(items: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
	const next = [...items];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}

/** Same ids in the same order? (is a reorder actually a change) */
export const sameIdOrder = (a: Array<{ id: string }>, b: Array<{ id: string }>) =>
	a.length === b.length && a.every((x, i) => x.id === b[i].id);

/** Same titles in the same order? */
export const sameItemOrder = (a: CustomListItem[], b: CustomListItem[]) =>
	a.length === b.length &&
	a.every((x, i) => x.tmdbId === b[i].tmdbId && x.mediaType === b[i].mediaType);

/** Saved `order` for a list shown in this sequence: 0, 1, 2… (every list gets one, so none falls back to createdAt) */
export const listOrders = (ordered: CustomList[]): Array<{ id: string; order: number }> =>
	ordered.map((l, i) => ({ id: l.id, order: i }));

/** "1 title" / "12 titles" */
export const titleCount = (n: number) => `${n} ${n === 1 ? "title" : "titles"}`;

/** "45 min" — null when unknown */
export function formatRuntime(minutes: number | null | undefined): string | null {
	if (!minutes || minutes <= 0) return null;
	return `${minutes} min`;
}

/** List page row: "62 episodes · 45 min" (show) / "136 min" (movie) */
export function listItemMeta(
	mediaType: MediaType,
	info: { totalEpisodes?: number | null; runtime?: number | null },
): string {
	const parts: string[] = [];
	if (mediaType === MediaType.TV && info.totalEpisodes)
		parts.push(`${info.totalEpisodes} ${info.totalEpisodes === 1 ? "episode" : "episodes"}`);
	const runtime = formatRuntime(info.runtime);
	if (runtime) parts.push(runtime);
	return parts.join(" · ");
}
