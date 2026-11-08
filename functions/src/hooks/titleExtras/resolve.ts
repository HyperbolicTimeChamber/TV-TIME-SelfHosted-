import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { MediaType } from "../../shared/enums";
import type { StoredCastMember, TitleExtras, TitleExtrasFields } from "../../shared/types";
import { normalizeRegion } from "../watchProviders";
import { fetchTitleBundle, type TmdbTitleBundle } from "./fetch";
import { writeExtras } from "./store";
import {
  featuredCast,
  localReleaseDate,
  normalizeCast,
  normalizeDirectors,
  normalizeStudios,
  normalizeWriters,
} from "./normalize";

/** Which extras a stored doc still lacks for this country */
export function missingExtras(data: TitleExtrasFields, mediaType: MediaType, region: string) {
  return {
    credits:
      !data.cast ||
      data.castTotal === undefined ||
      (mediaType === MediaType.MOVIE && (!data.directors || !data.writers)),
    studios: !data.studioLogos,
    providers: !data.watchProviders?.[region],
    release: mediaType === MediaType.MOVIE && data.localReleases?.[region] === undefined,
  };
}

/** The extras fields a TMDB bundle gives (credits / studios / one country's providers + release) */
export function extrasFromBundle(
  bundle: TmdbTitleBundle,
  mediaType: MediaType,
  region: string | null,
): { fields: TitleExtrasFields; fullCast?: StoredCastMember[] } {
  const fields: TitleExtrasFields = {
    studioLogos: normalizeStudios(bundle.networks, bundle.production_companies),
  };
  let fullCast: StoredCastMember[] | undefined;
  const credits = mediaType === MediaType.TV ? bundle.aggregate_credits : bundle.credits;
  if (credits) {
    fullCast = normalizeCast(credits.cast, mediaType);
    fields.cast = featuredCast(fullCast, mediaType, bundle.number_of_episodes);
    fields.castTotal = fullCast.length;
    const isMovie = mediaType === MediaType.MOVIE;
    fields.directors = isMovie ? normalizeDirectors(bundle.credits?.crew) : [];
    fields.writers = isMovie ? normalizeWriters(bundle.credits?.crew) : [];
    fields.creditsUpdatedAt = Date.now();
  }
  if (region && bundle["watch/providers"]) {
    fields.watchProviders = { [region]: normalizeRegion(bundle["watch/providers"].results?.[region]) };
  }
  if (region && bundle.release_dates) {
    fields.localReleases = { [region]: localReleaseDate(bundle.release_dates.results, region) };
  }
  return { fields, fullCast };
}

/**
 * What a title's stored extras lack, fetched in one TMDB request and written in one batch
 * (the doc's fields + the full cast); the result is the stored extras with them filled in
 */
export async function fillExtras(
  db: Firestore,
  apiKey: string,
  ref: FirebaseFirestore.DocumentReference,
  data: TitleExtrasFields,
  tmdbId: number,
  mediaType: MediaType,
  region: string,
): Promise<TitleExtrasFields> {
  const missing = missingExtras(data, mediaType, region);
  const bundle = await fetchTitleBundle(apiKey, tmdbId, mediaType, missing);
  const { fields, fullCast } = extrasFromBundle(
    bundle,
    mediaType,
    missing.providers || missing.release ? region : null,
  );
  // Only what was missing is written (studios come with every bundle — kept if already stored)
  const write: TitleExtrasFields & Record<string, unknown> = {};
  if (missing.credits) {
    write.cast = fields.cast;
    write.castTotal = fields.castTotal;
    write.directors = fields.directors;
    write.writers = fields.writers;
    write.creditsUpdatedAt = fields.creditsUpdatedAt;
  }
  if (missing.studios) write.studioLogos = fields.studioLogos;
  if (missing.providers && fields.watchProviders) {
    write.watchProviders = fields.watchProviders;
    write.watchRegions = FieldValue.arrayUnion(region) as unknown as string[];
  }
  if (missing.release && fields.localReleases) write.localReleases = fields.localReleases;
  await writeExtras(db, ref, write, missing.credits ? fullCast : undefined);
  return {
    ...data,
    ...write,
    watchProviders: { ...data.watchProviders, ...fields.watchProviders },
    localReleases: { ...data.localReleases, ...fields.localReleases },
  };
}

/** The callable's answer from stored (and just filled) extras */
export function toTitleExtras(data: TitleExtrasFields, region: string): TitleExtras {
  return {
    cast: data.cast ?? [],
    castTotal: data.castTotal ?? data.cast?.length ?? 0,
    localRelease: data.localReleases?.[region] ?? null,
    directors: data.directors ?? [],
    writers: data.writers ?? [],
    studios: data.studioLogos ?? [],
    providers: data.watchProviders?.[region] ?? { providers: [], link: null, updatedAt: Date.now() },
  };
}
