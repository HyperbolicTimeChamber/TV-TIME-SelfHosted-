import {
	getFirestore,
	collection,
	doc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	arrayUnion,
	arrayRemove,
} from "@react-native-firebase/firestore";
import { CUSTOM_LISTS_COLLECTION, MediaType } from "../enums";
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
			};
		});
	});
}

/** Writes a whole new list (optionally with its first title) */
export async function createCustomList(userId: string, list: CustomList): Promise<void> {
	return trackApi("firestore", "createCustomList", async () => {
		const { id, ...data } = list;
		await setDoc(doc(listsRef(userId), id), data);
	});
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
