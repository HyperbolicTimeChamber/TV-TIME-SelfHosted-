import { FieldValue } from "firebase-admin/firestore";
import { CatalogShow } from "../shared/types";

/** Fields a TMDB refresh rewrites on a TV catalog doc (syncCatalog + refreshShow, merge) */
export function tvCatalogFields(fresh: CatalogShow): Record<string, unknown> {
  return {
    title: fresh.title,
    posterPath: fresh.posterPath,
    backdropPath: fresh.backdropPath,
    overview: fresh.overview,
    status: fresh.status,
    totalSeasons: fresh.totalSeasons,
    totalEpisodes: fresh.totalEpisodes,
    runtime: fresh.runtime,
    voteAverage: fresh.voteAverage,
    // premiereDate() fills in TMDB's missing first_air_date
    firstAirDate: fresh.firstAirDate,
    seasons: fresh.seasons,
    genres: fresh.genres,
    logoPath: fresh.logoPath ?? null,
    tvmazeId: fresh.tvmazeId ?? null,
    ...(fresh.credits ? { credits: fresh.credits } : {}),
    lastSyncedAt: FieldValue.serverTimestamp(),
  };
}

/** Fields a TMDB refresh rewrites on a movie catalog doc (syncCatalog + refreshShow, merge) */
export function movieCatalogFields(fresh: CatalogShow): Record<string, unknown> {
  return {
    title: fresh.title,
    posterPath: fresh.posterPath,
    backdropPath: fresh.backdropPath,
    overview: fresh.overview,
    status: fresh.status,
    runtime: fresh.runtime,
    voteAverage: fresh.voteAverage,
    releaseDate: fresh.releaseDate,
    genres: fresh.genres,
    ...(fresh.credits ? { credits: fresh.credits } : {}),
    lastSyncedAt: FieldValue.serverTimestamp(),
  };
}
