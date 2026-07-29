// functions/src/cloudFunctions/syncCatalog.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getTmdbApiKey } from "../hooks/apiKey";
import { rebuildAllUsersUpcoming } from "../hooks/upcoming";
import {
	fetchCatalogUpdates,
	batchWriteCatalog,
	reactivateCompletedUsers,
} from "../hooks/syncCatalog";
import { MediaType, ENDED_STATUSES } from "../shared/enums";

export const syncCatalog = onSchedule(
	{
		schedule: "0 3 * * 0", // Every Sunday 3:00 AM UTC
		maxInstances: 1,
		timeoutSeconds: 540,
		memory: "512MiB",
		retryCount: 1,
	},
	async () => {
		const db = getFirestore();
		let apiKey: string;
		try {
			apiKey = await getTmdbApiKey();
		} catch {
			console.error("TMDB API key not configured in config/app");
			return;
		}

		// Phase 1: Read all TV shows
		const showsSnap = await db.collection("shows").where("mediaType", "==", MediaType.TV).get();
		console.log(`Syncing ${showsSnap.size} TV shows`);

		// Phase 2: Fetch updates from TMDB
		const {
			freshCatalogMap,
			pendingWrites,
			pendingReactivations,
			hasEpisodeRemovals,
			skippedEnded,
		} = await fetchCatalogUpdates(apiKey, showsSnap);
		console.log(`Skipped ${skippedEnded} ended/canceled shows`);

		// Phase 3: Batch write catalog updates
		await batchWriteCatalog(db, pendingWrites);

		// Phase 4: Reactivate completed users
		await reactivateCompletedUsers(db, showsSnap, pendingReactivations);

		// Phase 5: Build active shows index
		const activeShowIds: string[] = [];
		for (const [id, catalog] of freshCatalogMap) {
			if (!ENDED_STATUSES.includes(catalog.status)) {
				activeShowIds.push(id);
			}
		}
		await db.doc("config/activeShows").set({ ids: activeShowIds });
		console.log(`Active shows index: ${activeShowIds.length} shows`);

		// Phase 6: Rebuild upcoming
		console.log("Rebuilding upcoming episodes...");
		await rebuildAllUsersUpcoming(db, freshCatalogMap, !hasEpisodeRemovals);

		// Phase 7: Write sync timestamp
		await db
			.doc("config/app")
			.set({ lastCatalogSync: FieldValue.serverTimestamp() }, { merge: true });

		console.log("Catalog sync complete");
	},
);
