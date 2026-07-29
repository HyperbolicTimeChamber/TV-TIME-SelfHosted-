import { WatchStatus, MediaType, ENDED_STATUSES } from "../../shared/enums";
import { parseTmdbId } from "../../shared/docId";
import { CatalogShow } from "../../shared/types";
import { cleanOrphanedEpisodes } from "./cleanOrphanedEpisodes";

export async function rebuildUserUpcoming(
	db: FirebaseFirestore.Firestore,
	uid: string,
	catalogMap?: Map<string, CatalogShow>,
	skipOrphanCleanup = false,
): Promise<void> {
	const today = new Date().toISOString().slice(0, 10);
	const upcomingCol = db.collection(`users/${uid}/upcoming`);

	// Read old upcoming + active tracking in parallel (independent queries)
	const [oldDocs, trackingSnap] = await Promise.all([
		upcomingCol.get(),
		db.collection(`users/${uid}/tracking`).where("mediaType", "==", MediaType.TV).get(),
	]);

	const activeStatuses = [WatchStatus.WATCHING, WatchStatus.REWATCHING];
	let activeShows = trackingSnap.docs.filter((d) => activeStatuses.includes(d.data().status));

	if (activeShows.length === 0) return;

	// If no catalog map provided (standalone call), use index + getAll()
	if (!catalogMap) {
		const activeIndexDoc = await db.doc("config/activeShows").get();

		let activeIds: string[];
		if (activeIndexDoc.exists) {
			activeIds = activeIndexDoc.data()?.ids ?? [];
		} else {
			const allShows = await db.collection("shows").where("mediaType", "==", MediaType.TV).get();
			activeIds = allShows.docs
				.filter((d) => !ENDED_STATUSES.includes((d.data() as CatalogShow).status))
				.map((d) => d.id);
			await db.doc("config/activeShows").set({ ids: activeIds });
		}

		const activeIndex = new Set<string>(activeIds);
		activeShows = activeShows.filter((d) => activeIndex.has(d.id));

		if (activeShows.length === 0) return;

		const refs = activeShows.map((d) => db.doc(`shows/${d.id}`));
		catalogMap = new Map<string, CatalogShow>();
		for (let i = 0; i < refs.length; i += 500) {
			const chunk = refs.slice(i, i + 500);
			const catalogDocs = await db.getAll(...chunk);
			for (const cd of catalogDocs) {
				if (cd.exists) {
					catalogMap.set(cd.id, cd.data() as CatalogShow);
				}
			}
		}
	}

	// Build upcoming docs
	const upcomingDocs: Array<{ id: string; data: Record<string, unknown> }> = [];

	for (const trackDoc of activeShows) {
		const catalog = catalogMap.get(trackDoc.id);
		if (!catalog || ENDED_STATUSES.includes(catalog.status)) continue;

		for (const season of catalog.seasons || []) {
			if (season.seasonNumber === 0) continue;
			for (const ep of season.episodes || []) {
				if (!ep.airDate || ep.airDate < today) continue;
				const epId = `${trackDoc.id}_S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
				upcomingDocs.push({
					id: epId,
					data: {
						tmdbShowId: catalog.tmdbId ?? parseTmdbId(trackDoc.id).tmdbId,
						showTitle: catalog.title ?? "",
						posterPath: catalog.posterPath ?? null,
						season: season.seasonNumber,
						episode: ep.episodeNumber,
						episodeTitle: ep.title ?? "",
						airDate: ep.airDate,
						runtime: ep.runtime ?? null,
					},
				});
			}
		}
	}

	// Write new docs first (safe: if this fails, old docs still exist)
	const newDocIds = new Set<string>();
	for (let i = 0; i < upcomingDocs.length; i += 400) {
		const batch = db.batch();
		const chunk = upcomingDocs.slice(i, i + 400);
		for (const d of chunk) {
			batch.set(upcomingCol.doc(d.id), d.data);
			newDocIds.add(d.id);
		}
		await batch.commit();
	}

	// Delete stale docs that aren't in the new set
	const staleIds = oldDocs.docs.filter((d) => !newDocIds.has(d.id));
	for (let i = 0; i < staleIds.length; i += 400) {
		const batch = db.batch();
		const chunk = staleIds.slice(i, i + 400);
		for (const d of chunk) batch.delete(d.ref);
		await batch.commit();
	}

	console.log(
		`Rebuilt ${upcomingDocs.length} upcoming episodes for user ${uid} (removed ${staleIds.length} stale)`,
	);

	// Clean orphaned watchedEpisode docs only when episodes were removed from catalog
	if (!skipOrphanCleanup) {
		await cleanOrphanedEpisodes(db, uid, activeShows, catalogMap);
	}
}

export async function rebuildAllUsersUpcoming(
	db: FirebaseFirestore.Firestore,
	catalogMap: Map<string, CatalogShow>,
	skipOrphanCleanup: boolean,
): Promise<void> {
	const usersSnap = await db.collection("users").get();

	for (const userDoc of usersSnap.docs) {
		try {
			await rebuildUserUpcoming(db, userDoc.id, catalogMap, skipOrphanCleanup);
		} catch (err) {
			console.error(`Failed to rebuild upcoming for user ${userDoc.id}:`, err);
		}
	}
}
