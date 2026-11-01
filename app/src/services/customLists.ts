import {
	getFirestore,
	collection,
	doc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	writeBatch,
	arrayUnion,
	arrayRemove,
} from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	CacheKey,
	CUSTOM_LISTS_COLLECTION,
	FAVORITES_LIST_NAME,
	FAVORITES_LIST_ORDER,
	MediaType,
} from "../enums";
import type { CustomList, CustomListItem } from "../types";
import { trackApi } from "./analytics";

const db = getFirestore();

function listsRef(userId: string) {
	return collection(doc(db, "users", userId), CUSTOM_LISTS_COLLECTION);
}

/** Auto-generated id for a list not written yet (no round trip) */
export function newCustomListId(userId: string): string {
	return doc(listsRef(userId)).id;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);

function parseItem(raw: any): CustomListItem | null {
	if (typeof raw?.tmdbId !== "number") return null;
	return {
		tmdbId: raw.tmdbId,
		mediaType: raw.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV,
		title: typeof raw.title === "string" ? raw.title : "",
		posterPath: typeof raw.posterPath === "string" ? raw.posterPath : null,
		addedAt: num(raw.addedAt, 0),
	};
}

/** Every list the user has — one read per list doc (items live inside it) */
export async function fetchCustomLists(userId: string): Promise<CustomList[]> {
	return trackApi("firestore", "fetchCustomLists", async () => {
		const snap = await getDocs(listsRef(userId));
		return snap.docs.map((d) => {
			const data = d.data();
			const items = (Array.isArray(data.items) ? data.items : [])
				.map(parseItem)
				.filter((i): i is CustomListItem => i !== null);
			return {
				id: d.id,
				name: typeof data.name === "string" ? data.name : "",
				items,
				createdAt: num(data.createdAt, 0),
				updatedAt: num(data.updatedAt, 0),
				...(typeof data.order === "number" ? { order: data.order } : {}),
			};
		});
	});
}

/** A list's fields as stored (no id; `order` only when set — Firestore rejects undefined) */
function listData(list: CustomList) {
	const { id: _id, order, ...rest } = list;
	return order === undefined ? rest : { ...rest, order };
}

/** Writes a whole new list (optionally with its first title) */
export async function createCustomList(userId: string, list: CustomList): Promise<void> {
	return trackApi("firestore", "createCustomList", async () => {
		await setDoc(doc(listsRef(userId), list.id), listData(list));
	});
}

/**
 * Every user starts with a "Favorites" list — an ordinary one they may rename or delete. Offered
 * once per user on this device (flag in storage), so deleting it doesn't bring it back. A user who
 * already has a list called Favorites just gets the flag. Returns the lists to show.
 */
export async function loadCustomListsWithDefaults(userId: string): Promise<CustomList[]> {
	const lists = await fetchCustomLists(userId);
	const flagKey = `${CacheKey.CUSTOM_LISTS_SEEDED}${userId}`;
	try {
		if ((await AsyncStorage.getItem(flagKey)) === "1") return lists;
		if (!lists.some((l) => l.name.toLowerCase() === FAVORITES_LIST_NAME.toLowerCase())) {
			const now = Date.now();
			const favorites: CustomList = {
				id: newCustomListId(userId),
				name: FAVORITES_LIST_NAME,
				items: [],
				createdAt: now,
				updatedAt: now,
				order: FAVORITES_LIST_ORDER,
			};
			await createCustomList(userId, favorites);
			lists.push(favorites);
		}
		await AsyncStorage.setItem(flagKey, "1");
	} catch (err) {
		// Offline / denied: show what there is; the next load tries again
		console.warn("[customLists] default list not created:", err);
	}
	return lists;
}

export async function renameCustomList(
	userId: string,
	listId: string,
	name: string,
	updatedAt: number,
): Promise<void> {
	return trackApi("firestore", "renameCustomList", async () => {
		await updateDoc(doc(listsRef(userId), listId), { name, updatedAt });
	});
}

export async function deleteCustomList(userId: string, listId: string): Promise<void> {
	return trackApi("firestore", "deleteCustomList", async () => {
		await deleteDoc(doc(listsRef(userId), listId));
	});
}

/** arrayUnion / arrayRemove: atomic on the server, so two devices editing one list never overwrite each other */
export async function addCustomListItem(
	userId: string,
	listId: string,
	item: CustomListItem,
	updatedAt: number,
): Promise<void> {
	return trackApi("firestore", "addCustomListItem", async () => {
		await updateDoc(doc(listsRef(userId), listId), { items: arrayUnion(item), updatedAt });
	});
}

/** `item` must be the stored copy (arrayRemove matches the whole object, addedAt included) */
export async function removeCustomListItem(
	userId: string,
	listId: string,
	item: CustomListItem,
	updatedAt: number,
): Promise<void> {
	return trackApi("firestore", "removeCustomListItem", async () => {
		await updateDoc(doc(listsRef(userId), listId), { items: arrayRemove(item), updatedAt });
	});
}

/** Replaces a list's titles (reorder / import merge) */
export async function setCustomListItems(
	userId: string,
	listId: string,
	items: CustomListItem[],
	updatedAt: number,
): Promise<void> {
	return trackApi("firestore", "setCustomListItems", async () => {
		await updateDoc(doc(listsRef(userId), listId), { items, updatedAt });
	});
}

/** Saves the Lists page order: one batch, one `order` per list */
export async function setCustomListOrders(
	userId: string,
	orders: Array<{ id: string; order: number }>,
): Promise<void> {
	return trackApi("firestore", "setCustomListOrders", async () => {
		const batch = writeBatch(db);
		for (const { id, order } of orders) batch.update(doc(listsRef(userId), id), { order });
		await batch.commit();
	});
}

/** An import in one batch: new lists written, same-name lists get their new titles */
export async function applyCustomListsImport(
	userId: string,
	creates: CustomList[],
	merges: Array<{ listId: string; items: CustomListItem[] }>,
	updatedAt: number,
): Promise<void> {
	return trackApi("firestore", "applyCustomListsImport", async () => {
		const batch = writeBatch(db);
		for (const list of creates) batch.set(doc(listsRef(userId), list.id), listData(list));
		for (const m of merges) {
			batch.update(doc(listsRef(userId), m.listId), { items: m.items, updatedAt });
		}
		await batch.commit();
	});
}
