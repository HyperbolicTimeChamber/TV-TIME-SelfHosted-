import { useEffect, useState, useRef } from "react";
import { getFirestore, doc, onSnapshot } from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserStats, CacheKey } from "../types";

const defaultStats: UserStats = {
	episodesWatched: 0,
	showsTracking: 0,
	moviesWatched: 0,
	totalMinutes: 0,
};

export function useUserStats(userId: string | undefined) {
	const [stats, setStats] = useState<UserStats>(defaultStats);
	const [loading, setLoading] = useState(true);
	const restoredCache = useRef(false);

	// Restore cached stats on mount
	useEffect(() => {
		if (!userId || restoredCache.current) return;
		AsyncStorage.getItem(CacheKey.USER_STATS).then((raw) => {
			if (!raw) return;
			try {
				const cached = JSON.parse(raw);
				if (cached.userId === userId) {
					setStats(cached.stats);
					setLoading(false);
				}
			} catch {}
			restoredCache.current = true;
		});
	}, [userId]);

	useEffect(() => {
		if (!userId) {
			setStats(defaultStats);
			setLoading(false);
			return;
		}

		const db = getFirestore();
		const docRef = doc(db, "users", userId);

		const unsubscribe = onSnapshot(
			docRef,
			(snap) => {
				if (snap.exists()) {
					const data = snap.data();
					const raw = data?.stats;
					const fresh: UserStats = {
						episodesWatched: Math.max(0, raw?.episodesWatched ?? 0),
						showsTracking: Math.max(0, raw?.showsTracking ?? 0),
						moviesWatched: Math.max(0, raw?.moviesWatched ?? 0),
						totalMinutes: Math.max(0, raw?.totalMinutes ?? 0),
					};
					setStats(fresh);
					AsyncStorage.setItem(CacheKey.USER_STATS, JSON.stringify({ userId, stats: fresh })).catch(
						() => {},
					);
				}
				setLoading(false);
			},
			(error) => {
				console.error("UserStats listener error:", error);
				setLoading(false);
			},
		);

		return unsubscribe;
	}, [userId]);

	return { stats, loading };
}
