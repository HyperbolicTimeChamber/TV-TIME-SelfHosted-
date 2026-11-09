import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  SEARCH_INDEX_COLLECTION,
  SEARCH_INDEX_TTL_MS,
  type SearchScope,
} from "../../shared/enums";
import type { SearchTitlesResponse } from "../../shared/types";
import { words } from "./refineSearch";

/** Doc id of a query; null when it has no words to file it under */
export function searchIndexId(scope: SearchScope, query: string): string | null {
  const terms = words(query);
  return terms.length > 0 ? `${scope}_${terms.join("_")}` : null;
}

const indexRef = (id: string) => getFirestore().collection(SEARCH_INDEX_COLLECTION).doc(id);

/** Best effort: a failure just goes to TMDB */
async function readEntry<T>(id: string | null): Promise<T | null> {
  if (!id) return null;
  try {
    const snap = await indexRef(id).get();
    const entry = snap.data();
    // TTL deletion can lag by a day or more
    if (!entry || (entry.expireAt as Timestamp).toMillis() < Date.now()) return null;
    return entry.response as T;
  } catch {
    return null;
  }
}

async function writeEntry(id: string | null, response: unknown): Promise<void> {
  if (!id) return;
  try {
    await indexRef(id).set({
      response,
      expireAt: Timestamp.fromMillis(Date.now() + SEARCH_INDEX_TTL_MS),
    });
  } catch (err) {
    console.warn("[searchTitles] search index write failed:", err);
  }
}

/** An earlier answer to this title + year / person combination (only multi-word ones are filed) */
export const readSearchIndex = (scope: SearchScope, query: string) =>
  readEntry<SearchTitlesResponse>(
    query.trim().includes(" ") ? searchIndexId(scope, query) : null,
  );

export const writeSearchIndex = (
  scope: SearchScope,
  query: string,
  response: SearchTitlesResponse,
) => writeEntry(searchIndexId(scope, query), response);
