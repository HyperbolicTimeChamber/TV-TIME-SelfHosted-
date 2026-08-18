// functions/src/cloudFunctions/importMatches.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { pooled } from "../hooks/tmdb";
import { getTmdbApiKey } from "../hooks/apiKey";
import { rebuildUserUpcoming } from "../hooks/upcoming";
import { ensureCatalog, buildImportOps } from "../hooks/importMatches";
import { ImportRequest, ImportStats } from "../shared/types";

export const importMatches = onCall(
	{
		maxInstances: 5,
		timeoutSeconds: 3600,
		memory: "1GiB",
	},
	async (request): Promise<ImportStats> => {
		if (!request.auth) {
			throw new HttpsError("unauthenticated", "Must be signed in");
		}
		if (request.data?.warmup)
			return {
				showsImported: 0,
				moviesImported: 0,
				episodesImported: 0,
				minutesImported: 0,
			};

		const { matches } = request.data as ImportRequest;
		if (!matches?.length) {
			throw new HttpsError("invalid-argument", "matches array required");
		}

		const db = getFirestore();
		const uid = request.auth.uid;
		let apiKey: string;
		try {
			apiKey = await getTmdbApiKey();
		} catch {
			throw new HttpsError("failed-precondition", "TMDB API key not configured");
		}

		// Phase 1: Ensure all shows exist in catalog
		const catalogMap = await ensureCatalog(db, uid, apiKey, matches);

		// Phase 2: Pre-read existing tracking docs (avoid double-counting on re-import)
		const existingTrackingIds = new Set<string>();
		const trackingSnap = await db.collection(`users/${uid}/tracking`).get();
		for (const d of trackingSnap.docs) {
			existingTrackingIds.add(d.id);
		}

		// Phase 3: Build all write operations
		const { batchOps, stats } = buildImportOps(db, uid, matches, catalogMap, existingTrackingIds);

		// Phase 4: Execute batch ops
		await pooled(
			batchOps.map((op) => () => op()),
			10,
		);

		// Phase 5: Update user stats
		const userRef = db.doc(`users/${uid}`);
		await userRef.set(
			{
				hasCompletedImport: true,
				stats: {
					showsTracking: FieldValue.increment(stats.showsImported),
					episodesWatched: FieldValue.increment(stats.episodesImported),
					moviesWatched: FieldValue.increment(stats.moviesImported),
					totalMinutes: FieldValue.increment(stats.minutesImported),
				},
			},
			{ merge: true },
		);

		// Phase 6: Rebuild upcoming
		await rebuildUserUpcoming(db, uid);

		// Phase 7: Send FCM notification (non-fatal)
		try {
			const userDoc = await userRef.get();
			const fcmToken = userDoc.data()?.fcmToken;
			if (fcmToken) {
				await getMessaging().send({
					token: fcmToken,
					notification: {
						title: "Import Complete",
						body: `Imported ${stats.showsImported} shows, ${stats.moviesImported} movies, ${stats.episodesImported} episodes`,
					},
					data: {
						type: "import_complete",
						stats: JSON.stringify(stats),
					},
				});
			}
		} catch (e) {
			console.warn("FCM send failed:", e);
		}

		return stats;
	},
);
