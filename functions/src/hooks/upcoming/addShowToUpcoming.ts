import { showDocId } from "../../shared/docId";
import { CatalogShow } from "../../shared/types";
import { MediaType } from "../../shared/enums";

export async function addShowToUpcoming(
	db: FirebaseFirestore.Firestore,
	uid: string,
	tmdbId: number,
	mediaType: MediaType = MediaType.TV,
): Promise<void> {
	const today = new Date().toISOString().slice(0, 10);
	const showId = showDocId(tmdbId, mediaType);
	const showDoc = await db.doc(`shows/${showId}`).get();
	if (!showDoc.exists) return;

	const catalog = showDoc.data() as CatalogShow;
	const upcomingCol = db.collection(`users/${uid}/upcoming`);
	const batch = db.batch();
	let count = 0;

	for (const season of catalog.seasons || []) {
		if (season.seasonNumber === 0) continue;
		for (const ep of season.episodes || []) {
			if (!ep.airDate || ep.airDate < today) continue;
			const epId = `${showId}_S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
			batch.set(upcomingCol.doc(epId), {
				tmdbShowId: catalog.tmdbId ?? tmdbId,
				showTitle: catalog.title ?? "",
				posterPath: catalog.posterPath ?? null,
				season: season.seasonNumber,
				episode: ep.episodeNumber,
				episodeTitle: ep.title ?? "",
				airDate: ep.airDate,
				runtime: ep.runtime ?? null,
			});
			count++;
		}
	}

	if (count > 0) await batch.commit();
}
