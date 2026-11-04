import { MediaType, UserCollection } from "../../shared/enums";
import { sameFacets, titleFacets, TitleFacets } from "../../shared/titleFacets";
import { stampTracking } from "../../shared/trackingSync";
import { pooled } from "../tmdb";
import { fetchFacetFields, writeUserFacets } from "../titleFacets";
import { BackfillOptions } from "./runBackfill";

export interface BackfillFacetsOptions extends BackfillOptions {
  /** Refetch every catalog doc's keywords / countries / studios, not only the missing ones —
   *  after their rules change (e.g. the studio caps), or to pick up renames on ended shows the
   *  weekly sync no longer refreshes. One TMDB request per catalog doc; only changes are written */
  refetch?: boolean;
}

/**
 * Watch History genre / keyword / country / studio filters:
 * 1. `keywords` + `countries` + `studios` on every catalog doc missing any of them (`refetch`:
 *    every catalog doc) — one TMDB request each
 * 2. All four copied from the catalog onto every tracking doc that differs — stamped `updatedAt`
 *    (stampTracking) like every server tracking write, so the clients' tracking delta sync takes
 *    the new version; unchanged docs aren't written (no re-read)
 * 3. Each user's facets docs (tv / movie: every value of the four, counted) rebuilt
 * Reads: every catalog doc + every tracking doc. Safe to rerun — unchanged docs aren't written.
 */
export async function backfillFacets(
  db: FirebaseFirestore.Firestore,
  apiKey: string,
  { dryRun, refetch = false, userConcurrency = 5, tmdbConcurrency = 20 }: BackfillFacetsOptions,
) {
  const shows = await db.collection("shows").get();
  const catalogs = new Map(shows.docs.map((d) => [d.id, d.data()]));
  const toFetch = refetch
    ? shows.docs
    : shows.docs.filter((d) =>
        ["keywords", "countries", "studios"].some((field) => !(field in d.data())),
      );
  const writer = db.bulkWriter();
  let changed = 0;
  let failed = 0;

  await pooled(
    toFetch.map((d) => async () => {
      const { tmdbId, mediaType } = d.data() as { tmdbId: number; mediaType: MediaType };
      try {
        const fields = await fetchFacetFields(apiKey, tmdbId, mediaType);
        const merged = { ...d.data(), ...fields };
        const missingField = ["keywords", "countries", "studios"].some((f) => !(f in d.data()));
        if (!missingField && sameFacets(titleFacets(d.data()), titleFacets(merged))) return;
        catalogs.set(d.id, merged);
        changed++;
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
    fetched: toFetch.length,
    changed,
    failed,
    users: users.length,
    trackingWritten,
  };
}
