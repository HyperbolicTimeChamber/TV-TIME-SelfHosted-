# Media Type Prefix for Firestore Doc IDs - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefix all `shows/` and `tracking/` Firestore doc IDs with media type (`tv_` or `movie_`) to prevent ID collisions between TMDB movies and TV shows that share the same numeric ID.

**Architecture:** Introduce a shared `showDocId(tmdbId, mediaType)` helper used by both client and CFs. Create a one-time migration CF that copies existing docs to new IDs and deletes old ones. Deploy CFs first (backward compatible), then client update, then run migration.

**Tech Stack:** TypeScript, React Native, Firebase Cloud Functions v2, Firestore

## Global Constraints

- `shows/{docId}` and `users/{uid}/tracking/{docId}` are the only collections that need prefixing
- `watchedEpisodes/` and `watchedMovies/` stay unchanged (already namespaced by subcollection type)
- Doc ID format: `tv_{tmdbId}` or `movie_{tmdbId}` (e.g., `tv_12345`, `movie_12345`)
- All CFs must accept both old (`"12345"`) and new (`"tv_12345"`) formats during migration window
- `episodeDocId()` stays unchanged — uses tmdbShowId as number prefix, no collision risk

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `functions/src/docId.ts` | Create | Shared `showDocId()` + `parseTmdbId()` helpers |
| `functions/src/addShow.ts` | Modify | Use `showDocId()` for shows/ and tracking/ |
| `functions/src/removeShow.ts` | Modify | Same |
| `functions/src/importMatches.ts` | Modify | Same |
| `functions/src/syncCatalog.ts` | Modify | Same |
| `functions/src/markSeasonWatched.ts` | Modify | Same |
| `functions/src/utils.ts` | Modify | Same |
| `functions/src/deleteAccount.ts` | Modify | Same |
| `functions/src/migrateDocIds.ts` | Create | One-time migration CF |
| `app/src/utils/docId.ts` | Create | Client-side `showDocId()` helper |
| `app/src/services/firestore.ts` | Modify | Use `showDocId()` everywhere |
| `app/src/hooks/useWatchlist.ts` | Modify | Use `showDocId()` for catalog reads |
| `app/src/hooks/useCalendarEpisodes.ts` | Modify | Same |
| `app/src/screens/ShowDetailScreen.tsx` | Modify | Tracking doc listener |
| `app/src/screens/SearchScreen.tsx` | Modify | Resume tracking update |

---

### Task 1: Create shared doc ID helpers

**Files:**
- Create: `functions/src/docId.ts`
- Create: `app/src/utils/docId.ts`

**Produces:**
- `showDocId(tmdbId: number, mediaType: "tv" | "movie"): string` → `"tv_12345"` or `"movie_12345"`
- `parseTmdbId(docId: string): { tmdbId: number; mediaType: "tv" | "movie" }`

- [ ] **Step 1: Create CF helper**

```typescript
// functions/src/docId.ts
export function showDocId(tmdbId: number, mediaType: "tv" | "movie"): string {
  return `${mediaType}_${tmdbId}`;
}

export function parseTmdbId(docId: string): { tmdbId: number; mediaType: "tv" | "movie" } {
  const match = docId.match(/^(tv|movie)_(\d+)$/);
  if (match) {
    return { mediaType: match[1] as "tv" | "movie", tmdbId: Number(match[2]) };
  }
  // Legacy format: bare number — assume TV (most common)
  return { mediaType: "tv", tmdbId: Number(docId) };
}
```

- [ ] **Step 2: Create client helper (identical)**

```typescript
// app/src/utils/docId.ts
export function showDocId(tmdbId: number, mediaType: "tv" | "movie"): string {
  return `${mediaType}_${tmdbId}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add functions/src/docId.ts app/src/utils/docId.ts
git commit -m "feat: add showDocId helper for prefixed Firestore doc IDs"
```

---

### Task 2: Update all Cloud Functions to use prefixed IDs

**Files:**
- Modify: `functions/src/addShow.ts`
- Modify: `functions/src/removeShow.ts`
- Modify: `functions/src/importMatches.ts`
- Modify: `functions/src/syncCatalog.ts`
- Modify: `functions/src/markSeasonWatched.ts`
- Modify: `functions/src/utils.ts`
- Modify: `functions/src/deleteAccount.ts`

**Consumes:** `showDocId()` from `./docId`

Every `String(tmdbId)` or `` `shows/${showId}` `` becomes `showDocId(tmdbId, mediaType)`.
Every `` `tracking/${showId}` `` becomes `showDocId(tmdbId, mediaType)`.

Key changes per file:

- [ ] **Step 1: Update `addShow.ts`**

Replace `const showId = String(tmdbId);` with `const showId = showDocId(tmdbId, mediaType);`
Import `showDocId` from `./docId`.

- [ ] **Step 2: Update `removeShow.ts`**

Replace `const showId = String(data.tmdbId);` with `const showId = showDocId(data.tmdbId, mediaType);`
Need to determine mediaType — read from tracking doc or pass as param.
Import `showDocId` from `./docId`.

- [ ] **Step 3: Update `importMatches.ts`**

Replace `const showId = String(m.tmdbId);` with `const showId = showDocId(m.tmdbId, m.mediaType);`
Import `showDocId` from `./docId`.

- [ ] **Step 4: Update `syncCatalog.ts`**

This file iterates existing shows docs. During migration, docs may have old or new IDs.
Use `parseTmdbId()` to handle both formats.
Import both helpers from `./docId`.

- [ ] **Step 5: Update `markSeasonWatched.ts`**

Replace `` `users/${uid}/tracking/${tmdbId}` `` with `` `users/${uid}/tracking/${showDocId(tmdbId, "tv")}` `` (season marking is always TV).
Import `showDocId` from `./docId`.

- [ ] **Step 6: Update `utils.ts`**

`addToTrackedBy`, `removeFromTrackedBy`, `getAllTrackerUids` all take `showId: string` — these already receive the doc ID, so they just need callers to pass the prefixed ID. No change needed in utils.ts itself.

- [ ] **Step 7: Update `deleteAccount.ts`**

Replace `db.doc(`shows/${d.id}`)` — `d.id` is already the tracking doc ID which should match the shows doc ID. After migration, tracking doc IDs will be prefixed, so `d.id` will already be `tv_12345`. No change needed if tracking and shows use the same ID format.

- [ ] **Step 8: Type check + deploy**

```bash
cd functions && npx tsc --noEmit
firebase deploy --only functions
```

- [ ] **Step 9: Commit**

```bash
git add functions/src/
git commit -m "feat(cf): use showDocId prefix for all Firestore doc IDs"
```

---

### Task 3: Update client code to use prefixed IDs

**Files:**
- Modify: `app/src/services/firestore.ts` (17 locations)
- Modify: `app/src/hooks/useWatchlist.ts` (2 locations)
- Modify: `app/src/hooks/useCalendarEpisodes.ts` (1 location)
- Modify: `app/src/screens/ShowDetailScreen.tsx` (1 location)
- Modify: `app/src/screens/SearchScreen.tsx` (1 location)

**Consumes:** `showDocId()` from `../utils/docId`

- [ ] **Step 1: Update `firestore.ts`**

All `String(tmdbId)` used as doc IDs for shows/ or tracking/ → `showDocId(tmdbId, mediaType)`.
Import `showDocId` from `../utils/docId`.

Key functions to update:
- `getCatalogShow(tmdbId)` — needs mediaType param added
- `addToTracking(userId, tmdbId, mediaType)` — already has mediaType
- `stopWatching`, `markEpisodeWatched`, `unmarkEpisodeWatched`, `decrementEpisodeWatchCount` — need mediaType or use "tv" (episodes are always TV)
- `startRewatch`, `resumeWatching`, `resumeRewatch` — need mediaType param or use tracking doc lookup
- `markMovieWatched` — use "movie"
- `markSeasonWatchedCF` — use "tv"
- `getHighestWatchedEpisode` — no doc ID change (queries by field, not doc ID)

- [ ] **Step 2: Update `useWatchlist.ts`**

Line 39: `doc(db, "shows", key)` — `key` comes from tracking doc `d.id` which will be the tracking doc ID. After migration, tracking doc IDs are prefixed. But enrichment maps by `item.tmdbId`. Need to use `showDocId(item.tmdbId, item.mediaType)` for the shows/ lookup.

Line 113: `doc(db, "users", userId, "tracking", String(p.tmdbId))` → use `showDocId(p.tmdbId, p.mediaType)`

- [ ] **Step 3: Update `useCalendarEpisodes.ts`**

Line 151: `doc(db, "shows", String(id))` → `showDocId(id, "tv")` (calendar TV discover)

- [ ] **Step 4: Update `ShowDetailScreen.tsx`**

Line 67: tracking doc listener — use `showDocId(tmdbId, mediaType)` (mediaType is in route params)

- [ ] **Step 5: Update `SearchScreen.tsx`**

Line 232: tracking doc update for resume — use `showDocId(item.id, MediaType.TV)`

- [ ] **Step 6: Type check**

```bash
cd app && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/src/
git commit -m "feat(client): use showDocId prefix for all Firestore doc IDs"
```

---

### Task 4: Create migration Cloud Function

**Files:**
- Create: `functions/src/migrateDocIds.ts`
- Modify: `functions/src/index.ts` (export new CF)

**Produces:** `migrateDocIds` — one-time callable CF that:
1. Reads all `shows/` docs
2. For each: creates `shows/{mediaType}_{tmdbId}` with same data, deletes old doc
3. For each user's `tracking/` docs: same rename
4. Logs progress

- [ ] **Step 1: Create migration CF**

```typescript
// functions/src/migrateDocIds.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { showDocId } from "./docId";

export const migrateDocIds = onCall(
  { maxInstances: 1, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const db = getFirestore();
    let showsMigrated = 0;
    let trackingMigrated = 0;

    // 1. Migrate shows/ collection
    const showsSnap = await db.collection("shows").get();
    for (const showDoc of showsSnap.docs) {
      const oldId = showDoc.id;
      // Skip already-migrated docs
      if (oldId.startsWith("tv_") || oldId.startsWith("movie_")) continue;

      const data = showDoc.data();
      const mediaType = data.mediaType || "tv";
      const tmdbId = data.tmdbId || Number(oldId);
      const newId = showDocId(tmdbId, mediaType);

      if (oldId === newId) continue;

      await db.doc(`shows/${newId}`).set(data);
      await db.doc(`shows/${oldId}`).delete();
      showsMigrated++;
    }

    // 2. Migrate tracking/ subcollections for all users
    const usersSnap = await db.collection("users").get();
    for (const userDoc of usersSnap.docs) {
      const trackingSnap = await db.collection(`users/${userDoc.id}/tracking`).get();
      for (const trackDoc of trackingSnap.docs) {
        const oldId = trackDoc.id;
        if (oldId.startsWith("tv_") || oldId.startsWith("movie_")) continue;

        const data = trackDoc.data();
        const mediaType = data.mediaType || "tv";
        const tmdbId = data.tmdbId || Number(oldId);
        const newId = showDocId(tmdbId, mediaType);

        if (oldId === newId) continue;

        await db.doc(`users/${userDoc.id}/tracking/${newId}`).set(data);
        await db.doc(`users/${userDoc.id}/tracking/${oldId}`).delete();
        trackingMigrated++;
      }
    }

    return { showsMigrated, trackingMigrated };
  }
);
```

- [ ] **Step 2: Export from index.ts**

Add `export { migrateDocIds } from "./migrateDocIds";` to `functions/src/index.ts`.

- [ ] **Step 3: Deploy + run migration**

```bash
cd functions && firebase deploy --only functions:migrateDocIds
# Then call from Firebase console or:
# curl -X POST https://us-central1-tv-time-returns.cloudfunctions.net/migrateDocIds
```

- [ ] **Step 4: Verify migration**

Check Firestore console: all docs in `shows/` should be `tv_XXXXX` or `movie_XXXXX`.
Spot-check a few `users/{uid}/tracking/` subcollections.

- [ ] **Step 5: Commit**

```bash
git add functions/src/migrateDocIds.ts functions/src/index.ts
git commit -m "feat(cf): add one-time migrateDocIds Cloud Function"
```

---

### Task 5: Clear client caches after migration

After migration, client caches have old doc IDs. Need to clear:

- [ ] **Step 1: Bump a cache version**

In `app/src/enums/index.ts`, update `WATCHLIST_ACTIVE` and `UPCOMING_EPISODES` cache keys to force cache miss:

```typescript
WATCHLIST_ACTIVE = "watchlist_active_cache_v2",
UPCOMING_EPISODES = "upcoming_episodes_cache_v2",
```

This forces fresh fetches with new doc IDs on next app open.

- [ ] **Step 2: Commit + push**

```bash
git add app/src/enums/index.ts
git commit -m "chore: bump cache keys after doc ID migration"
```

---

## Deployment Order

1. Deploy CFs (Task 2) — new code handles both old and new IDs
2. Run migration CF (Task 4) — renames all docs
3. Push client update (Task 3 + 5) — client uses new IDs + fresh caches
4. Verify everything works
5. Remove migration CF (cleanup)
