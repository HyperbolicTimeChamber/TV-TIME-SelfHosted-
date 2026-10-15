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

/**
 * One-off: watched movies saved with runtime 0 (app callers passed no runtime) whose
 * catalog doc has one. Writes watchedMovies.runtime only — rerun `--only=history` then
 * `--only=stats` afterwards to roll it into history minutes and Watch Time.
 */
export async function healZeroMovieRuntimes(
  db: FirebaseFirestore.Firestore,
  { dryRun }: { dryRun: boolean },
) {
  const users = await db.collection("users").listDocuments();
  const rows: Array<{ uid: string; movies: number; minutes: number }> = [];

  await pooled(
    users.map((user) => async () => {
      const movies = await user.collection("watchedMovies").get();
      const zeros = movies.docs.filter((d) => !(d.data().runtime > 0));
      if (zeros.length === 0) return;
      const catalogs = await db.getAll(
        ...zeros.map((d) => db.doc(`shows/${showDocId(Number(d.id), MediaType.MOVIE)}`)),
      );
      const batch = db.batch();
      let healed = 0;
      let minutes = 0;
      zeros.forEach((d, i) => {
        const runtime = catalogs[i].exists ? (catalogs[i].data() as CatalogShow).runtime : null;
        if (!runtime) return;
        healed++;
        minutes += runtime * Math.max(1, d.data().watchCount ?? 1);
        batch.update(d.ref, { runtime });
      });
      if (healed === 0) return;
      if (!dryRun) await batch.commit();
      rows.push({ uid: user.id, movies: healed, minutes });
    }),
    5,
  );
  return rows;
}
