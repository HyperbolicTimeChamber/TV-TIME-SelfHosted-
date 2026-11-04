import { MediaType, UserCollection } from "../../shared/enums";
import { sameFacets, titleFacets, TitleFacets } from "../../shared/titleFacets";
import { stampTracking } from "../../shared/trackingSync";
import { pooled } from "../tmdb";
import { fetchFacetFields, writeUserFacets } from "../titleFacets";
import { BackfillOptions } from "./runBackfill";

/**
 * Watch History genre / keyword filters:
 * 1. `keywords` + `countries` on every catalog doc missing either (one TMDB request each)
 * 2. `genres` + `keywords` + `countries` copied from the catalog onto every tracking doc that differs —
 *    stamped `updatedAt` (stampTracking) like every server tracking write, so the clients'
 *    tracking delta sync takes the new version; unchanged docs aren't written (no re-read)
 * 3. Each user's facets docs (tv / movie: every genre + keyword + country, counted) rebuilt
 * Reads: every catalog doc + every tracking doc. Safe to rerun — unchanged docs aren't written.
 */
export async function backfillFacets(
  db: FirebaseFirestore.Firestore,
  apiKey: string,
  { dryRun, userConcurrency = 5, tmdbConcurrency = 20 }: BackfillOptions,
) {
  const shows = await db.collection("shows").get();
  const catalogs = new Map(shows.docs.map((d) => [d.id, d.data()]));
  const missing = shows.docs.filter((d) => !("keywords" in d.data()) || !("countries" in d.data()));
  const writer = db.bulkWriter();
  let keyworded = 0;
  let failed = 0;

  await pooled(
    missing.map((d) => async () => {
      const { tmdbId, mediaType } = d.data() as { tmdbId: number; mediaType: MediaType };
      try {
        const fields = await fetchFacetFields(apiKey, tmdbId, mediaType);
        catalogs.set(d.id, { ...d.data(), ...fields });
        keyworded++;
        if (!dryRun) writer.update(d.ref, fields);
      } catch {
        // Left without the field → the next run (or the title's next add) retries
        failed++;
      }
    }),
    tmdbConcurrency,
  );

  const users = await db.collection("users").listDocuments();
  let trackingWritten = 0;
  await pooled(
    users.map((user) => async () => {
      const tracking = await user.collection(UserCollection.TRACKING).get();
      const titles: ({ id: string } & Partial<TitleFacets>)[] = [];
      for (const t of tracking.docs) {
        const catalog = catalogs.get(t.id);
        const data = t.data() as Partial<TitleFacets>;
        // No catalog doc → keep what the tracking doc has
        const facets = catalog ? titleFacets(catalog) : data;
        titles.push({ id: t.id, ...facets });
        if (!catalog || sameFacets(data, titleFacets(catalog))) continue;
        trackingWritten++;
        if (dryRun) continue;
        writer.update(
          t.ref,
          stampTracking({ ...titleFacets(catalog) }),
        );
      }
      if (!dryRun) writeUserFacets(writer, db, user.id, titles);
    }),
    userConcurrency,
  );

  await writer.close();
  return {
    shows: shows.size,
    keywordsChecked: missing.length,
    keyworded,
    failed,
    users: users.length,
    trackingWritten,
  };
}
