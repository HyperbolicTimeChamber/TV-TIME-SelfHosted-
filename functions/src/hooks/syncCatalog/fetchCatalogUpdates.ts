import { FieldValue } from "firebase-admin/firestore";
import { fetchShowFromTMDB, fetchShowStatus, pooled, CatalogShow } from "../tmdb";
import { MediaType, ENDED_STATUSES } from "../../shared/enums";

export interface FetchResult {
	freshCatalogMap: Map<string, CatalogShow>;
	pendingWrites: Array<{
		ref: FirebaseFirestore.DocumentReference;

		data: Record<string, any>;
	}>;
	pendingReactivations: Array<{
		showId: string;
		freshData: CatalogShow;
	}>;
	hasEpisodeRemovals: boolean;
	skippedEnded: number;
}

export async function fetchCatalogUpdates(
	apiKey: string,
	showsSnap: FirebaseFirestore.QuerySnapshot,
): Promise<FetchResult> {
	const freshCatalogMap = new Map<string, CatalogShow>();
	let hasEpisodeRemovals = false;
	let skippedEnded = 0;

	const pendingWrites: FetchResult["pendingWrites"] = [];
	const pendingReactivations: FetchResult["pendingReactivations"] = [];

	const syncTasks = showsSnap.docs.map((showDoc) => async () => {
		const oldData = showDoc.data() as CatalogShow & {
			trackedBy: string[];
			trackedByCount: number;
		};

		// Ended/canceled: lightweight status check only (1 API call vs ~6)
		if (ENDED_STATUSES.includes(oldData.status)) {
			try {
				const freshStatus = await fetchShowStatus(apiKey, oldData.tmdbId);
				if (ENDED_STATUSES.includes(freshStatus)) {
					freshCatalogMap.set(showDoc.id, oldData);
					skippedEnded++;
					return;
				}
				console.log(`Show revived: ${oldData.title} (${oldData.status} → ${freshStatus})`);
			} catch {
				freshCatalogMap.set(showDoc.id, oldData);
				skippedEnded++;
				return;
			}
		}

		try {
			const freshData = await fetchShowFromTMDB(apiKey, oldData.tmdbId, MediaType.TV);

			const oldEpCount = oldData.totalEpisodes ?? 0;
			const newEpCount = freshData.totalEpisodes ?? 0;
			const hasNewContent = newEpCount > oldEpCount;
			if (newEpCount < oldEpCount) hasEpisodeRemovals = true;

			pendingWrites.push({
				ref: showDoc.ref,
				data: {
					title: freshData.title,
					posterPath: freshData.posterPath,
					backdropPath: freshData.backdropPath,
					overview: freshData.overview,
					status: freshData.status,
					totalSeasons: freshData.totalSeasons,
					totalEpisodes: freshData.totalEpisodes,
					runtime: freshData.runtime,
					voteAverage: freshData.voteAverage,
					seasons: freshData.seasons,
					genres: freshData.genres,
					lastSyncedAt: FieldValue.serverTimestamp(),
				},
			});

			freshCatalogMap.set(showDoc.id, freshData);

			if (hasNewContent) {
				console.log(`New content for ${freshData.title}: ${oldEpCount} → ${newEpCount} episodes`);
				pendingReactivations.push({ showId: showDoc.id, freshData });
			}
		} catch (err) {
			freshCatalogMap.set(showDoc.id, oldData);
			console.error(`Failed to sync show ${oldData.tmdbId} (${oldData.title}):`, err);
		}
	});

	// Fetch from TMDB in batches of 50 (rate-limited, 5 concurrent)
	for (let i = 0; i < syncTasks.length; i += 50) {
		const chunk = syncTasks.slice(i, i + 50);
		await pooled(chunk, 5);

		if (i + 50 < syncTasks.length) {
			await new Promise((r) => setTimeout(r, 2000));
		}
	}

	return {
		freshCatalogMap,
		pendingWrites,
		pendingReactivations,
		hasEpisodeRemovals,
		skippedEnded,
	};
}
