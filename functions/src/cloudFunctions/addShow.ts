// functions/src/cloudFunctions/addShow.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fetchShowFromTMDB, CatalogShow } from "../hooks/tmdb";
import { addToTrackedBy } from "../hooks/trackedBy";
import { getTmdbApiKey, invalidateApiKeyCache } from "../hooks/apiKey";
import { addShowToUpcoming } from "../hooks/upcoming";
import { showDocId } from "../shared/docId";
import { MediaType } from "../shared/enums";

interface AddShowRequest {
	tmdbId: number;
	mediaType: MediaType;
}

export const addShow = onCall(
	{
		maxInstances: 5,
		timeoutSeconds: 120,
		memory: "256MiB",
	},
	async (request): Promise<CatalogShow> => {
		if (!request.auth) {
			throw new HttpsError("unauthenticated", "Must be signed in");
		}
		if (request.data?.warmup) return {} as CatalogShow;

		const { tmdbId, mediaType } = request.data as AddShowRequest;
		if (typeof tmdbId !== "number" || tmdbId <= 0 || !mediaType) {
			throw new HttpsError("invalid-argument", "tmdbId and mediaType required");
		}

		const db = getFirestore();
		const showId = showDocId(tmdbId, mediaType);
		const showRef = db.doc(`shows/${showId}`);
		const uid = request.auth.uid;

		// Fast path: if catalog doc already exists, just add to trackedBy
		const existingDoc = await showRef.get();
		if (existingDoc.exists) {
			await addToTrackedBy(showId, uid);

			// Update upcoming subcollection (fire-and-forget)
			if (mediaType === MediaType.TV) {
				addShowToUpcoming(db, uid, tmdbId, MediaType.TV).catch((err) =>
					console.error("[addShow] upcoming update failed:", err),
				);
			}

			return existingDoc.data() as CatalogShow;
		}

		// Slow path: fetch from TMDB and create catalog doc
		const apiKey = await getTmdbApiKey();
		let showData: CatalogShow;
		try {
			showData = await fetchShowFromTMDB(apiKey, tmdbId, mediaType);
		} catch (err: any) {
			const status = err?.response?.status;
			if (status === 401) {
				invalidateApiKeyCache();
				throw new HttpsError("failed-precondition", "TMDB API key is invalid");
			}
			if (status === 404) {
				throw new HttpsError("not-found", "Show not found on TMDB");
			}
			throw new HttpsError("unavailable", "Failed to fetch show data from TMDB");
		}

		// Atomically check-then-create (handles race if two users add simultaneously)
		let created = false;
		await db.runTransaction(async (tx) => {
			const showDoc = await tx.get(showRef);

			if (showDoc.exists) {
				return; // another call created it first
			}

			tx.set(showRef, {
				...showData,
				trackedBy: [uid],
				trackedByCount: 1,
				lastSyncedAt: FieldValue.serverTimestamp(),
			});
			created = true;
		});

		// Only need addToTrackedBy if we lost the race (another call created the doc)
		if (!created) {
			await addToTrackedBy(showId, uid);
		}

		// Update upcoming subcollection (fire-and-forget, don't block response)
		if (mediaType === MediaType.TV) {
			addShowToUpcoming(db, uid, tmdbId).catch((err) =>
				console.error("[addShow] upcoming update failed:", err),
			);
		}

		return showData;
	},
);
