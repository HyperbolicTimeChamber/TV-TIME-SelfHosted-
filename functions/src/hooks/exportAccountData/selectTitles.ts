import { FieldPath, type Firestore } from "firebase-admin/firestore";
import {
  ENDED_STATUSES,
  ExportFilter,
  ExportScope,
  FIRESTORE_IN_LIMIT,
  MediaType,
  WatchStatus,
} from "../../shared/enums";

/** A tracked title with the catalog facts the filters (and the file) need */
export interface ExportTitle {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  data: FirebaseFirestore.DocumentData;
  title: string | null;
  posterPath: string | null;
  /** TV: TMDB status ("Ended", "Returning Series"…) */
  showStatus: string | null;
  /** Movie: release date (YYYY-MM-DD) */
  releaseDate: string | null;
}

const TRACKING_ID = /^(tv|movie)_(\d+)$/;

/** Catalog title / poster / status / release date for these doc ids (light: select only) */
async function catalogFacts(
  db: Firestore,
  ids: string[],
): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const facts = new Map<string, FirebaseFirestore.DocumentData>();
  for (let i = 0; i < ids.length; i += FIRESTORE_IN_LIMIT) {
    const snap = await db
      .collection("shows")
      .where(FieldPath.documentId(), "in", ids.slice(i, i + FIRESTORE_IN_LIMIT))
      .select("title", "posterPath", "status", "releaseDate")
      .get();
    for (const d of snap.docs) facts.set(d.id, d.data());
  }
  return facts;
}

function matchesFilter(t: ExportTitle, filter: ExportFilter, today: string): boolean {
  switch (filter) {
    case ExportFilter.MOVIES_TO_WATCH:
      return (
        t.mediaType === MediaType.MOVIE &&
        t.data.status !== WatchStatus.COMPLETED &&
        !!t.releaseDate &&
        t.releaseDate <= today
      );
    case ExportFilter.MOVIES_UPCOMING:
      return t.mediaType === MediaType.MOVIE && (!t.releaseDate || t.releaseDate > today);
    case ExportFilter.TV_ENDED:
      return t.mediaType === MediaType.TV && ENDED_STATUSES.includes(t.showStatus ?? "");
    case ExportFilter.TV_ONGOING:
      return t.mediaType === MediaType.TV && !ENDED_STATUSES.includes(t.showStatus ?? "");
    default:
      return true;
  }
}

/** The tracked titles an export covers: scope (all / movies / TV), then its sub-filter */
export async function selectExportTitles(
  db: Firestore,
  tracking: FirebaseFirestore.QueryDocumentSnapshot[],
  scope: ExportScope,
  filter: ExportFilter,
): Promise<ExportTitle[]> {
  const inScope = tracking.filter((d) => {
    const type = TRACKING_ID.exec(d.id)?.[1];
    if (!type) return false;
    if (scope === ExportScope.MOVIES) return type === MediaType.MOVIE;
    if (scope === ExportScope.TV) return type === MediaType.TV;
    return true;
  });
  const facts = await catalogFacts(
    db,
    inScope.map((d) => d.id),
  );
  const today = new Date().toISOString().slice(0, 10);
  const titles: ExportTitle[] = inScope.map((d) => {
    const [, type, id] = TRACKING_ID.exec(d.id)!;
    const f = facts.get(d.id);
    return {
      id: d.id,
      tmdbId: Number(id),
      mediaType: type as MediaType,
      data: d.data(),
      title: typeof f?.title === "string" ? f.title : null,
      posterPath: typeof f?.posterPath === "string" ? f.posterPath : null,
      showStatus: typeof f?.status === "string" ? f.status : null,
      releaseDate: typeof f?.releaseDate === "string" ? f.releaseDate : null,
    };
  });
  return scope === ExportScope.ALL ? titles : titles.filter((t) => matchesFilter(t, filter, today));
}
