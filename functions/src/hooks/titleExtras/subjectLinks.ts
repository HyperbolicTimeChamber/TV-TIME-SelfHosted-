import axios from "axios";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { SubjectKind, TMDB_BASE, TmdbStudioType } from "../../shared/enums";
import type {
  StoredCastMember,
  StoredStudio,
  SubjectLink,
  TitleExtrasFields,
} from "../../shared/types";
import { creditsRef, readStoredExtras } from "./store";

export class SubjectNotFoundError extends Error {}

type WithImdbId = { id: number; imdbId?: string | null };

const tmdbGet = async <T>(apiKey: string, path: string) =>
  (await axios.get<T>(`${TMDB_BASE}${path}`, { params: { api_key: apiKey }, timeout: 10000 })).data;

async function fetchPersonImdbId(apiKey: string, id: number): Promise<string | null> {
  const data = await tmdbGet<{ imdb_id?: string | null }>(apiKey, `/person/${id}/external_ids`);
  return data.imdb_id || null;
}

/**
 * A studio's type + website. Titles store networks and companies in one list without saying
 * which, and the two number independently (HBO is network 49, company 49 is someone else) — so
 * the record showing this studio's logo is the right one
 */
async function fetchStudioLink(
  apiKey: string,
  studio: StoredStudio,
): Promise<Required<Pick<SubjectLink, "studioType" | "homepage">>> {
  for (const studioType of [TmdbStudioType.COMPANY, TmdbStudioType.NETWORK]) {
    const data = await tmdbGet<{ logo_path?: string | null; homepage?: string | null }>(
      apiKey,
      `/${studioType}/${studio.id}`,
    ).catch(() => null);
    if (data?.logo_path === studio.logo) return { studioType, homepage: data.homepage || null };
  }
  return { studioType: TmdbStudioType.COMPANY, homepage: null };
}

export const withImdbId = <T extends WithImdbId>(
  list: T[] | undefined,
  id: number,
  imdbId: string | null,
): T[] | undefined => list?.map((m) => (m.id === id ? { ...m, imdbId } : m));

/** A fresh TMDB fetch knows no links: the stored ones go onto it, so a refresh doesn't lose them
 *  (or count as a change) */
export function carryLinks(
  old: TitleExtrasFields,
  fresh: TitleExtrasFields,
  fullCast?: StoredCastMember[],
): { fields: TitleExtrasFields; fullCast?: StoredCastMember[] } {
  const ids = new Map<number, string | null>();
  for (const m of [...(old.cast ?? []), ...(old.directors ?? []), ...(old.writers ?? [])]) {
    if (m.imdbId !== undefined) ids.set(m.id, m.imdbId);
  }
  const carry = <T extends WithImdbId>(list: T[]): T[] =>
    list.map((m) => (ids.has(m.id) ? { ...m, imdbId: ids.get(m.id) } : m));
  const studios = new Map((old.studioLogos ?? []).map((s) => [s.id, s]));
  const fields: TitleExtrasFields = { ...fresh };
  if (fresh.cast) fields.cast = carry(fresh.cast);
  if (fresh.directors) fields.directors = carry(fresh.directors);
  if (fresh.writers) fields.writers = carry(fresh.writers);
  if (fresh.studioLogos) {
    fields.studioLogos = fresh.studioLogos.map((s) => {
      const known = studios.get(s.id);
      return known?.studioType
        ? { ...s, studioType: known.studioType, homepage: known.homepage ?? null }
        : s;
    });
  }
  return { fields, fullCast: fullCast && carry(fullCast) };
}

/** Changes a stored doc under a transaction: the link goes in without losing a concurrent one */
async function patchDoc(
  db: Firestore,
  ref: DocumentReference,
  change: (data: TitleExtrasFields) => TitleExtrasFields,
) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    tx.set(ref, change((snap.data() ?? {}) as TitleExtrasFields), { merge: true });
  });
}

/** Only the lists the doc has: Firestore refuses undefined */
const defined = (fields: TitleExtrasFields) =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as TitleExtrasFields;

/**
 * A person's / studio's link: stored with them on the title if already looked up, else asked of
 * TMDB (`acquire` = the caller's rate limit) and stored there for everyone. Only subjects of this
 * title are served, so the callable can't be used as a general TMDB relay
 */
export async function resolveSubjectLink(
  db: Firestore,
  docId: string,
  kind: SubjectKind,
  id: number,
  getKey: () => Promise<string>,
  acquire: () => Promise<void>,
): Promise<SubjectLink> {
  const { ref, data } = await readStoredExtras(db, docId);

  if (kind === SubjectKind.STUDIO) {
    const studio = data.studioLogos?.find((s) => s.id === id);
    if (!studio) throw new SubjectNotFoundError();
    if (studio.studioType) {
      return { studioType: studio.studioType, homepage: studio.homepage ?? null };
    }
    await acquire();
    const link = await fetchStudioLink(await getKey(), studio);
    await patchDoc(db, ref, (d) =>
      defined({ studioLogos: d.studioLogos?.map((s) => (s.id === id ? { ...s, ...link } : s)) }),
    );
    return link;
  }

  const featured = [...(data.cast ?? []), ...(data.directors ?? []), ...(data.writers ?? [])];
  const onTitle = featured.find((m) => m.id === id);
  const credits = onTitle ? undefined : creditsRef(db, docId);
  const member =
    onTitle ??
    (((await credits?.get())?.get("cast") as StoredCastMember[] | undefined) ?? []).find(
      (m) => m.id === id,
    );
  if (!member) throw new SubjectNotFoundError();
  if (member.imdbId !== undefined) return { imdbId: member.imdbId };
  await acquire();
  const imdbId = await fetchPersonImdbId(await getKey(), id);
  await patchDoc(db, credits ?? ref, (d) =>
    defined(
      credits
        ? { cast: withImdbId(d.cast, id, imdbId) }
        : {
            cast: withImdbId(d.cast, id, imdbId),
            directors: withImdbId(d.directors, id, imdbId),
            writers: withImdbId(d.writers, id, imdbId),
          },
    ),
  );
  return { imdbId };
}
