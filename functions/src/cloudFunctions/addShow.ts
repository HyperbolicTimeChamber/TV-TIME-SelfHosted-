import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fetchShowFromTMDB, CatalogShow } from "../hooks/tmdb";
import { addToTrackedBy } from "../hooks/trackedBy";
import { fetchFacetFields, stampTrackingFacets } from "../hooks/titleFacets";
import { FacetDelta } from "../shared/titleFacets";
import { getTmdbApiKey, invalidateApiKeyCache } from "../hooks/apiKey";
import { addShowToUpcoming } from "../hooks/upcoming";
import { showDocId } from "../shared/docId";
import { MediaType, FunctionName, Callable } from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";

interface AddShowRequest {
  tmdbId: number;
  mediaType: MediaType;
}

export const addShow = trackedOnCall(
  FunctionName.ADD_SHOW,
  {
    maxInstances: 5,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (request): Promise<CatalogShow & { facetDelta?: FacetDelta }> => {
    const uid = requireCaller(request, Callable.ADD_SHOW);
    if (request.data?.warmup) return {} as CatalogShow;

    const { tmdbId, mediaType } = request.data as AddShowRequest;
    if (typeof tmdbId !== "number" || tmdbId <= 0 || !mediaType) {
      throw new HttpsError("invalid-argument", "tmdbId and mediaType required");
    }

    const db = getFirestore();
    const showId = showDocId(tmdbId, mediaType);
    const showRef = db.doc(`shows/${showId}`);

    // Fast path: if catalog doc already exists, just add to trackedBy
    const existingDoc = await showRef.get();
    if (existingDoc.exists) {
      const catalog = existingDoc.data() as CatalogShow;
      // Written before keywords / countries / studios were stored: fetch both once (one TMDB request)
      // for every tracker
      if (!("keywords" in catalog) || !("countries" in catalog) || !("studios" in catalog)) {
        try {
          const fields = await fetchFacetFields(await getTmdbApiKey(), tmdbId, mediaType);
          Object.assign(catalog, fields);
          await showRef.update(fields);
        } catch (err) {
          console.warn(`[addShow] facets for ${showId} failed:`, (err as Error).message);
        }
      }
      const [, facetDelta] = await Promise.all([
        addToTrackedBy(showId, uid),
        stampTrackingFacets(db, uid, showId, catalog),
      ]);

      // Update upcoming subcollection (fire-and-forget)
      if (mediaType === MediaType.TV) {
        addShowToUpcoming(db, uid, tmdbId, MediaType.TV).catch((err) =>
          console.error("[addShow] upcoming update failed:", err),
        );
      }

      // What the user's filter choices gained — the client patches its copy (no re-read)
      return facetDelta ? { ...catalog, facetDelta } : catalog;
    }

    // Slow path: fetch from TMDB and create catalog doc
    const apiKey = await getTmdbApiKey();
    let showData: CatalogShow;
    try {
      showData = await fetchShowFromTMDB(apiKey, tmdbId, mediaType);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        invalidateApiKeyCache();
        throw new HttpsError("failed-precondition", "TMDB API key is invalid");
      }
      if (status === 404) {
        throw new HttpsError("not-found", "Show not found on TMDB");
      }
      throw new HttpsError(
        "unavailable",
        "Failed to fetch show data from TMDB",
      );
    }

    // Atomically check-then-create (handles race if two users add simultaneously)
    let created = false;
    await db.runTransaction(async (tx) => {
      const showDoc = await tx.get(showRef);

      if (showDoc.exists) {
        return; // another call created it first
      }

      tx.set(showRef, {
        ...showData,
        trackedBy: [uid],
        trackedByCount: 1,
        lastSyncedAt: FieldValue.serverTimestamp(),
      });
      created = true;
    });

    // Only need addToTrackedBy if we lost the race (another call created the doc)
    const [, facetDelta] = await Promise.all([
      created ? null : addToTrackedBy(showId, uid),
      stampTrackingFacets(db, uid, showId, showData),
    ]);

    // Update upcoming subcollection (fire-and-forget, don't block response)
    if (mediaType === MediaType.TV) {
      addShowToUpcoming(db, uid, tmdbId).catch((err) =>
        console.error("[addShow] upcoming update failed:", err),
      );
    }

    return facetDelta ? { ...showData, facetDelta } : showData;
  },
);
