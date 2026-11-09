import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_VERSION,
  Callable,
  ExportFilter,
  ExportPart,
  ExportScope,
  FunctionName,
  MediaType,
} from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";
import { accountJobId, clearJobCancel, throwIfJobCancelled } from "../hooks/jobCancel";
import { selectExportTitles } from "../hooks/exportAccountData/selectTitles";
import { readHistory } from "../hooks/exportAccountData/readHistory";

/** Firestore timestamps → ISO strings; anything else passes through */
function iso(value: unknown): unknown {
  const ts = value as Timestamp | undefined;
  return typeof ts?.toDate === "function" ? ts.toDate().toISOString() : value;
}

/** A doc's fields with every timestamp turned into an ISO string */
function plain(data: FirebaseFirestore.DocumentData) {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, iso(v)]));
}

const oneOf = <T extends string>(values: T[], raw: unknown, fallback: T): T =>
  values.includes(raw as T) ? (raw as T) : fallback;

/** The request's options; missing (an older client) = the whole account, everything */
function exportOptions(raw: unknown) {
  const data = (raw ?? {}) as Record<string, unknown>;
  const scope = oneOf(Object.values(ExportScope), data.scope, ExportScope.ALL);
  const filter = oneOf(Object.values(ExportFilter), data.filter, ExportFilter.ALL);
  const allParts = Object.values(ExportPart);
  // Custom lists only: the lists, nothing else
  const parts =
    scope === ExportScope.LISTS
      ? [ExportPart.LISTS]
      : Array.isArray(data.parts)
        ? allParts.filter((p) => (data.parts as unknown[]).includes(p))
        : allParts;
  return { scope, filter, parts: new Set(parts), jobId: accountJobId(data.jobId) };
}

/**
 * Settings → Export My Data, as one JSON object: the chosen titles (all / movies — all, to
 * watch, upcoming / TV — all, ended, ongoing) with what the user picked of their progress,
 * watch history (grouped by show) and custom lists — or the custom lists alone. A titles-only export carries id, type and
 * name. Reads the whole watch history for a full export (tens of thousands of docs on a big
 * account), so it is rate limited hard and only ever runs when the user asks; a cancel
 * (cancelAccountJob, by the client's job id) stops it between reads. The callable response
 * cap is 10 MB — episodes are kept to the fields that matter.
 */
export const exportAccountData = trackedOnCall(
  FunctionName.EXPORT_ACCOUNT_DATA,
  {
    maxInstances: 2,
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) => {
    const uid = await requireCaller(request, Callable.EXPORT_ACCOUNT_DATA);
    const { scope, filter, parts, jobId } = exportOptions(request.data);
    const db = getFirestore();
    const user = db.doc(`users/${uid}`);
    const checkpoint = () => throwIfJobCancelled(uid, jobId);

    try {
      const titles =
        scope === ExportScope.LISTS
          ? []
          : await selectExportTitles(db, (await user.collection("tracking").get()).docs, scope, filter);
      await checkpoint();

      // The whole account (all titles, no sub-filter): every watch, tracked or not
      const wholeAccount = scope === ExportScope.ALL;
      let watchedEpisodes: Record<string, unknown[]> | undefined;
      let watchedMovies: unknown[] | undefined;
      if (parts.has(ExportPart.HISTORY)) {
        const { episodes, movies } = await readHistory(
          db,
          uid,
          wholeAccount,
          titles.filter((t) => t.mediaType === MediaType.TV).map((t) => t.tmdbId),
          titles.filter((t) => t.mediaType === MediaType.MOVIE).map((t) => t.id),
          checkpoint,
        );
        watchedEpisodes = {};
        for (const doc of episodes) {
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
        watchedMovies = movies.map((d) => ({ id: d.id, ...plain(d.data() ?? {}) }));
        await checkpoint();
      }

      let customLists: unknown[] | undefined;
      if (parts.has(ExportPart.LISTS)) {
        const lists = await user.collection("customLists").get();
        const keep = new Set(titles.map((t) => t.id));
        customLists = lists.docs.flatMap((d) => {
          const list = plain(d.data());
          if (wholeAccount || scope === ExportScope.LISTS || !Array.isArray(list.items)) {
            return [{ id: d.id, ...list }];
          }
          // A narrowed export keeps only its titles in each list (a list left empty goes)
          const items = (list.items as Array<{ tmdbId?: number; mediaType?: MediaType }>).filter(
            (i) => keep.has(`${i.mediaType}_${i.tmdbId}`),
          );
          return items.length > 0 ? [{ id: d.id, ...list, items }] : [];
        });
      }
      await checkpoint();

      console.log(
        `[exportAccountData] ${uid}: ${scope}/${filter} [${[...parts].join(",")}] — ${titles.length} titles`,
      );
      return {
        format: ACCOUNT_EXPORT_FORMAT,
        version: ACCOUNT_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        scope,
        filter,
        parts: [...parts],
        // Always the titles (id, type, name); their progress only when asked for
        tracking: titles.map((t) => ({
          ...(parts.has(ExportPart.PROGRESS) ? plain(t.data) : {}),
          id: t.id,
          tmdbId: t.tmdbId,
          mediaType: t.mediaType,
          title: t.title,
          posterPath: t.posterPath,
        })),
        ...(watchedEpisodes ? { watchedEpisodes } : {}),
        ...(watchedMovies ? { watchedMovies } : {}),
        ...(customLists ? { customLists } : {}),
      };
    } finally {
      await clearJobCancel(uid, jobId);
    }
  },
);
