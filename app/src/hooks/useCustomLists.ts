import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CUSTOM_LIST_MAX, QueryKey } from "../enums";
import type { CustomList, CustomListEntry, CustomListItem, MediaType } from "../types";
import {
	addCustomListItem,
	applyCustomListsImport,
	createCustomList,
	deleteCustomList,
	loadCustomListsWithDefaults,
	newCustomListId,
	removeCustomListItem,
	renameCustomList,
	reorderCustomListItems,
	saveListsCache,
	setCustomListOrders,
} from "../services/customLists";
import {
	addItemToList,
	cleanListName,
	isListNameTaken,
	listHasItem,
	listItemKey,
	listOrders,
	planListsImport,
	removeItemFromList,
	sortLists,
	type ImportedList,
	type ImportPlan,
} from "../utils";

export type CreateListResult =
	{ ok: true; list: CustomList } | { ok: false; reason: "empty" | "taken" | "limit" | "failed" };

/** A write's follow-up: the titles a transaction actually saved, put into the cache */
type Settle = ((lists: CustomList[]) => CustomList[]) | void;

/** A list's titles as the server saved them (null: the list was deleted elsewhere) */
const settleItems =
	(listId: string, items: CustomListItem[] | null) =>
	(lists: CustomList[]): CustomList[] =>
		items === null
			? lists.filter((l) => l.id !== listId)
			: lists.map((l) => (l.id === listId ? { ...l, items } : l));

/**
 * The user's custom lists. Local-first: every edit patches the cached lists straight away and
 * the write follows; a failed write puts the previous lists back. Never invalidates/refetches —
 * loaded once per session (the device copy when the server agrees with it) and saved to the
 * device after every edit. A list is only a bookmark — nothing here touches tracking.
 */
export function useCustomLists(userId: string | undefined) {
	const queryClient = useQueryClient();
	const queryKey = useMemo(() => [QueryKey.CUSTOM_LISTS, userId] as const, [userId]);
	const queryFn = useCallback(
		() =>
			loadCustomListsWithDefaults(userId!, (fresh, saved) => {
				// The server differs from the saved copy shown meanwhile: swap it in — unless an edit
				// has changed the lists since (that one is newer than what the check read)
				if (queryClient.getQueryData<CustomList[]>(queryKey) === saved)
					queryClient.setQueryData(queryKey, fresh);
			}),
		[userId, queryClient, queryKey],
	);

	const { data, isLoading: loading } = useQuery({
		queryKey,
		queryFn,
		enabled: !!userId,
		// Every edit patches the cache itself — nothing to refetch for
		staleTime: Infinity,
		gcTime: Infinity,
	});

	const lists = useMemo(() => sortLists(data ?? []), [data]);

	/** The lists, waiting for the first load if it hasn't landed: an edit checked against an
	 *  empty cache (duplicate names, the list cap) and then overwritten by that load lost it */
	const loadedLists = useCallback(
		() => queryClient.ensureQueryData({ queryKey, queryFn, staleTime: Infinity }),
		[queryClient, queryKey, queryFn],
	);

	/** Set the cached lists and save them to the device */
	const store = useCallback(
		(next: CustomList[] | undefined) => {
			queryClient.setQueryData(queryKey, next);
			if (userId && next) saveListsCache(userId, next);
		},
		[queryClient, queryKey, userId],
	);

	/** Patch the cache, run the write (and apply what it saved); on failure restore what was
	 *  there and report false */
	const mutate = useCallback(
		async (patch: (lists: CustomList[]) => CustomList[], write: () => Promise<Settle>) => {
			const previous = await loadedLists();
			store(patch(previous));
			try {
				const settle = await write();
				if (settle) store(settle(queryClient.getQueryData<CustomList[]>(queryKey) ?? []));
				return true;
			} catch (err) {
				console.error("[customLists] write failed:", err);
				store(previous);
				return false;
			}
		},
		[queryClient, queryKey, loadedLists, store],
	);

	const createList = useCallback(
		async (rawName: string, firstEntry?: CustomListEntry): Promise<CreateListResult> => {
			if (!userId) return { ok: false, reason: "failed" };
			const name = cleanListName(rawName);
			if (!name) return { ok: false, reason: "empty" };
			let current: CustomList[];
			try {
				current = await loadedLists();
			} catch {
				return { ok: false, reason: "failed" };
			}
			if (isListNameTaken(current, name)) return { ok: false, reason: "taken" };
			if (current.length >= CUSTOM_LIST_MAX) return { ok: false, reason: "limit" };
			const now = Date.now();
			const empty: CustomList = {
				id: newCustomListId(userId),
				name,
				items: [],
				createdAt: now,
				updatedAt: now,
			};
			const list = firstEntry ? addItemToList(empty, firstEntry, now) : empty;
			const ok = await mutate(
				(old) => [...old, list],
				() => createCustomList(userId, list),
			);
			return ok ? { ok: true, list } : { ok: false, reason: "failed" };
		},
		[userId, loadedLists, mutate],
	);

	const renameList = useCallback(
		async (listId: string, rawName: string): Promise<"ok" | "empty" | "taken" | "failed"> => {
			if (!userId) return "failed";
			const name = cleanListName(rawName);
			if (!name) return "empty";
			let current: CustomList[];
			try {
				current = await loadedLists();
			} catch {
				return "failed";
			}
			if (isListNameTaken(current, name, listId)) return "taken";
			const now = Date.now();
			const ok = await mutate(
				(old) => old.map((l) => (l.id === listId ? { ...l, name, updatedAt: now } : l)),
				() => renameCustomList(userId, listId, name, now),
			);
			return ok ? "ok" : "failed";
		},
		[userId, loadedLists, mutate],
	);

	const deleteList = useCallback(
		async (listId: string): Promise<boolean> => {
			if (!userId) return false;
			return mutate(
				(old) => old.filter((l) => l.id !== listId),
				() => deleteCustomList(userId, listId),
			);
		},
		[userId, mutate],
	);

	const addToList = useCallback(
		async (listId: string, entry: CustomListEntry): Promise<boolean> => {
			if (!userId) return false;
			const now = Date.now();
			let current: CustomList[];
			try {
				current = await loadedLists();
			} catch {
				return false;
			}
			const target = current.find((l) => l.id === listId);
			if (!target) return false;
			const next = addItemToList(target, entry, now);
			// Already in (or full): nothing to write
			if (next === target) return listHasItem(target, entry.tmdbId, entry.mediaType);
			return mutate(
				(old) => old.map((l) => (l.id === listId ? next : l)),
				() => addCustomListItem(userId, listId, next.items[next.items.length - 1], now),
			);
		},
		[userId, loadedLists, mutate],
	);

	const removeFromList = useCallback(
		async (listId: string, tmdbId: number, mediaType: MediaType): Promise<boolean> => {
			if (!userId) return false;
			const now = Date.now();
			return mutate(
				(old) =>
					old.map((l) => (l.id === listId ? removeItemFromList(l, tmdbId, mediaType, now) : l)),
				async () =>
					settleItems(
						listId,
						await removeCustomListItem(userId, listId, { tmdbId, mediaType }, now),
					),
			);
		},
		[userId, mutate],
	);

	/** Saves a new title order for one list (drag-to-reorder) */
	const reorderItems = useCallback(
		async (listId: string, items: CustomListItem[]): Promise<boolean> => {
			if (!userId) return false;
			const now = Date.now();
			return mutate(
				(old) => old.map((l) => (l.id === listId ? { ...l, items, updatedAt: now } : l)),
				async () => settleItems(listId, await reorderCustomListItems(userId, listId, items, now)),
			);
		},
		[userId, mutate],
	);

	/** Saves the Lists page order (ids in the order they should show) */
	const reorderLists = useCallback(
		async (orderedIds: string[]): Promise<boolean> => {
			if (!userId) return false;
			let current: CustomList[];
			try {
				current = await loadedLists();
			} catch {
				return false;
			}
			const byId = new Map(current.map((l) => [l.id, l]));
			const ordered = orderedIds.map((id) => byId.get(id)).filter((l): l is CustomList => !!l);
			const orders = listOrders(ordered);
			const orderOf = new Map(orders.map((o) => [o.id, o.order]));
			const now = Date.now();
			return mutate(
				(old) =>
					old.map((l) =>
						orderOf.has(l.id) ? { ...l, order: orderOf.get(l.id), updatedAt: now } : l,
					),
				() => setCustomListOrders(userId, orders, now),
			);
		},
		[userId, loadedLists, mutate],
	);

	/** What importing would do — nothing written yet (the caller shows the outcome, then applies) */
	const planImport = useCallback(
		(imported: ImportedList[]): ImportPlan => {
			const current = queryClient.getQueryData<CustomList[]>(queryKey) ?? [];
			return planListsImport(current, imported, Date.now(), () => newCustomListId(userId ?? ""));
		},
		[userId, queryClient, queryKey],
	);

	const applyImport = useCallback(
		async (plan: ImportPlan): Promise<boolean> => {
			if (!userId) return false;
			const now = Date.now();
			const merged = new Map(plan.merges.map((m) => [m.listId, m.items]));
			let current: CustomList[];
			try {
				current = await loadedLists();
			} catch {
				return false;
			}
			// Only the titles the import adds go to the server, merged into what is stored there —
			// the plan's full arrays came from this device's copy and would undo edits made elsewhere
			const adds = plan.merges.map((m) => {
				const have = new Set(
					(current.find((l) => l.id === m.listId)?.items ?? []).map((i) =>
						listItemKey(i.tmdbId, i.mediaType),
					),
				);
				return {
					listId: m.listId,
					add: m.items.filter((i) => !have.has(listItemKey(i.tmdbId, i.mediaType))),
				};
			});
			return mutate(
				(old) => [
					...old.map((l) =>
						merged.has(l.id) ? { ...l, items: merged.get(l.id)!, updatedAt: now } : l,
					),
					...plan.creates,
				],
				async () => {
					const saved = await applyCustomListsImport(userId, plan.creates, adds, now);
					return (lists) =>
						lists.map((l) => (saved.has(l.id) ? { ...l, items: saved.get(l.id)! } : l));
				},
			);
		},
		[userId, loadedLists, mutate],
	);

	return {
		lists,
		loading,
		createList,
		renameList,
		deleteList,
		addToList,
		removeFromList,
		reorderItems,
		reorderLists,
		planImport,
		applyImport,
	};
}
