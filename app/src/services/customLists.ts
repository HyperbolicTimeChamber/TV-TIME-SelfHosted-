import {
	getFirestore,
	collection,
	doc,
	getDocs,
	getCountFromServer,
	query,
	orderBy,
	limit,
	setDoc,
	updateDoc,
	deleteDoc,
	writeBatch,
	runTransaction,
	arrayUnion,
} from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	CacheKey,
	CUSTOM_LIST_ITEM_MAX,
	CUSTOM_LISTS_COLLECTION,
	CUSTOM_LISTS_SEEDED_FIELD,
	FAVORITES_LIST_ID,
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

const itemKey = (i: Pick<CustomListItem, "tmdbId" | "mediaType">) => `${i.mediaType}_${i.tmdbId}`;

/** A stored items array as titles: bad entries dropped, one entry per title (the first — the
 *  earliest added). Two devices adding the same title store it twice (arrayUnion compares whole
 *  objects, addedAt included) */
function parseItems(raw: unknown): CustomListItem[] {
	const seen = new Set<string>();
	const items: CustomListItem[] = [];
	for (const entry of Array.isArray(raw) ? raw : []) {
		const item = parseItem(entry);
		if (!item || seen.has(itemKey(item))) continue;
		seen.add(itemKey(item));
		items.push(item);
	}
	return items;
}

function parseList(id: string, data: any): CustomList {
	return {
		id,
		name: typeof data.name === "string" ? data.name : "",
		items: parseItems(data.items),
		createdAt: num(data.createdAt, 0),
		updatedAt: num(data.updatedAt, 0),
		...(typeof data.order === "number" ? { order: data.order } : {}),
	};
}

/** Every list the user has — one read per list doc (items live inside it) */
export async function fetchCustomLists(userId: string): Promise<CustomList[]> {
	return trackApi("firestore", "fetchCustomLists", async () => {
		const snap = await getDocs(listsRef(userId));
		return snap.docs.map((d) => parseList(d.id, d.data()));
	});
}

// ── Device cache: the lists as last seen, one AsyncStorage value per list ──

const cacheIndexKey = (userId: string) => `${CacheKey.CUSTOM_LISTS_CACHE}${userId}`;
const cacheListKey = (userId: string, listId: string) =>
	`${CacheKey.CUSTOM_LIST_CACHE}${userId}_${listId}`;

async function readListsCache(userId: string): Promise<CustomList[] | null> {
	try {
		const index = await AsyncStorage.getItem(cacheIndexKey(userId));
		if (!index) return null;
		const ids: string[] = JSON.parse(index);
		const values = await AsyncStorage.getMany(ids.map((id) => cacheListKey(userId, id)));
		const lists: CustomList[] = [];
		for (const id of ids) {
			const raw = values[cacheListKey(userId, id)];
			// A list missing from storage: the cache is incomplete — refetch rather than lose it
			if (!raw) return null;
			lists.push(JSON.parse(raw));
		}
		return lists;
	} catch {
		return null;
	}
}

/** Saves the lists as the hook holds them (after every local edit and fetch) */
export async function saveListsCache(userId: string, lists: CustomList[]): Promise<void> {
	try {
		const previous = await AsyncStorage.getItem(cacheIndexKey(userId));
		const ids = lists.map((l) => l.id);
		const gone = (previous ? (JSON.parse(previous) as string[]) : []).filter(
			(id) => !ids.includes(id),
		);
		await AsyncStorage.setMany(
			Object.fromEntries([
				...lists.map((l) => [cacheListKey(userId, l.id), JSON.stringify(l)]),
				[cacheIndexKey(userId), JSON.stringify(ids)],
			]),
		);
		if (gone.length > 0) await AsyncStorage.removeMany(gone.map((id) => cacheListKey(userId, id)));
	} catch (err) {
		console.warn("[customLists] cache not saved:", err);
	}
}

/**
 * Whether the saved lists still match the server, for 2 reads instead of one per list: the same
 * number of lists, and the most recently updated one is the saved copy (every write bumps
 * updatedAt). Another device's write with a clock behind ours can slip past until the next change
 */
async function cacheIsCurrent(userId: string, cached: CustomList[]): Promise<boolean> {
	const ref = listsRef(userId);
	const [count, latest] = await Promise.all([
		getCountFromServer(ref),
		getDocs(query(ref, orderBy("updatedAt", "desc"), limit(1))),
	]);
	if (count.data().count !== cached.length) return false;
	const newest = latest.docs[0];
	if (!newest) return cached.length === 0;
	const saved = cached.find((l) => l.id === newest.id);
	return !!saved && saved.updatedAt === num(newest.data().updatedAt, 0);
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
 * once per user, ever: the flag lives on users/{uid}, so deleting it on one device doesn't bring
 * it back on another. One transaction — two devices loading at once can't both create it (and
 * its fixed id makes a retry write the same doc). This device remembers the flag so later loads
 * skip the check. Returns the lists to show.
 */
async function seedDefaultLists(userId: string, lists: CustomList[]): Promise<CustomList[]> {
	const flagKey = `${CacheKey.CUSTOM_LISTS_SEEDED}${userId}`;
	try {
		if ((await AsyncStorage.getItem(flagKey)) === "1") return lists;
		const hasFavorites = lists.some(
			(l) => l.name.toLowerCase() === FAVORITES_LIST_NAME.toLowerCase(),
		);
		const now = Date.now();
		const favorites: CustomList = {
			id: FAVORITES_LIST_ID,
			name: FAVORITES_LIST_NAME,
			items: [],
			createdAt: now,
			updatedAt: now,
			order: FAVORITES_LIST_ORDER,
		};
		const userRef = doc(db, "users", userId);
		const created = await runTransaction(db, async (tx) => {
			const user = await tx.get(userRef);
			if (user.data()?.[CUSTOM_LISTS_SEEDED_FIELD] === true) return false;
			if (!hasFavorites) tx.set(doc(listsRef(userId), favorites.id), listData(favorites));
			tx.set(userRef, { [CUSTOM_LISTS_SEEDED_FIELD]: true }, { merge: true });
			return !hasFavorites;
		});
		await AsyncStorage.setItem(flagKey, "1");
		return created ? [...lists, favorites] : lists;
	} catch (err) {
		// Offline / denied: show what there is; the next load tries again
		console.warn("[customLists] default list not created:", err);
		return lists;
	}
}

/**
 * The lists to show when the hook first needs them: the saved copy when the server agrees with it
 * (2 reads), else a full fetch (one read per list) — seeded with Favorites the first time — and
 * saved. Offline with a saved copy: the saved copy
 */
export async function loadCustomListsWithDefaults(userId: string): Promise<CustomList[]> {
	const cached = await readListsCache(userId);
	if (cached) {
		try {
			if (await cacheIsCurrent(userId, cached)) return cached;
		} catch (err) {
			console.warn("[customLists] freshness check failed, using saved lists:", err);
			return cached;
		}
	}
	const lists = await seedDefaultLists(userId, await fetchCustomLists(userId));
	await saveListsCache(userId, lists);
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

/** arrayUnion: atomic on the server, no read. The same title added from two devices lands twice
 *  (addedAt differs); reads keep one (parseItems) and a remove takes them all */
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

/**
 * Rewrites a list's titles from the server copy, in a transaction (1 read): `change` gets what is
 * stored now — including another device's edits this one hasn't seen — so nothing it didn't mean
 * to touch is lost. Returns the titles as saved (null: the list is gone)
 */
async function updateStoredItems(
	userId: string,
	listId: string,
	updatedAt: number,
	change: (stored: CustomListItem[]) => CustomListItem[],
): Promise<CustomListItem[] | null> {
	const ref = doc(listsRef(userId), listId);
	return runTransaction(db, async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists()) return null;
		const items = change(parseItems(snap.data()?.items));
		tx.update(ref, { items, updatedAt });
		return items;
	});
}

/** Removes every stored copy of a title (a duplicate from a two-device add included) */
export async function removeCustomListItem(
	userId: string,
	listId: string,
	item: Pick<CustomListItem, "tmdbId" | "mediaType">,
	updatedAt: number,
): Promise<CustomListItem[] | null> {
	return trackApi("firestore", "removeCustomListItem", async () =>
		updateStoredItems(userId, listId, updatedAt, (stored) =>
			stored.filter((i) => itemKey(i) !== itemKey(item)),
		),
	);
}

/**
 * Saves a drag-to-reorder: the stored titles in `ordered`'s order. Titles added elsewhere since
 * (not in `ordered`) keep their place at the end; ones removed elsewhere stay removed
 */
export async function reorderCustomListItems(
	userId: string,
	listId: string,
	ordered: CustomListItem[],
	updatedAt: number,
): Promise<CustomListItem[] | null> {
	return trackApi("firestore", "reorderCustomListItems", async () =>
		updateStoredItems(userId, listId, updatedAt, (stored) => {
			const byKey = new Map(stored.map((i) => [itemKey(i), i]));
			const placed = ordered.flatMap((i) => byKey.get(itemKey(i)) ?? []);
			const placedKeys = new Set(placed.map(itemKey));
			return [...placed, ...stored.filter((i) => !placedKeys.has(itemKey(i)))];
		}),
	);
}

/** Saves the Lists page order: one batch, one `order` per list. updatedAt moves too, so other
 *  devices' saved copies see the change (cacheIsCurrent) */
export async function setCustomListOrders(
	userId: string,
	orders: Array<{ id: string; order: number }>,
	updatedAt: number,
): Promise<void> {
	return trackApi("firestore", "setCustomListOrders", async () => {
		const batch = writeBatch(db);
		for (const { id, order } of orders) {
			batch.update(doc(listsRef(userId), id), { order, updatedAt });
		}
		await batch.commit();
	});
}

/**
 * An import in one transaction: new lists written; same-name lists get the imported titles they
 * lack, added to what is stored now (one read per merged list) — never replacing the stored
 * array, so another device's edits survive. Returns each merged list's titles as saved
 */
export async function applyCustomListsImport(
	userId: string,
	creates: CustomList[],
	merges: Array<{ listId: string; add: CustomListItem[] }>,
	updatedAt: number,
): Promise<Map<string, CustomListItem[]>> {
	return trackApi("firestore", "applyCustomListsImport", async () =>
		runTransaction(db, async (tx) => {
			const refs = merges.map((m) => doc(listsRef(userId), m.listId));
			const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
			const saved = new Map<string, CustomListItem[]>();
			for (const list of creates) tx.set(doc(listsRef(userId), list.id), listData(list));
			merges.forEach((m, n) => {
				if (!snaps[n].exists()) return;
				const stored = parseItems(snaps[n].data()?.items);
				const have = new Set(stored.map(itemKey));
				const items = [...stored, ...m.add.filter((i) => !have.has(itemKey(i)))].slice(
					0,
					CUSTOM_LIST_ITEM_MAX,
				);
				tx.update(refs[n], { items, updatedAt });
				saved.set(m.listId, items);
			});
			return saved;
		}),
	);
}
