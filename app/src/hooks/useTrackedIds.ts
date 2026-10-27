import { useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { QueryKey } from "../types";
import { getFirestore, collection, doc, getDocs } from "@react-native-firebase/firestore";
import { onShowAdded, onShowRemoved } from "../utils";

/** Every tracked tmdbId (tv + movie). One tracking read per session, shared by Search + Calendar */
async function fetchTrackedIds(userId: string): Promise<Set<number>> {
	const snapshot = await getDocs(collection(doc(getFirestore(), "users", userId), "tracking"));
	const tracked = new Set<number>();
	for (const d of snapshot.docs) tracked.add(Number(d.id.replace(/^(tv|movie)_/, "")));
	return tracked;
}

/** Options for the shared tracked-ids query (useQuery / ensureQueryData) */
export const trackedIdsQuery = (userId: string) => ({
	queryKey: [QueryKey.TRACKED_IDS, userId],
	queryFn: () => fetchTrackedIds(userId),
	// Kept current by the local add/remove events below — never refetched
	staleTime: Infinity,
});

// Stable fallback — a new Set per render would re-run every memo keyed on the ids
const NO_IDS: ReadonlySet<number> = new Set<number>();

export function useTrackedIds(userId: string | undefined) {
	const queryClient = useQueryClient();

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

	const { data: ids = NO_IDS as Set<number> } = useQuery<Set<number>>({
		...trackedIdsQuery(userId ?? ""),
		enabled: !!userId,
	});

	return ids;
}
