import { Timestamp } from "firebase-admin/firestore";
import { WatchStatus, ENDED_STATUSES } from "../../shared/enums";
import { CatalogShow } from "../../shared/types";
import { historyOnChange } from "../../shared/history";

const POINTER_STATUSES: string[] = [
  WatchStatus.WATCHING,
  WatchStatus.REWATCHING,
  WatchStatus.PAUSED,
  WatchStatus.PAUSED_REWATCH,
];

const isPlaceholderTitle = (t: string | null | undefined) =>
  !t || /^episode\s*\d+$/i.test(t.trim());

interface EpRef {
  season: number;
  episode: number;
  title: string | null;
  airDate: string | null;
}

function flatten(catalog: CatalogShow): EpRef[] {
  return [...(catalog.seasons ?? [])]
    .filter((s) => s.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .flatMap((s) =>
      (s.episodes ?? []).map((e) => ({
        season: s.seasonNumber,
        episode: e.episodeNumber,
        title: e.title ?? null,
        airDate: e.airDate ?? null,
      })),
    );
}

/**
 * Ended show still marked watching with nothing left after the pointer → should be
 * completed. Happens when the last episode was watched while TMDB still listed the
 * show as returning. Never-started docs (plays 0) don't count.
 */
export function isFinishedEndedShow(
  data: Record<string, any>,
  catalog: CatalogShow,
): boolean {
  if (!ENDED_STATUSES.includes(catalog.status)) return false;
  if (data.status !== WatchStatus.WATCHING || (data.plays ?? 0) <= 0) return false;
  const next = data.nextEpisode as { season: number; episode: number } | null;
  return (
    !next ||
    !flatten(catalog).some(
      (e) =>
        e.season > next.season ||
        (e.season === next.season && e.episode >= next.episode),
    )
  );
}

/** Fields that mark a finished ended show completed */
export const finishedEndedPatch = () => ({
  status: WatchStatus.COMPLETED,
  nextEpisode: null,
  ...historyOnChange(),
});

const toDateStr = (ts: unknown): string => {
  const d = (ts as Timestamp | undefined)?.toDate?.();
  return d ? d.toISOString().slice(0, 10) : "";
};

/**
 * Weekly tracking-doc reconcile against the fresh catalog:
 * 1. Active pointer → refresh nextEpisodeName / nextEpisodeAirDate (placeholder
 *    "Episode N" names + TBA air dates get filled in once TMDB has them).
 * 2. Caught up (nextEpisode null) or COMPLETED → if the catalog has an episode after
 *    the user's highest watched one that is new to them, point at it and set WATCHING.
 *    Covers imported shows and episodes TMDB listed before the user caught up.
 *    Paused rewatch → new AIRED episodes after the highest watched one end the rewatch:
 *    rewatch count back to 0, pointer on the first new episode (paused). The rewatch floor
 *    (rewatch count ≤ every episode's watches) can't hold for episodes nobody has seen.
 *    Completed shows reset the count the same way. A rewatch under way is left alone (its
 *    pointer never jumps mid-run); it reaches the new episodes when it completes.
 *    Gated by reconciledEpisodeCount so the watchedEpisodes query only runs when the
 *    show's episode count changed since the last check.
 *
 * @returns status overrides (docId → new status) so callers see reactivated shows
 */
export async function reconcileTracking(
  db: FirebaseFirestore.Firestore,
  uid: string,
  trackingDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  catalogMap: Map<string, CatalogShow>,
): Promise<Map<string, string>> {
  const overrides = new Map<string, string>();
  const writes: Array<{
    ref: FirebaseFirestore.DocumentReference;
    data: Record<string, unknown>;
  }> = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const td of trackingDocs) {
    const catalog = catalogMap.get(td.id);
    if (!catalog?.seasons?.length) continue;
    const data = td.data();
    const status: string = data.status;
    const next = data.nextEpisode as
      { season: number; episode: number } | null | undefined;
    const order = flatten(catalog);

    // 0. Ended show: only "finished but still watching" needs fixing. No reads.
    if (ENDED_STATUSES.includes(catalog.status)) {
      if (isFinishedEndedShow(data, catalog)) {
        writes.push({ ref: td.ref, data: finishedEndedPatch() });
        overrides.set(td.id, WatchStatus.COMPLETED);
      }
      continue;
    }

    // Only a paused rewatch: one under way keeps its pointer (see above)
    const inRewatch = status === WatchStatus.PAUSED_REWATCH;

    // 1. Refresh pointer metadata (a rewatch first checks for new episodes — step 2)
    if (
      next &&
      POINTER_STATUSES.includes(status) &&
      !(inRewatch && data.reconciledEpisodeCount !== catalog.totalEpisodes)
    ) {
      const ep = order.find(
        (e) => e.season === next.season && e.episode === next.episode,
      );
      if (!ep) continue;
      const patch: Record<string, unknown> = {};
      if (!isPlaceholderTitle(ep.title) && ep.title !== data.nextEpisodeName) {
        patch.nextEpisodeName = ep.title;
      }
      if (ep.airDate && ep.airDate !== data.nextEpisodeAirDate) {
        patch.nextEpisodeAirDate = ep.airDate;
      }
      if (Object.keys(patch).length > 0)
        writes.push({ ref: td.ref, data: patch });
      continue;
    }

    // 2. Caught up / completed → look for new episodes
    const caughtUp =
      (status === WatchStatus.WATCHING && !next) ||
      status === WatchStatus.COMPLETED ||
      inRewatch;
    if (!caughtUp) continue;
    if (data.reconciledEpisodeCount === catalog.totalEpisodes) continue;

    const watchedSnap = await db
      .collection(`users/${uid}/watchedEpisodes`)
      .where("tmdbShowId", "==", catalog.tmdbId)
      .get();
    let highest: { season: number; episode: number } | null = null;
    for (const w of watchedSnap.docs) {
      const { season, episode } = w.data();
      if (!season) continue;
      if (
        !highest ||
        season > highest.season ||
        (season === highest.season && episode > highest.episode)
      ) {
        highest = { season, episode };
      }
    }

    const mark = { reconciledEpisodeCount: catalog.totalEpisodes };
    if (!highest && status === WatchStatus.COMPLETED) {
      writes.push({ ref: td.ref, data: mark });
      continue;
    }
    const h = highest;
    const firstNew = h
      ? order.find(
          (e) =>
            e.season > h.season ||
            (e.season === h.season && e.episode > h.episode),
        )
      : order[0];
    // A rewatch only ends for episodes that have actually aired
    if (!firstNew || (inRewatch && (!firstNew.airDate || firstNew.airDate > today))) {
      writes.push({ ref: td.ref, data: mark });
      continue;
    }

    // COMPLETED: only reactivate for content newer than the user's last activity
    // (archived/dropped shows shouldn't resurface for old unwatched episodes)
    if (status === WatchStatus.COMPLETED && firstNew.airDate) {
      const since =
        [toDateStr(data.addedAt), toDateStr(data.lastWatchedAt)].sort().pop() ??
        "";
      if (firstNew.airDate < since) {
        writes.push({ ref: td.ref, data: mark });
        continue;
      }
    }

    const airMs = firstNew.airDate ? new Date(firstNew.airDate).getTime() : NaN;
    writes.push({
      ref: td.ref,
      data: {
        ...mark,
        // Status flips back to watching → Watch History card must refresh
        ...historyOnChange(),
        status:
          status === WatchStatus.PAUSED_REWATCH
            ? WatchStatus.PAUSED
            : WatchStatus.WATCHING,
        // New content → a first watch of it: the rewatch count starts over
        rewatchCount: 0,
        nextEpisode: { season: firstNew.season, episode: firstNew.episode },
        nextEpisodeName: firstNew.title ?? null,
        nextEpisodeAirDate: firstNew.airDate ?? null,
        priorityDate:
          firstNew.airDate && firstNew.airDate > today && !isNaN(airMs)
            ? Timestamp.fromMillis(airMs)
            : Timestamp.now(),
      },
    });
    overrides.set(
      td.id,
      status === WatchStatus.PAUSED_REWATCH
        ? WatchStatus.PAUSED
        : WatchStatus.WATCHING,
    );
  }

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const { ref, data } of writes.slice(i, i + 400))
      batch.set(ref, data, { merge: true });
    await batch.commit();
  }
  if (overrides.size > 0) {
    console.log(
      `Reactivated ${overrides.size} shows with new episodes for user ${uid}`,
    );
  }
  return overrides;
}
