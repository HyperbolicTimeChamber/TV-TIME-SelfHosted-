import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	getFirestore,
	collection,
	doc,
	query,
	where,
	getCountFromServer,
} from "@react-native-firebase/firestore";
import { CacheKey, WatchStatus } from "../types";

/** Statuses that count as "currently watching" — a rewatch is still watching, a pause isn't */
const ACTIVE = [WatchStatus.WATCHING, WatchStatus.REWATCHING];

/**
 * How many shows are on the go. `stats.showsTracking` can't answer this: it's a counter bumped
 * on add and remove, so it includes paused and completed ones. A count aggregate is one read
 * per 1000 matching docs rather than a read per doc, so asking the server is cheap.
 */
export function useWatchingCount(userId: string | undefined) {
	const [count, setCount] = useState<number | null>(null);

	useEffect(() => {
		if (!userId) {
			setCount(null);
			return;
		}
		let cancelled = false;

		// Cached value first so the card has something to count up to straight away
		AsyncStorage.getItem(CacheKey.WATCHING_COUNT)
			.then((raw) => {
				if (cancelled || !raw) return;
				const cached = JSON.parse(raw);
				if (cached?.userId === userId && typeof cached.count === "number") setCount(cached.count);
			})
			.catch(() => {});

		const tracking = collection(doc(getFirestore(), "users", userId), "tracking");
		getCountFromServer(query(tracking, where("status", "in", ACTIVE)))
			.then((snap) => {
				if (cancelled) return;
				const fresh = snap.data().count;
				setCount(fresh);
				AsyncStorage.setItem(
					CacheKey.WATCHING_COUNT,
					JSON.stringify({ userId, count: fresh }),
				).catch(() => {});
			})
			.catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [userId]);

	return count;
}
