import type { Firestore } from "firebase-admin/firestore";
import { pooled } from "../tmdb";
import { parseTmdbId } from "../../shared/docId";
import type { TitleExtrasFields } from "../../shared/types";
import { fetchTitleBundle } from "./fetch";
import { extrasFromBundle } from "./resolve";
import { writeExtras } from "./store";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Weekly (syncCatalog): a show's cast and studios only change when the show does — so only the
 * shows this sync saw change that already have credits stored are refetched (one TMDB call each)
 * and written only where something differs. Where to Watch has its own phase (syncWatchProviders)
 */
export async function syncTitleExtras(db: Firestore, apiKey: string, changedShowIds: string[]) {
  const refs = changedShowIds.map((id) => db.collection("shows").doc(id));
  const docs = refs.length ? await db.getAll(...refs) : [];
  let updated = 0;
  await pooled(
    docs
      .filter((d) => d.exists && (d.data() as TitleExtrasFields).castTotal !== undefined)
      .map((d) => async () => {
        try {
          const old = d.data() as TitleExtrasFields;
          const { tmdbId, mediaType } = parseTmdbId(d.id);
          const bundle = await fetchTitleBundle(apiKey, tmdbId, mediaType, {
            credits: true,
            providers: false,
          });
          const { fields, fullCast } = extrasFromBundle(bundle, mediaType, null);
          const castChanged =
            !same(old.cast, fields.cast) || old.castTotal !== fields.castTotal;
          const studiosChanged = !same(old.studioLogos, fields.studioLogos);
          if (!castChanged && !studiosChanged) return;
          await writeExtras(
            db,
            d.ref,
            {
              ...(castChanged
                ? {
                    cast: fields.cast,
                    castTotal: fields.castTotal,
                    directors: fields.directors,
                    writers: fields.writers,
                    creditsUpdatedAt: fields.creditsUpdatedAt,
                  }
                : {}),
              ...(studiosChanged ? { studioLogos: fields.studioLogos } : {}),
            },
            castChanged ? fullCast : undefined,
          );
          updated++;
        } catch (err) {
          console.error(`[syncTitleExtras] ${d.id} failed:`, err);
        }
      }),
    5,
  );
  console.log(`Info page extras: ${updated} changed shows updated`);
}
