import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { EXPORT_EPISODE_PAGE, FIRESTORE_IN_LIMIT } from "../../shared/enums";

type Doc = FirebaseFirestore.QueryDocumentSnapshot;
/** Watched-movie docs fetched per getAll */
const GET_ALL_CHUNK = 300;
/** Called between reads: throws when the export was cancelled */
type Checkpoint = () => Promise<void>;

/** Every watched episode, a page at a time (a cancel stops it between pages) */
async function allEpisodes(db: Firestore, uid: string, checkpoint: Checkpoint): Promise<Doc[]> {
  const docs: Doc[] = [];
  let last: Doc | undefined;
  for (;;) {
    let q = db
      .collection(`users/${uid}/watchedEpisodes`)
      .orderBy(FieldPath.documentId())
      .limit(EXPORT_EPISODE_PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    docs.push(...page.docs);
    if (page.size < EXPORT_EPISODE_PAGE) return docs;
    last = page.docs[page.docs.length - 1];
    await checkpoint();
  }
}

/** Watched episodes of these shows only (`in` queries) — a partial export reads just its shows */
async function episodesOf(
  db: Firestore,
  uid: string,
  showIds: number[],
  checkpoint: Checkpoint,
): Promise<Doc[]> {
  const docs: Doc[] = [];
  for (let i = 0; i < showIds.length; i += FIRESTORE_IN_LIMIT) {
    const snap = await db
      .collection(`users/${uid}/watchedEpisodes`)
      .where("tmdbShowId", "in", showIds.slice(i, i + FIRESTORE_IN_LIMIT))
      .get();
    docs.push(...snap.docs);
    await checkpoint();
  }
  return docs;
}

/**
 * The watch history an export carries: `all` = the whole account (every watched episode and
 * movie, tracked or not); otherwise only these shows' episodes and these movies
 */
export async function readHistory(
  db: Firestore,
  uid: string,
  all: boolean,
  showIds: number[],
  movieDocIds: string[],
  checkpoint: Checkpoint,
): Promise<{ episodes: Doc[]; movies: FirebaseFirestore.DocumentSnapshot[] }> {
  const episodes = all
    ? await allEpisodes(db, uid, checkpoint)
    : await episodesOf(db, uid, showIds, checkpoint);
  await checkpoint();
  const moviesCol = db.collection(`users/${uid}/watchedMovies`);
  let movies: FirebaseFirestore.DocumentSnapshot[];
  if (all) {
    movies = (await moviesCol.get()).docs;
  } else if (movieDocIds.length > 0) {
    movies = [];
    for (let i = 0; i < movieDocIds.length; i += GET_ALL_CHUNK) {
      const refs = movieDocIds.slice(i, i + GET_ALL_CHUNK).map((id) => moviesCol.doc(id));
      movies.push(...(await db.getAll(...refs)).filter((d) => d.exists));
    }
  } else {
    movies = [];
  }
  return { episodes, movies };
}
