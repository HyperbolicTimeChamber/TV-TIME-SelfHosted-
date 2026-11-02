import { useEffect, useState } from "react";
import { getFirestore, doc, collection, onSnapshot } from "@react-native-firebase/firestore";
import type { HistoryEntry, MediaType } from "../types";
import { showDocId } from "../utils";
import { toEntry } from "../services/historyApi";

/** Last tracking state seen per user/title: a re-opened list renders it at once, no loader */
const lastEntry = new Map<string, HistoryEntry | null>();

/**
 * One title's tracking doc as a Watch History entry, followed live. Off (`enabled` false) for a
 * title that isn't tracked — no read at all. undefined = still loading, null = no such doc.
 */
export function useTrackingEntry(
	userId: string | undefined,
	tmdbId: number,
	mediaType: MediaType,
	enabled: boolean,
): HistoryEntry | null | undefined {
	const key = userId ? `${userId}/${showDocId(tmdbId, mediaType)}` : null;
	const [entry, setEntry] = useState<HistoryEntry | null | undefined>(() =>
		key && lastEntry.has(key) ? lastEntry.get(key) : undefined,
	);
	useEffect(() => {
		if (!key || !userId || !enabled) return;
		const ref = doc(
			collection(doc(getFirestore(), "users", userId), "tracking"),
			showDocId(tmdbId, mediaType),
		);
		return onSnapshot(
			ref,
			(snap) => {
				const next = snap.exists() ? toEntry(snap.id, snap.data() as Record<string, any>) : null;
				lastEntry.set(key, next);
				setEntry(next);
			},
			() => setEntry(null),
		);
	}, [key, userId, tmdbId, mediaType, enabled]);
	return key && !enabled ? null : entry;
}
