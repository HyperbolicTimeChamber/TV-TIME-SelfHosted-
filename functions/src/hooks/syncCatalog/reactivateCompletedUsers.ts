import { Timestamp } from "firebase-admin/firestore";
import { CatalogShow } from "../tmdb";
import { WatchStatus } from "../../shared/enums";

export async function reactivateCompletedUsers(
	db: FirebaseFirestore.Firestore,
	showsSnap: FirebaseFirestore.QuerySnapshot,
	pendingReactivations: Array<{ showId: string; freshData: CatalogShow }>,
): Promise<void> {
	if (pendingReactivations.length === 0) return;

	// Build map of showId → trackedBy from already-loaded snapshot (0 extra reads)
	const showTrackers = new Map<string, string[]>();
	for (const d of showsSnap.docs) {
		showTrackers.set(d.id, d.data().trackedBy ?? []);
	}

	// Collect all tracking refs to read across all shows
	const reactivationItems: Array<{
		ref: FirebaseFirestore.DocumentReference;
		showId: string;
		freshData: CatalogShow;
	}> = [];

	for (const { showId, freshData } of pendingReactivations) {
		const lastSeason = freshData.seasons[freshData.seasons.length - 1];
		const firstNewEp = lastSeason?.episodes[0];
		if (!firstNewEp) continue;

		const uids = showTrackers.get(showId) ?? [];
		for (const uid of uids) {
			reactivationItems.push({
				ref: db.doc(`users/${uid}/tracking/${showId}`),
				showId,
				freshData,
			});
		}
	}

	if (reactivationItems.length === 0) return;

	// Batch read all tracking docs
	const allTrackingDocs: FirebaseFirestore.DocumentSnapshot[] = [];
	for (let i = 0; i < reactivationItems.length; i += 500) {
		const chunk = reactivationItems.slice(i, i + 500);
		const docs = await db.getAll(...chunk.map((r) => r.ref));
		allTrackingDocs.push(...docs);
	}

	// Collect writes for COMPLETED users
	const reactivationWrites: Array<{
		ref: FirebaseFirestore.DocumentReference;

		data: Record<string, any>;
	}> = [];

	for (let i = 0; i < allTrackingDocs.length; i++) {
		const td = allTrackingDocs[i];
		if (!td.exists || td.data()?.status !== WatchStatus.COMPLETED) continue;

		const { freshData } = reactivationItems[i];
		const lastSeason = freshData.seasons[freshData.seasons.length - 1];
		const firstNewEp = lastSeason.episodes[0];
		const newAirDate = firstNewEp.airDate;
		const airDateTs = newAirDate ? Timestamp.fromDate(new Date(newAirDate)) : Timestamp.now();

		reactivationWrites.push({
			ref: td.ref,
			data: {
				status: WatchStatus.WATCHING,
				nextEpisode: {
					season: lastSeason.seasonNumber,
					episode: firstNewEp.episodeNumber,
				},
				nextEpisodeAirDate: newAirDate ?? null,
				nextEpisodeName: firstNewEp.title ?? null,
				priorityDate: airDateTs,
			},
		});
	}

	// Batch write all reactivations (set+merge: safe if tracking doc deleted)
	for (let i = 0; i < reactivationWrites.length; i += 500) {
		const writeBatch = db.batch();
		const chunk = reactivationWrites.slice(i, i + 500);
		for (const { ref, data } of chunk) {
			writeBatch.set(ref, data, { merge: true });
		}
		await writeBatch.commit();
	}

	if (reactivationWrites.length > 0) {
		console.log(
			`Reactivated ${reactivationWrites.length} users across ${pendingReactivations.length} shows`,
		);
	}
}
