import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { titleFacets } from "../../shared/titleFacets";
import { CatalogShow } from "../tmdb";
import { showDocId } from "../../shared/docId";
import { MediaType, WatchStatus } from "../../shared/enums";
import { ImportMatch, ImportStats } from "../../shared/types";
import { lookupEpisode } from "./lookupEpisode";
import { isUnfinishedCompleted } from "../completedStatus";
import { DocWrite } from "../batchWrites";

const STATUSES = Object.values(WatchStatus) as string[];
const MAX_WATCH_COUNT = 1000;

/** A restored count: a whole number from 1 to MAX_WATCH_COUNT, 1 when absent or nonsense */
function watchCountOf(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 1
    ? Math.min(value as number, MAX_WATCH_COUNT)
    : 1;
}

function validEpisodeRef(
  ref: unknown,
): ref is { season: number; episode: number } {
  const r = ref as { season?: unknown; episode?: unknown } | null;
  return (
    Number.isInteger(r?.season) &&
    Number.isInteger(r?.episode) &&
    (r!.season as number) >= 0 &&
    (r!.episode as number) >= 0
  );
}

interface BuildResult {
  /** Tracking docs — set(), a re-sync rewrites them */
  writes: DocWrite[];
  /** watchedEpisodes / watchedMovies — create() only, docs already there are kept */
  history: DocWrite[];
  /** showsImported only; history counts come from what history actually created */
  stats: ImportStats;
}

export function buildImportOps(
  db: FirebaseFirestore.Firestore,
  uid: string,
  matches: ImportMatch[],
  catalogMap: Map<number, CatalogShow>,
  existingTrackingIds: Set<string>,
): BuildResult {
  const writes: DocWrite[] = [];
  const history: DocWrite[] = [];
  const stats: ImportStats = {
    showsImported: 0,
    moviesImported: 0,
    episodesImported: 0,
    minutesImported: 0,
  };

  for (const match of matches) {
    let status = STATUSES.includes(match.status)
      ? match.status
      : WatchStatus.WATCHING;
    const rewatchCount = Number.isInteger(match.rewatchCount)
      ? Math.max(0, Math.min(match.rewatchCount!, MAX_WATCH_COUNT))
      : 0;
    const showId = showDocId(match.tmdbId, match.mediaType);
    const now = Timestamp.now();
    const catalog = catalogMap.get(match.tmdbId);

    // Create tracking doc
    {
      const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);

      let nextEpisode: { season: number; episode: number } | null = null;
      let nextEpisodeName: string | null = null;
      let nextEpisodeAirDate: string | null = null;
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
          const currentSeason = catalog.seasons.find(
            (s) => s.seasonNumber === latest.season,
          );
          if (currentSeason && latest.episode >= currentSeason.episodeCount) {
            const nextSeasonNum = latest.season + 1;
            const nextSeason = catalog.seasons.find(
              (s) => s.seasonNumber === nextSeasonNum,
            );
            if (nextSeason) {
              nextEpisode = { season: nextSeasonNum, episode: 1 };
            } else {
              nextEpisode = null;
            }
          }
        }

        // A restored export knows where the user was (rewatch pointer, caught-up) — keep it
        if (match.nextEpisode === null) nextEpisode = null;
        else if (validEpisodeRef(match.nextEpisode)) {
          nextEpisode = {
            season: match.nextEpisode.season,
            episode: match.nextEpisode.episode,
          };
        }

        // Without these the watchlist can't tell when the next episode airs
        if (nextEpisode && catalog?.seasons) {
          const ne = nextEpisode;
          const ep = catalog.seasons
            .find((s) => s.seasonNumber === ne.season)
            ?.episodes?.find((e) => e.episodeNumber === ne.episode);
          nextEpisodeName = ep?.title ?? null;
          nextEpisodeAirDate = ep?.airDate ?? null;
        }

        // TV Time "archived" comes in as completed even after 2 of 16 episodes — an aired
        // episode still ahead means it's being watched, not finished
        if (
          isUnfinishedCompleted(status, nextEpisode, catalog, new Date().toISOString().slice(0, 10))
        ) {
          status = WatchStatus.WATCHING;
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

      // Watch History: absolute values (set() overwrites on re-import)
      const latestEp = [...(match.watchedEpisodes ?? [])].sort(
        (a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime() ||
          b.season - a.season || b.episode - a.episode,
      )[0];
      const tvEps = match.mediaType === MediaType.TV ? (match.watchedEpisodes ?? []) : [];
      const plays =
        match.mediaType === MediaType.MOVIE
          ? status === WatchStatus.COMPLETED
            ? 1
            : 0
          : tvEps.length;
      const minutesWatched =
        match.mediaType === MediaType.MOVIE
          ? match.movieRuntime || catalog?.runtime || 0
          : tvEps.reduce(
              (sum, ep) =>
                sum + lookupEpisode(catalogMap, match.tmdbId, ep.season, ep.episode).runtime,
              0,
            );

      writes.push({
        ref: trackingRef,
        data: {
        tmdbId: match.tmdbId,
        mediaType: match.mediaType,
        status,
        nextEpisode,
        nextEpisodeName,
        nextEpisodeAirDate,
        rewatchCount,
        addedAt: now,
        lastWatchedAt,
        priorityDate: lastWatchedAt,
        ...titleFacets(catalog),
        ...(plays > 0
          ? {
              historyAt: lastWatchedAt,
              historyUpdatedAt: FieldValue.serverTimestamp(),
              ...(match.mediaType === MediaType.TV && latestEp
                ? { lastEpisode: { season: latestEp.season, episode: latestEp.episode } }
                : {}),
              minutesWatched,
              plays,
            }
          : {}),
        },
      });
    }

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
      for (const { ep, info } of epInfos) {
        const epId = `${match.tmdbId}_S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;
        history.push({
          ref: db.doc(`users/${uid}/watchedEpisodes/${epId}`),
          data: {
            tmdbShowId: match.tmdbId,
            season: ep.season,
            episode: ep.episode,
            episodeTitle: info.title,
            watchCount: watchCountOf(ep.watchCount),
            watchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
            lastWatchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
            runtime: info.runtime,
          },
        });
      }
    }

    // Create watched movie doc
    // A movie only on the watchlist (restored plan-to-watch) has not been watched
    if (match.mediaType === MediaType.MOVIE && status === WatchStatus.COMPLETED) {
      const movieRuntime = match.movieRuntime || catalog?.runtime || 0;
      history.push({
        ref: db.doc(`users/${uid}/watchedMovies/${showId}`),
        data: {
          tmdbId: match.tmdbId,
          watchCount: watchCountOf(match.movieWatchCount),
          watchedAt: match.movieWatchedAt
            ? Timestamp.fromDate(new Date(match.movieWatchedAt))
            : now,
          lastWatchedAt: match.movieWatchedAt
            ? Timestamp.fromDate(new Date(match.movieWatchedAt))
            : now,
          runtime: movieRuntime,
        },
      });
    }
  }

  return { writes, history, stats };
}
