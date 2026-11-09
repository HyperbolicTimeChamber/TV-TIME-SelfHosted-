import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getTmdbApiKey } from "../hooks/apiKey";
import { RateLimiter, RateLimitError } from "../hooks/tmdbProxy";
import { requireCallerOrGuest } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";
import { resolveSubjectLink, SubjectNotFoundError } from "../hooks/titleExtras";
import { showDocId } from "../shared/docId";
import {
  Callable,
  FunctionName,
  MediaType,
  SubjectKind,
  TITLE_EXTRAS_TMDB_RATE_LIMIT,
} from "../shared/enums";
import type { SubjectLink, SubjectLinkRequest } from "../shared/types";

/** Single instance → this is the global cap on link lookups */
const limiter = new RateLimiter(TITLE_EXTRAS_TMDB_RATE_LIMIT, 1000, 8000);
/** Viewers opening the same person at once share one lookup */
const inFlight = new Map<string, Promise<SubjectLink>>();

/**
 * The photo viewer's / cast sheet's link for a title's person (IMDb id) or studio (website):
 * stored with them on the catalog, looked up on TMDB the first time anyone opens them. Public,
 * rate limited like the rest
 */
export const subjectLink = trackedOnCall(
  FunctionName.SUBJECT_LINK,
  { maxInstances: 1, concurrency: 80, cpu: 1, memory: "256MiB", timeoutSeconds: 20 },
  async (request): Promise<SubjectLink> => {
    await requireCallerOrGuest(request, Callable.SUBJECT_LINK);
    const { tmdbId, mediaType, kind, id } = (request.data ?? {}) as SubjectLinkRequest;
    if (
      !Number.isInteger(tmdbId) ||
      tmdbId <= 0 ||
      !Object.values(MediaType).includes(mediaType) ||
      !Object.values(SubjectKind).includes(kind) ||
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw new HttpsError("invalid-argument", "tmdbId, mediaType, kind and id required");
    }
    const docId = showDocId(tmdbId, mediaType);
    const key = `${docId}:${kind}:${id}`;
    let lookup = inFlight.get(key);
    if (!lookup) {
      lookup = resolveSubjectLink(getFirestore(), docId, kind, id, getTmdbApiKey, () =>
        limiter.acquire(),
      ).finally(() => inFlight.delete(key));
      inFlight.set(key, lookup);
    }
    try {
      return await lookup;
    } catch (err) {
      if (err instanceof SubjectNotFoundError) {
        throw new HttpsError("not-found", "Not part of this title");
      }
      if (err instanceof RateLimitError) {
        throw new HttpsError("resource-exhausted", "Busy, try again shortly");
      }
      console.error("[subjectLink] failed:", err);
      throw new HttpsError("unavailable", "Could not reach TMDB. Try again later.");
    }
  },
);
