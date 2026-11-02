import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import { FunctionName, Callable } from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";

const ACCOUNT_EXPORT_FORMAT = "watchloom-account";
const ACCOUNT_EXPORT_VERSION = 1;

/** Firestore timestamps → ISO strings; anything else passes through */
function iso(value: unknown): unknown {
  const ts = value as Timestamp | undefined;
  return typeof ts?.toDate === "function" ? ts.toDate().toISOString() : value;
}

/** A doc's fields with every timestamp turned into an ISO string */
function plain(data: FirebaseFirestore.DocumentData) {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, iso(v)]));
}

/**
 * Everything the account holds, as one JSON object for Settings → Export My Data: tracked
 * titles, every watched episode (grouped by show) and movie, and the custom lists. Reads the
 * whole watch history (tens of thousands of docs on a big account), so it is rate limited hard
 * and only ever runs when the user asks. The callable response cap is 10 MB — episodes are
 * kept to the fields that matter to stay far below it.
 */
export const exportAccountData = trackedOnCall(
  FunctionName.EXPORT_ACCOUNT_DATA,
  {
    maxInstances: 2,
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) => {
    const uid = requireCaller(request, Callable.EXPORT_ACCOUNT_DATA);
    const user = getFirestore().doc(`users/${uid}`);

    const [tracking, episodes, movies, lists] = await Promise.all([
      user.collection("tracking").get(),
      user.collection("watchedEpisodes").get(),
      user.collection("watchedMovies").get(),
      user.collection("customLists").get(),
    ]);

    const watchedEpisodes: Record<string, unknown[]> = {};
    for (const doc of episodes.docs) {
      const { tmdbShowId, season, episode, episodeTitle, runtime, watchCount, watchedAt, lastWatchedAt } =
        plain(doc.data());
      (watchedEpisodes[String(tmdbShowId)] ??= []).push({
        season,
        episode,
        episodeTitle,
        runtime,
        watchCount,
        watchedAt,
        lastWatchedAt,
      });
    }

    console.log(
      `[exportAccountData] ${uid}: ${tracking.size} tracked, ${episodes.size} episodes, ${movies.size} movies, ${lists.size} lists`,
    );
    return {
      format: ACCOUNT_EXPORT_FORMAT,
      version: ACCOUNT_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      tracking: tracking.docs.map((d) => ({ id: d.id, ...plain(d.data()) })),
      watchedEpisodes,
      watchedMovies: movies.docs.map((d) => ({ id: d.id, ...plain(d.data()) })),
      customLists: lists.docs.map((d) => ({ id: d.id, ...plain(d.data()) })),
    };
  },
);
