import { useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { QueryKey } from "../types";
import { getFirestore, collection, doc, getDocs } from "@react-native-firebase/firestore";
import { onShowAdded, onShowRemoved } from "../utils/watchlistEvents";

export function useTrackedIds(userId: string | undefined) {
	const queryClient = useQueryClient();

	// One-time fetch on mount — no real-time listener
	useEffect(() => {
		if (!userId) return;

		const db = getFirestore();
		const colRef = collection(doc(db, "users", userId), "tracking");

		getDocs(colRef).then((snapshot) => {
			const tracked = new Set<number>();
			for (const d of snapshot.docs) {
				const raw = d.id.replace(/^(tv|movie)_/, "");
				tracked.add(Number(raw));
			}
			queryClient.setQueryData([QueryKey.TRACKED_IDS, userId], tracked);
		});
	}, [userId, queryClient]);

	// Local mutations — no Firestore reads
	useEffect(() => {
		const onAdd = (item: { tmdbId: number }) => {
			queryClient.setQueryData<Set<number>>([QueryKey.TRACKED_IDS, userId], (prev) => {
				const next = new Set(prev);
				next.add(item.tmdbId);
				return next;
			});
		};
		const onRemove = (tmdbId: number) => {
			queryClient.setQueryData<Set<number>>([QueryKey.TRACKED_IDS, userId], (prev) => {
				const next = new Set(prev);
				next.delete(tmdbId);
				return next;
			});
		};

		const unsubAdd = onShowAdded(onAdd);
		const unsubRemove = onShowRemoved(onRemove);
		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [userId, queryClient]);

	const { data: ids = new Set<number>() } = useQuery<Set<number>>({
		queryKey: [QueryKey.TRACKED_IDS, userId],
		queryFn: () => new Set<number>(),
		enabled: !!userId,
		staleTime: Infinity,
	});

	return ids;
}
