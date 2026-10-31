import { CUSTOM_LIST_ITEM_MAX, CUSTOM_LIST_NAME_MAX, MediaType } from "../enums";
import type { CustomList, CustomListEntry, TMDBShow } from "../types";

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

/** Newest first; the same list back when the title is already in or the list is full */
export function addItemToList(list: CustomList, entry: CustomListEntry, now: number): CustomList {
	if (listHasItem(list, entry.tmdbId, entry.mediaType)) return list;
	if (list.items.length >= CUSTOM_LIST_ITEM_MAX) return list;
	return { ...list, items: [{ ...entry, addedAt: now }, ...list.items], updatedAt: now };
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

/** Oldest list first — positions stay put as lists are added to */
export const sortLists = (lists: CustomList[]): CustomList[] =>
	[...lists].sort((a, b) => a.createdAt - b.createdAt);
