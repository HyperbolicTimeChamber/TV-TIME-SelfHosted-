import {
	CUSTOM_LIST_ITEM_MAX,
	CUSTOM_LIST_MAX,
	LISTS_EXPORT_FORMAT,
	LISTS_EXPORT_VERSION,
	MediaType,
} from "../enums";
import type { CustomList, CustomListItem } from "../types";
import { cleanListName, listItemKey, sortLists } from "./customLists";

/**
 * The file a list is exported to — plain JSON so it can be posted anywhere and imported by anyone.
 * Positions are 1-based; titles carry their name (readable) and TMDB id (what import matches on).
 */
export interface ListsExport {
	format: typeof LISTS_EXPORT_FORMAT;
	version: number;
	exportedAt: string;
	lists: Array<{
		name: string;
		items: Array<{
			position: number;
			tmdbId: number;
			mediaType: MediaType;
			title: string;
			posterPath: string | null;
		}>;
	}>;
}

export function buildListsExport(lists: CustomList[], now: number): ListsExport {
	return {
		format: LISTS_EXPORT_FORMAT,
		version: LISTS_EXPORT_VERSION,
		exportedAt: new Date(now).toISOString(),
		lists: sortLists(lists).map((l) => ({
			name: l.name,
			items: l.items.map((i, idx) => ({
				position: idx + 1,
				tmdbId: i.tmdbId,
				mediaType: i.mediaType,
				title: i.title,
				posterPath: i.posterPath,
			})),
		})),
	};
}

/** "watchloom-list-sci-fi-night.json" for one list, "watchloom-lists-2026-11-02.json" for several */
export function listsExportFileName(lists: CustomList[], now: number): string {
	if (lists.length === 1) {
		const slug = lists[0].name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40);
		return `watchloom-list-${slug || "export"}.json`;
	}
	return `watchloom-lists-${new Date(now).toISOString().slice(0, 10)}.json`;
}

export interface ImportedList {
	name: string;
	items: Array<Pick<CustomListItem, "tmdbId" | "mediaType" | "title" | "posterPath">>;
}

export type ParseResult =
	| { ok: true; lists: ImportedList[] }
	| { ok: false; reason: "invalid" | "newer" | "empty" };

const POSTER_PATH = /^\/[\w.-]{1,100}$/;
const TITLE_MAX = 200;

function parseItem(raw: any): { position: number; item: ImportedList["items"][number] } | null {
	const tmdbId = raw?.tmdbId;
	if (!Number.isInteger(tmdbId) || tmdbId <= 0 || tmdbId >= 1e9) return null;
	if (raw.mediaType !== MediaType.TV && raw.mediaType !== MediaType.MOVIE) return null;
	const title = typeof raw.title === "string" ? raw.title.trim().slice(0, TITLE_MAX) : "";
	const posterPath =
		typeof raw.posterPath === "string" && POSTER_PATH.test(raw.posterPath) ? raw.posterPath : null;
	return {
		position: typeof raw.position === "number" ? raw.position : Number.MAX_SAFE_INTEGER,
		item: { tmdbId, mediaType: raw.mediaType, title, posterPath },
	};
}

/** Reads an exported file; anything that isn't ours (or is malformed) is refused, bad entries are skipped */
export function parseListsExport(text: string): ParseResult {
	let data: any;
	try {
		data = JSON.parse(text);
	} catch {
		return { ok: false, reason: "invalid" };
	}
	if (data?.format !== LISTS_EXPORT_FORMAT || !Array.isArray(data.lists)) {
		return { ok: false, reason: "invalid" };
	}
	if (typeof data.version === "number" && data.version > LISTS_EXPORT_VERSION) {
		return { ok: false, reason: "newer" };
	}
	const lists: ImportedList[] = [];
	for (const rawList of data.lists.slice(0, CUSTOM_LIST_MAX)) {
		const name = cleanListName(typeof rawList?.name === "string" ? rawList.name : "");
		if (!name || !Array.isArray(rawList.items)) continue;
		const parsed = rawList.items
			.slice(0, CUSTOM_LIST_ITEM_MAX)
			.map(parseItem)
			.filter((p: ReturnType<typeof parseItem>): p is NonNullable<typeof p> => p !== null);
		// Array.sort is stable: equal / missing positions keep file order
		parsed.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
		lists.push({ name, items: parsed.map((p: { item: ImportedList["items"][number] }) => p.item) });
	}
	return lists.length > 0 ? { ok: true, lists } : { ok: false, reason: "empty" };
}

export interface ImportPlan {
	/** Brand-new lists to write */
	creates: CustomList[];
	/** Existing lists (same name) that gain titles — `items` is the whole new array */
	merges: Array<{ listId: string; items: CustomListItem[] }>;
	listsCreated: number;
	listsMerged: number;
	titlesAdded: number;
	/** Lists left out because the user is at the list limit */
	listsSkipped: number;
}

/**
 * What an import does: a list whose name the user already has gets the titles it lacks added at
 * its end (importing the same file twice changes nothing); other lists are created. Item order
 * from the file is kept.
 */
export function planListsImport(
	existing: CustomList[],
	imported: ImportedList[],
	now: number,
	newId: () => string,
): ImportPlan {
	const plan: ImportPlan = {
		creates: [],
		merges: [],
		listsCreated: 0,
		listsMerged: 0,
		titlesAdded: 0,
		listsSkipped: 0,
	};
	// Working copies by lowercase name, so two imported lists of one name also merge
	const byName = new Map<string, { list: CustomList; isNew: boolean; changed: boolean }>();
	for (const l of existing) byName.set(l.name.toLowerCase(), { list: l, isNew: false, changed: false });
	let count = existing.length;
	let made = 0;

	for (const imp of imported) {
		let entry = byName.get(imp.name.toLowerCase());
		if (!entry) {
			if (count >= CUSTOM_LIST_MAX) {
				plan.listsSkipped++;
				continue;
			}
			// createdAt steps by 1ms so imported lists keep the file's order
			const list: CustomList = {
				id: newId(),
				name: imp.name,
				items: [],
				createdAt: now + made++,
				updatedAt: now,
			};
			entry = { list, isNew: true, changed: true };
			byName.set(imp.name.toLowerCase(), entry);
			count++;
		}
		const have = new Set(entry.list.items.map((i) => listItemKey(i.tmdbId, i.mediaType)));
		const added: CustomListItem[] = [];
		for (const item of imp.items) {
			if (entry.list.items.length + added.length >= CUSTOM_LIST_ITEM_MAX) break;
			const key = listItemKey(item.tmdbId, item.mediaType);
			if (have.has(key)) continue;
			have.add(key);
			added.push({ ...item, addedAt: now });
		}
		if (added.length > 0) {
			entry.list = { ...entry.list, items: [...entry.list.items, ...added], updatedAt: now };
			entry.changed = true;
			plan.titlesAdded += added.length;
		}
	}

	for (const { list, isNew, changed } of byName.values()) {
		if (isNew) {
			plan.creates.push(list);
			plan.listsCreated++;
		} else if (changed) {
			plan.merges.push({ listId: list.id, items: list.items });
			plan.listsMerged++;
		}
	}
	return plan;
}

/** One line for the result alert */
export function describeImport(plan: ImportPlan): string {
	const parts: string[] = [];
	if (plan.listsCreated) parts.push(`${plan.listsCreated} new ${plan.listsCreated === 1 ? "list" : "lists"}`);
	if (plan.listsMerged) parts.push(`${plan.listsMerged} ${plan.listsMerged === 1 ? "list" : "lists"} updated`);
	const head = parts.length ? parts.join(", ") : "No new lists";
	const tail = `${plan.titlesAdded} ${plan.titlesAdded === 1 ? "title" : "titles"} added`;
	const skipped = plan.listsSkipped ? ` ${plan.listsSkipped} skipped (list limit reached).` : "";
	return `${head}. ${tail}.${skipped}`;
}
