import { CatalogShow } from "../../shared/types";
import { MediaType } from "../../shared/enums";
import { showDocId } from "../../shared/docId";
import { pooled } from "../tmdb";
import { catalogRuntimes, healUserShowRuntimes } from "../runtimeHeal/healRuntimes";

/**
 * One-off: watched episodes saved with runtime 0 whose catalog already has the runtime
 * (TMDB filled it before the weekly sync could heal on the change). Reads each user's
 * 0-runtime docs + those shows' catalog docs.
 */
export async function healZeroRuntimes(
  db: FirebaseFirestore.Firestore,
  { dryRun }: { dryRun: boolean },
) {
  const users = await db.collection("users").listDocuments();
  const rows: Array<{ uid: string; shows: number; minutes: number }> = [];

  await pooled(
    users.map((user) => async () => {
      const zeros = await user.collection("watchedEpisodes").where("runtime", "==", 0).get();
      const tmdbIds = [...new Set(zeros.docs.map((d) => d.data().tmdbShowId as number))];
      if (tmdbIds.length === 0) return;
      const catalogs = await db.getAll(
        ...tmdbIds.map((id) => db.doc(`shows/${showDocId(id, MediaType.TV)}`)),
      );
      let minutes = 0;
      let shows = 0;
      for (let i = 0; i < tmdbIds.length; i++) {
        if (!catalogs[i].exists) continue;
        const runtimes = catalogRuntimes(catalogs[i].data() as CatalogShow);
        const healed = await healUserShowRuntimes(db, user.id, tmdbIds[i], runtimes, { dryRun });
        if (healed > 0) {
          minutes += healed;
          shows++;
        }
      }
      if (shows > 0) rows.push({ uid: user.id, shows, minutes });
    }),
    5,
  );
  return rows;
}
