import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getTmdbApiKey } from "../hooks/apiKey";
import { RateLimiter, RateLimitError } from "../hooks/tmdbProxy";
import { requireCallerOrGuest } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";
import {
  creditsRef,
  extrasFromBundle,
  fetchTitleBundle,
  readStoredExtras,
  searchCast,
  writeExtras,
} from "../hooks/titleExtras";
import { showDocId } from "../shared/docId";
import {
  Callable,
  CAST_PAGE_SIZE,
  CAST_SEARCH_MAX_LENGTH,
  FunctionName,
  MediaType,
  TITLE_EXTRAS_TMDB_RATE_LIMIT,
} from "../shared/enums";
import type {
  StoredCastMember,
  TitleCastPage,
  TitleCastPageRequest,
} from "../shared/types";

const limiter = new RateLimiter(TITLE_EXTRAS_TMDB_RATE_LIMIT, 1000, 8000);

/** A title's full cast: titleCredits/ (written with its extras), else fetched and stored */
async function fullCast(tmdbId: number, mediaType: MediaType): Promise<StoredCastMember[]> {
  const db = getFirestore();
  const docId = showDocId(tmdbId, mediaType);
  const doc = await creditsRef(db, docId).get();
  if (doc.exists) return (doc.get("cast") as StoredCastMember[]) ?? [];
  await limiter.acquire();
  const bundle = await fetchTitleBundle(await getTmdbApiKey(), tmdbId, mediaType, {
    credits: true,
    providers: false,
  });
  const { fields, fullCast: cast = [] } = extrasFromBundle(bundle, mediaType, null);
  const { ref, data } = await readStoredExtras(db, docId);
  await writeExtras(
    db,
    ref,
    data.castTotal === undefined
      ? {
          cast: fields.cast,
          castTotal: fields.castTotal,
          directors: fields.directors,
          writers: fields.writers,
          creditsUpdatedAt: fields.creditsUpdatedAt,
        }
      : {},
    cast,
  );
  return cast;
}

/** The info page's View All cast sheet, a page at a time — optionally only those whose name or
 *  character matches a search. Public, rate limited like the rest */
export const titleCastPage = trackedOnCall(
  FunctionName.TITLE_CAST_PAGE,
  { maxInstances: 1, concurrency: 80, cpu: 1, memory: "256MiB", timeoutSeconds: 20 },
  async (request): Promise<TitleCastPage> => {
    requireCallerOrGuest(request, Callable.TITLE_CAST_PAGE);
    const { tmdbId, mediaType, page, query = "" } = (request.data ?? {}) as TitleCastPageRequest;
    if (
      !Number.isInteger(tmdbId) ||
      tmdbId <= 0 ||
      !Object.values(MediaType).includes(mediaType) ||
      !Number.isInteger(page) ||
      page < 0 ||
      typeof query !== "string" ||
      query.length > CAST_SEARCH_MAX_LENGTH
    ) {
      throw new HttpsError("invalid-argument", "tmdbId, mediaType and page required");
    }
    try {
      // A search filters the whole cast first, then pages through the matches
      const cast = searchCast(await fullCast(tmdbId, mediaType), query);
      const start = page * CAST_PAGE_SIZE;
      return {
        members: cast.slice(start, start + CAST_PAGE_SIZE),
        total: cast.length,
        hasMore: start + CAST_PAGE_SIZE < cast.length,
      };
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw new HttpsError("resource-exhausted", "Busy, try again shortly");
      }
      console.error("[titleCastPage] failed:", err);
      throw new HttpsError("unavailable", "Could not reach TMDB. Try again later.");
    }
  },
);
