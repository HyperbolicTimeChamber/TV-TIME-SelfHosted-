import { FieldValue } from "firebase-admin/firestore";
import { fetchShowFromTMDB, CatalogShow, pooled } from "../tmdb";
import { addToTrackedBy } from "../trackedBy";
import { showDocId } from "../../shared/docId";
import { ImportMatch } from "../../shared/types";

export async function ensureCatalog(
	db: FirebaseFirestore.Firestore,
	uid: string,
	apiKey: string,
	matches: ImportMatch[],
): Promise<Map<number, CatalogShow>> {
	const catalogMap = new Map<number, CatalogShow>();
	const showIds = matches.map((m) => showDocId(m.tmdbId, m.mediaType));
	const showRefs = showIds.map((id) => db.doc(`shows/${id}`));
	const existingDocs: FirebaseFirestore.DocumentSnapshot[] = [];
	for (let i = 0; i < showRefs.length; i += 500) {
		const chunk = await db.getAll(...showRefs.slice(i, i + 500));
		existingDocs.push(...chunk);
	}

	const existingCatalog = new Map<string, CatalogShow>();
	for (let i = 0; i < existingDocs.length; i++) {
		if (existingDocs[i].exists) {
			existingCatalog.set(showIds[i], existingDocs[i].data() as CatalogShow);
		}
	}

	const catalogTasks = matches.map((m) => async () => {
		const showId = showDocId(m.tmdbId, m.mediaType);
		const showRef = db.doc(`shows/${showId}`);

		// Fast path: catalog exists — use it, just add to trackedBy
		const existing = existingCatalog.get(showId);
		if (existing) {
			catalogMap.set(m.tmdbId, existing);
			await addToTrackedBy(showId, uid);
			return;
		}

		// Slow path: fetch from TMDB and create catalog doc
		const showData = await fetchShowFromTMDB(apiKey, m.tmdbId, m.mediaType);
		catalogMap.set(m.tmdbId, showData);

		let created = false;
		await db.runTransaction(async (tx) => {
			const showDoc = await tx.get(showRef);
			if (showDoc.exists) return;
			tx.set(showRef, {
				...showData,
				trackedBy: [uid],
				trackedByCount: 1,
				lastSyncedAt: FieldValue.serverTimestamp(),
			});
			created = true;
		});

		if (!created) {
			await addToTrackedBy(showId, uid);
		}
	});

	await pooled(catalogTasks, 5);
	return catalogMap;
}
