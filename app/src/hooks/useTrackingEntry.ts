import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore, doc, collection, onSnapshot } from "@react-native-firebase/firestore";
import { CacheKey } from "../enums";
import type { HistoryEntry, MediaType } from "../types";
import { onShowAdded, onShowRemoved, showDocId } from "../utils";
import { toEntry } from "../services/historyApi";

/** Last tracking state seen per user/title (null = not tracked), also kept on the device */
const lastEntry = new Map<string, HistoryEntry | null>();

const storageKey = (userId: string, docId: string) => `${CacheKey.LIST_TRACKING}${userId}_${docId}`;

async function readStored(userId: string, docId: string): Promise<HistoryEntry | null | undefined> {
	try {
		const raw = await AsyncStorage.getItem(storageKey(userId, docId));
		return raw === null ? undefined : (JSON.parse(raw) as HistoryEntry | null);
	} catch {
		return undefined;
	}
}

/**
 * One title's tracking state as a Watch History entry, for the list cards' tags. Renders from the
 * device copy at once. A title last seen as NOT tracked is not read at all: only adding it to the
 * watchlist (a local event) starts following it. A tracked or never-seen title is followed live —
 * the first snapshot comes from the device's Firestore cache, the server only sends what changed.
 * undefined = not known yet, null = not tracked.
 */
export function useTrackingEntry(
	userId: string | undefined,
	tmdbId: number,
	mediaType: MediaType,
): HistoryEntry | null | undefined {
	const docId = showDocId(tmdbId, mediaType);
	const key = userId ? `${userId}/${docId}` : null;
	const [entry, setEntry] = useState<HistoryEntry | null | undefined>(() =>
		key ? lastEntry.get(key) : undefined,
	);
	// Following the doc live: false only while the title is known to be untracked
	const [follow, setFollow] = useState(() => !(key && lastEntry.get(key) === null));

	useEffect(() => {
		if (!key || !userId) return;
		let alive = true;
		if (!lastEntry.has(key)) {
			readStored(userId, docId).then((stored) => {
				if (!alive || stored === undefined || lastEntry.has(key)) return;
				lastEntry.set(key, stored);
				setEntry(stored);
				setFollow(stored !== null);
			});
		}
		// Added / removed from this device: the only ways an untracked title becomes tracked here
		const offAdd = onShowAdded((item) => {
			if (item.tmdbId === tmdbId) setFollow(true);
		});
		const offRemove = onShowRemoved((id) => {
			if (id !== tmdbId) return;
			lastEntry.set(key, null);
			AsyncStorage.setItem(storageKey(userId, docId), "null").catch(() => {});
			setEntry(null);
			setFollow(false);
		});
		return () => {
			alive = false;
			offAdd();
			offRemove();
		};
	}, [key, userId, docId, tmdbId]);

	useEffect(() => {
		if (!key || !userId || !follow) return;
		const ref = doc(collection(doc(getFirestore(), "users", userId), "tracking"), docId);
		return onSnapshot(
			ref,
			(snap) => {
				const next = snap.exists() ? toEntry(snap.id, snap.data() as Record<string, any>) : null;
				lastEntry.set(key, next);
				AsyncStorage.setItem(storageKey(userId, docId), JSON.stringify(next)).catch(() => {});
				setEntry(next);
				// Untracked: stop listening (a doc that isn't there needn't be watched)
				if (next === null) setFollow(false);
			},
			() => setEntry((prev) => prev ?? null),
		);
	}, [key, userId, docId, follow]);

	return entry;
}
