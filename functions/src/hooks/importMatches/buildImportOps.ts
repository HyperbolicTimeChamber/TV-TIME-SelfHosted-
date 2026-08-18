import { Timestamp } from "firebase-admin/firestore";
import { CatalogShow } from "../tmdb";
import { showDocId } from "../../shared/docId";
import { MediaType } from "../../shared/enums";
import { ImportMatch, ImportStats } from "../../shared/types";
import { lookupEpisode } from "./lookupEpisode";

interface BuildResult {
	batchOps: Array<() => Promise<void>>;
	stats: ImportStats;
	totalMinutes: number;
	totalEpisodes: number;
}

export function buildImportOps(
	db: FirebaseFirestore.Firestore,
	uid: string,
	matches: ImportMatch[],
	catalogMap: Map<number, CatalogShow>,
	existingTrackingIds: Set<string>,
): BuildResult {
	const batchOps: Array<() => Promise<void>> = [];
	const stats: ImportStats = {
		showsImported: 0,
		moviesImported: 0,
		episodesImported: 0,
		minutesImported: 0,
	};
	let totalMinutes = 0;
	let totalEpisodes = 0;

	for (const match of matches) {
		const showId = showDocId(match.tmdbId, match.mediaType);
		const now = Timestamp.now();
		const catalog = catalogMap.get(match.tmdbId);

		// Create tracking doc
		batchOps.push(async () => {
			const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);

			let nextEpisode: { season: number; episode: number } | null = null;
			let lastWatchedAt = now;

			if (match.mediaType === MediaType.TV && match.watchedEpisodes?.length) {
				const sorted = [...match.watchedEpisodes].sort((a, b) => {
					if (a.season !== b.season) return b.season - a.season;
					return b.episode - a.episode;
				});
				const latest = sorted[0];

				nextEpisode = {
					season: latest.season,
					episode: latest.episode + 1,
				};

				// Check if latest episode is last in its season — advance to next season
				if (catalog && catalog.seasons) {
					const currentSeason = catalog.seasons.find((s) => s.seasonNumber === latest.season);
					if (currentSeason && latest.episode >= currentSeason.episodeCount) {
						const nextSeasonNum = latest.season + 1;
						const nextSeason = catalog.seasons.find((s) => s.seasonNumber === nextSeasonNum);
						if (nextSeason) {
							nextEpisode = { season: nextSeasonNum, episode: 1 };
						} else {
							nextEpisode = null;
						}
					}
				}

				const latestDate = new Date(latest.watchedAt);
				if (!isNaN(latestDate.getTime())) {
					lastWatchedAt = Timestamp.fromDate(latestDate);
				}
			}

			if (match.mediaType === MediaType.MOVIE && match.movieWatchedAt) {
				const d = new Date(match.movieWatchedAt);
				if (!isNaN(d.getTime())) {
					lastWatchedAt = Timestamp.fromDate(d);
				}
			}

			await trackingRef.set({
				tmdbId: match.tmdbId,
				mediaType: match.mediaType,
				status: match.status,
				nextEpisode,
				rewatchCount: 0,
				addedAt: now,
				lastWatchedAt,
				priorityDate: lastWatchedAt,
			});
		});

		if (match.mediaType === MediaType.TV && !existingTrackingIds.has(showId)) {
			stats.showsImported++;
		}

		// Create watched episode docs
		if (match.mediaType === MediaType.TV && match.watchedEpisodes) {
			const eps = match.watchedEpisodes;
			const epInfos = eps.map((ep) => ({
				ep,
				info: lookupEpisode(catalogMap, match.tmdbId, ep.season, ep.episode),
			}));
			for (let i = 0; i < epInfos.length; i += 400) {
				const chunk = epInfos.slice(i, i + 400);
				batchOps.push(async () => {
					const batch = db.batch();
					for (const { ep, info } of chunk) {
						const epId = `${match.tmdbId}_S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;
						const epRef = db.doc(`users/${uid}/watchedEpisodes/${epId}`);
						batch.set(epRef, {
							tmdbShowId: match.tmdbId,
							season: ep.season,
							episode: ep.episode,
							episodeTitle: info.title,
							watchCount: 1,
							watchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
							lastWatchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
							runtime: info.runtime,
						});
					}
					await batch.commit();
				});
				totalEpisodes += chunk.length;
				totalMinutes += chunk.reduce((s, { info }) => s + info.runtime, 0);
			}
		}

		// Create watched movie doc
		if (match.mediaType === MediaType.MOVIE) {
			const movieRuntime = match.movieRuntime || catalog?.runtime || 0;
			batchOps.push(async () => {
				const movieRef = db.doc(`users/${uid}/watchedMovies/${showId}`);
				await movieRef.set({
					tmdbId: match.tmdbId,
					watchCount: 1,
					watchedAt: match.movieWatchedAt
						? Timestamp.fromDate(new Date(match.movieWatchedAt))
						: now,
					lastWatchedAt: match.movieWatchedAt
						? Timestamp.fromDate(new Date(match.movieWatchedAt))
						: now,
					runtime: movieRuntime,
				});
			});
			if (!existingTrackingIds.has(showId)) {
				stats.moviesImported++;
			}
			totalMinutes += movieRuntime;
		}
	}

	stats.episodesImported = totalEpisodes;
	stats.minutesImported = totalMinutes;

	return { batchOps, stats, totalMinutes, totalEpisodes };
}
