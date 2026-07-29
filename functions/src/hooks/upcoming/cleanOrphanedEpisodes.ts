import { FieldValue } from "firebase-admin/firestore";
import { parseTmdbId } from "../../shared/docId";
import { CatalogShow } from "../../shared/types";

export async function cleanOrphanedEpisodes(
	db: FirebaseFirestore.Firestore,
	uid: string,
	trackingDocs: FirebaseFirestore.QueryDocumentSnapshot[],
	catalogMap: Map<string, CatalogShow>,
): Promise<void> {
	const maxEpByShowSeason = new Map<string, Map<number, number>>();
	for (const td of trackingDocs) {
		const catalog = catalogMap.get(td.id);
		if (!catalog?.seasons) continue;
		const seasonMap = new Map<number, number>();
		for (const s of catalog.seasons) {
			if (s.seasonNumber === 0) continue;
			seasonMap.set(s.seasonNumber, s.episodes?.length ?? 0);
		}
		maxEpByShowSeason.set(td.id, seasonMap);
	}

	if (maxEpByShowSeason.size === 0) return;

	const watchedSnap = await db.collection(`users/${uid}/watchedEpisodes`).get();

	const tmdbIdToKey = new Map<number, string>();
	for (const [key] of maxEpByShowSeason) {
		const parsed = parseTmdbId(key);
		tmdbIdToKey.set(parsed.tmdbId, key);
	}

	const orphans: FirebaseFirestore.DocumentReference[] = [];
	let orphanRuntime = 0;

	for (const wd of watchedSnap.docs) {
		const data = wd.data();
		const tmdbShowId = data.tmdbShowId;
		const season = data.season;
		const episode = data.episode;
		if (!tmdbShowId || !season || !episode) continue;

		const showDocKey = tmdbIdToKey.get(tmdbShowId);
		if (!showDocKey) continue;

		const seasonMap = maxEpByShowSeason.get(showDocKey)!;
		const maxEp = seasonMap.get(season);

		if (maxEp === undefined || episode > maxEp) {
			orphans.push(wd.ref);
			orphanRuntime += data.runtime || 0;
		}
	}

	if (orphans.length === 0) return;

	for (let i = 0; i < orphans.length; i += 400) {
		const batch = db.batch();
		const chunk = orphans.slice(i, i + 400);
		for (const ref of chunk) batch.delete(ref);
		if (i === 0) {
			batch.set(
				db.doc(`users/${uid}`),
				{
					stats: {
						episodesWatched: FieldValue.increment(-orphans.length),
						totalMinutes: FieldValue.increment(-orphanRuntime),
					},
				},
				{ merge: true },
			);
		}
		await batch.commit();
	}

	console.log(`Cleaned ${orphans.length} orphaned watchedEpisode docs for user ${uid}`);
}
