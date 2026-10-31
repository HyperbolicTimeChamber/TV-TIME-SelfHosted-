import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CUSTOM_LIST_MAX, QueryKey } from "../enums";
import type { CustomList, CustomListEntry, MediaType } from "../types";
import {
	addCustomListItem,
	createCustomList,
	deleteCustomList,
	fetchCustomLists,
	newCustomListId,
	removeCustomListItem,
	renameCustomList,
} from "../services/customLists";
import {
	addItemToList,
	cleanListName,
	isListNameTaken,
	listHasItem,
	removeItemFromList,
	sortLists,
} from "../utils";

export type CreateListResult =
	| { ok: true; list: CustomList }
	| { ok: false; reason: "empty" | "taken" | "limit" | "failed" };

/**
 * The user's custom lists. Local-first: every edit patches the cached lists straight away and
 * the write follows; a failed write puts the previous lists back. Never invalidates/refetches.
 * A list is only a bookmark — nothing here touches tracking.
 */
export function useCustomLists(userId: string | undefined) {
	const queryClient = useQueryClient();
	const queryKey = useMemo(() => [QueryKey.CUSTOM_LISTS, userId] as const, [userId]);

	const { data, isLoading: loading } = useQuery({
		queryKey,
		queryFn: () => fetchCustomLists(userId!),
		enabled: !!userId,
	});

	const lists = useMemo(() => sortLists(data ?? []), [data]);

	/** Patch the cache, run the write; on failure restore what was there and report false */
	const mutate = useCallback(
		async (patch: (lists: CustomList[]) => CustomList[], write: () => Promise<void>) => {
			if (queryClient.getQueryData(queryKey)) await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<CustomList[]>(queryKey);
			queryClient.setQueryData<CustomList[]>(queryKey, (old) => patch(old ?? []));
			try {
				await write();
				return true;
			} catch (err) {
				console.error("[customLists] write failed:", err);
				queryClient.setQueryData(queryKey, previous);
				return false;
			}
		},
		[queryClient, queryKey],
	);

	const createList = useCallback(
		async (rawName: string, firstEntry?: CustomListEntry): Promise<CreateListResult> => {
			if (!userId) return { ok: false, reason: "failed" };
			const name = cleanListName(rawName);
			if (!name) return { ok: false, reason: "empty" };
			const current = queryClient.getQueryData<CustomList[]>(queryKey) ?? [];
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
		[userId, queryClient, queryKey, mutate],
	);

	const renameList = useCallback(
		async (listId: string, rawName: string): Promise<"ok" | "empty" | "taken" | "failed"> => {
			if (!userId) return "failed";
			const name = cleanListName(rawName);
			if (!name) return "empty";
			const current = queryClient.getQueryData<CustomList[]>(queryKey) ?? [];
			if (isListNameTaken(current, name, listId)) return "taken";
			const now = Date.now();
			const ok = await mutate(
				(old) => old.map((l) => (l.id === listId ? { ...l, name, updatedAt: now } : l)),
				() => renameCustomList(userId, listId, name, now),
			);
			return ok ? "ok" : "failed";
		},
		[userId, queryClient, queryKey, mutate],
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
			const current = queryClient.getQueryData<CustomList[]>(queryKey) ?? [];
			const target = current.find((l) => l.id === listId);
			if (!target) return false;
			const next = addItemToList(target, entry, now);
			// Already in (or full): nothing to write
			if (next === target) return listHasItem(target, entry.tmdbId, entry.mediaType);
			return mutate(
				(old) => old.map((l) => (l.id === listId ? next : l)),
				() => addCustomListItem(userId, listId, next.items[0], now),
			);
		},
		[userId, queryClient, queryKey, mutate],
	);

	const removeFromList = useCallback(
		async (listId: string, tmdbId: number, mediaType: MediaType): Promise<boolean> => {
			if (!userId) return false;
			const current = queryClient.getQueryData<CustomList[]>(queryKey) ?? [];
			const target = current.find((l) => l.id === listId);
			const stored = target?.items.find((i) => i.tmdbId === tmdbId && i.mediaType === mediaType);
			if (!target || !stored) return true;
			const now = Date.now();
			return mutate(
				(old) =>
					old.map((l) => (l.id === listId ? removeItemFromList(l, tmdbId, mediaType, now) : l)),
				() => removeCustomListItem(userId, listId, stored, now),
			);
		},
		[userId, queryClient, queryKey, mutate],
	);

	return { lists, loading, createList, renameList, deleteList, addToList, removeFromList };
}
