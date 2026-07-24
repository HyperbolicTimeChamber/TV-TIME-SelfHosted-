# Shared Catalog + Cloud Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-user TMDB data with a shared show catalog backed by Cloud Functions, smart watchlist visibility/sorting, and server-side import with push notifications.

**Architecture:** Shared `shows/` Firestore collection stores all show/episode data. Cloud Functions handle TMDB API calls (addShow, removeShow, importMatches, weekly syncCatalog cron). Client reads catalog directly, writes to per-user `tracking/` + `watchedEpisodes/` + `watchedMovies/`. TMDB API key served from Firestore `config/app` doc for client search, and from Secret Manager for CFs.

**Tech Stack:** React Native (Expo 57), Firebase Functions v2 (Node.js/TypeScript), Firestore, FCM, RNFirebase v25 modular API, React Query, Zustand

## Global Constraints

- Expo SDK 57 — read docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo-specific code
- RNFirebase v25 modular API — use `getFirestore`, `collection`, `doc`, `onSnapshot`, `writeBatch`, etc.
- Firebase Functions v2 (2nd gen) — use `onCall`, `onSchedule` from `firebase-functions/v2`
- TMDB API concurrency: max 5 parallel via `pooled()` helper
- Firestore batch limit: 500 operations per batch
- Package name: `com.tvtimerevived.app`
- No per-user TMDB API keys — single app-level key
- User data cleared — no migration needed

**Spec:** `docs/superpowers/specs/2026-07-14-shared-catalog-cloud-functions-design.md`

---

### Task 1: Firebase Infrastructure + Cloud Functions Scaffold

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/src/index.ts`
- Create: `functions/src/tmdb.ts`
- Create: `functions/src/utils.ts`
- Create: `functions/.gitignore`
- Modify: `firebase.json`
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: Nothing (first task)
- Produces: Deployable functions scaffold, `fetchShowFromTMDB(tmdbId, mediaType)` utility, `pooled()` helper, updated Firestore rules + indexes

- [ ] **Step 1: Create functions directory and package.json**

```bash
mkdir -p functions/src
```

```json
// functions/package.json
{
  "name": "tv-time-returns-functions",
  "private": true,
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "serve": "npm run build && firebase emulators:start --only functions",
    "shell": "npm run build && firebase functions:shell",
    "deploy": "firebase deploy --only functions",
    "lint": "eslint src/"
  },
  "engines": {
    "node": "20"
  },
  "dependencies": {
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^6.3.0",
    "axios": "^1.18.1"
  },
  "devDependencies": {
    "typescript": "~5.7.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// functions/tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2022",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "compileOnSave": true,
  "include": ["src"]
}
```

- [ ] **Step 3: Create functions/.gitignore**

```
lib/
node_modules/
.env
```

- [ ] **Step 4: Create TMDB utility for Cloud Functions**

```typescript
// functions/src/tmdb.ts
import axios from "axios";

const TMDB_BASE = "https://api.themoviedb.org/3";

interface TMDBEpisode {
  episode_number: number;
  name: string;
  air_date: string | null;
  runtime: number | null;
}

interface TMDBSeasonDetail {
  season_number: number;
  episodes: TMDBEpisode[];
  air_date: string | null;
}

interface TMDBShowDetail {
  id: number;
  name?: string;
  title?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  status: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  runtime?: number | null;
  episode_run_time?: number[];
  first_air_date?: string;
  release_date?: string;
  vote_average: number;
  seasons?: Array<{
    season_number: number;
    episode_count: number;
    air_date: string | null;
  }>;
}

export interface CatalogEpisode {
  episodeNumber: number;
  title: string;
  airDate: string | null;
  runtime: number | null;
}

export interface CatalogSeason {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
  episodes: CatalogEpisode[];
}

export interface CatalogShow {
  tmdbId: number;
  mediaType: "tv" | "movie";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  status: string;
  totalSeasons: number;
  totalEpisodes: number;
  runtime: number | null;
  voteAverage: number;
  firstAirDate: string | null;
  releaseDate: string | null;
  seasons: CatalogSeason[];
}

export async function pooled<T>(
  tasks: (() => Promise<T>)[],
  concurrency = 5
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function fetchSeasonEpisodes(
  apiKey: string,
  tmdbId: number,
  seasonNumber: number
): Promise<CatalogSeason> {
  const { data } = await axios.get<TMDBSeasonDetail>(
    `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}`,
    { params: { api_key: apiKey } }
  );
  return {
    seasonNumber: data.season_number,
    episodeCount: data.episodes.length,
    airDate: data.air_date,
    episodes: data.episodes.map((ep) => ({
      episodeNumber: ep.episode_number,
      title: ep.name,
      airDate: ep.air_date,
      runtime: ep.runtime,
    })),
  };
}

export async function fetchShowFromTMDB(
  apiKey: string,
  tmdbId: number,
  mediaType: "tv" | "movie"
): Promise<CatalogShow> {
  const endpoint =
    mediaType === "tv"
      ? `${TMDB_BASE}/tv/${tmdbId}`
      : `${TMDB_BASE}/movie/${tmdbId}`;

  const { data } = await axios.get<TMDBShowDetail>(endpoint, {
    params: { api_key: apiKey },
  });

  let seasons: CatalogSeason[] = [];
  let totalEpisodes = data.number_of_episodes ?? 0;
  let totalSeasons = data.number_of_seasons ?? 0;

  if (mediaType === "tv" && data.seasons) {
    const seasonNumbers = data.seasons
      .filter((s) => s.season_number > 0)
      .map((s) => s.season_number);

    const tasks = seasonNumbers.map(
      (num) => () => fetchSeasonEpisodes(apiKey, tmdbId, num)
    );
    seasons = await pooled(tasks, 5);
    totalEpisodes = seasons.reduce((sum, s) => sum + s.episodeCount, 0);
    totalSeasons = seasons.length;
  }

  const avgRuntime =
    mediaType === "movie"
      ? data.runtime ?? null
      : data.episode_run_time?.[0] ?? null;

  return {
    tmdbId,
    mediaType,
    title: data.name ?? data.title ?? "Unknown",
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    overview: data.overview ?? "",
    status: data.status ?? "Unknown",
    totalSeasons,
    totalEpisodes,
    runtime: avgRuntime,
    voteAverage: data.vote_average ?? 0,
    firstAirDate: data.first_air_date ?? null,
    releaseDate: data.release_date ?? null,
    seasons,
  };
}
```

- [ ] **Step 5: Create utils.ts with trackedBy helpers**

```typescript
// functions/src/utils.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const TRACKED_BY_LIMIT = 1000;

export async function addToTrackedBy(
  showId: string,
  uid: string
): Promise<void> {
  const db = getFirestore();
  const showRef = db.doc(`shows/${showId}`);

  await db.runTransaction(async (tx) => {
    const showDoc = await tx.get(showRef);
    if (!showDoc.exists) return;

    const trackedBy: string[] = showDoc.data()?.trackedBy ?? [];
    if (trackedBy.includes(uid)) return;

    if (trackedBy.length < TRACKED_BY_LIMIT) {
      tx.update(showRef, {
        trackedBy: FieldValue.arrayUnion(uid),
        trackedByCount: FieldValue.increment(1),
      });
    } else {
      // Overflow: find or create overflow chunk
      const overflowSnap = await tx.get(
        showRef.collection("trackedByOverflow")
      );
      let placed = false;
      for (const chunk of overflowSnap.docs) {
        const uids: string[] = chunk.data().uids ?? [];
        if (uids.length < TRACKED_BY_LIMIT && !uids.includes(uid)) {
          tx.update(chunk.ref, { uids: FieldValue.arrayUnion(uid) });
          tx.update(showRef, { trackedByCount: FieldValue.increment(1) });
          placed = true;
          break;
        }
      }
      if (!placed) {
        const newChunkRef = showRef
          .collection("trackedByOverflow")
          .doc();
        tx.set(newChunkRef, { uids: [uid] });
        tx.update(showRef, { trackedByCount: FieldValue.increment(1) });
      }
    }
  });
}

export async function removeFromTrackedBy(
  showId: string,
  uid: string
): Promise<number> {
  const db = getFirestore();
  const showRef = db.doc(`shows/${showId}`);

  return db.runTransaction(async (tx) => {
    const showDoc = await tx.get(showRef);
    if (!showDoc.exists) return 0;

    const trackedBy: string[] = showDoc.data()?.trackedBy ?? [];
    const currentCount: number = showDoc.data()?.trackedByCount ?? 0;

    if (trackedBy.includes(uid)) {
      tx.update(showRef, {
        trackedBy: FieldValue.arrayRemove(uid),
        trackedByCount: FieldValue.increment(-1),
      });
      return currentCount - 1;
    }

    // Check overflow chunks
    const overflowSnap = await tx.get(
      showRef.collection("trackedByOverflow")
    );
    for (const chunk of overflowSnap.docs) {
      const uids: string[] = chunk.data().uids ?? [];
      if (uids.includes(uid)) {
        tx.update(chunk.ref, { uids: FieldValue.arrayRemove(uid) });
        tx.update(showRef, { trackedByCount: FieldValue.increment(-1) });
        return currentCount - 1;
      }
    }

    return currentCount;
  });
}

export async function getAllTrackerUids(
  showId: string
): Promise<string[]> {
  const db = getFirestore();
  const showRef = db.doc(`shows/${showId}`);
  const showDoc = await showRef.get();
  if (!showDoc.exists) return [];

  const trackedBy: string[] = showDoc.data()?.trackedBy ?? [];

  const overflowSnap = await showRef
    .collection("trackedByOverflow")
    .get();
  for (const chunk of overflowSnap.docs) {
    trackedBy.push(...(chunk.data().uids ?? []));
  }

  return trackedBy;
}
```

- [ ] **Step 6: Create stub index.ts**

```typescript
// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

// Cloud Functions will be added in subsequent tasks
export { addShow } from "./addShow";
export { removeShow } from "./removeShow";
```

Note: `addShow` and `removeShow` don't exist yet. This file will be updated as each CF is implemented. For now, comment out the exports:

```typescript
// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

// Exports added as CFs are implemented
```

- [ ] **Step 7: Update firebase.json to include functions**

Replace contents of `firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local"
      ]
    }
  ],
  "emulators": {
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true }
  }
}
```

- [ ] **Step 8: Update Firestore rules**

Replace contents of `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // App config — read-only for authenticated users
    match /config/{doc} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // Shared catalog — read-only for authenticated users, write by CFs only
    match /shows/{showId} {
      allow read: if request.auth != null;
      allow write: if false;

      match /trackedByOverflow/{chunk} {
        allow read: if request.auth != null;
        allow write: if false;
      }
    }

    // Per-user data
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;

      match /tracking/{showId} {
        allow read, write: if request.auth.uid == userId;
      }

      match /watchedEpisodes/{episodeId} {
        allow read, write: if request.auth.uid == userId;
      }

      match /watchedMovies/{movieId} {
        allow read, write: if request.auth.uid == userId;
      }
    }
  }
}
```

- [ ] **Step 9: Update Firestore indexes**

Replace contents of `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "tracking",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "priorityDate", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 10: Install functions dependencies**

```bash
cd functions && npm install
```

- [ ] **Step 11: Build and verify compilation**

```bash
cd functions && npm run build
```

Expected: Successful build with no errors (just the stub index.ts).

- [ ] **Step 12: Commit**

```bash
git add functions/ firebase.json firestore.rules firestore.indexes.json
git commit -m "feat: scaffold Cloud Functions + update Firestore rules and indexes"
```

---

### Task 2: addShow Cloud Function

**Files:**
- Create: `functions/src/addShow.ts`
- Modify: `functions/src/index.ts` (add export)

**Interfaces:**
- Consumes: `fetchShowFromTMDB()` from `functions/src/tmdb.ts`, `addToTrackedBy()` from `functions/src/utils.ts`
- Produces: `addShow` HTTPS Callable — `{ tmdbId: number, mediaType: "tv" | "movie" }` → returns `CatalogShow` data

- [ ] **Step 1: Create addShow.ts**

```typescript
// functions/src/addShow.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fetchShowFromTMDB, CatalogShow } from "./tmdb";
import { addToTrackedBy } from "./utils";

const tmdbApiKey = defineSecret("TMDB_API_KEY");

interface AddShowRequest {
  tmdbId: number;
  mediaType: "tv" | "movie";
}

export const addShow = onCall(
  {
    secrets: [tmdbApiKey],
    maxInstances: 5,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request): Promise<CatalogShow> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { tmdbId, mediaType } = request.data as AddShowRequest;
    if (!tmdbId || !mediaType) {
      throw new HttpsError(
        "invalid-argument",
        "tmdbId and mediaType required"
      );
    }

    const db = getFirestore();
    const showId = String(tmdbId);
    const showRef = db.doc(`shows/${showId}`);
    const uid = request.auth.uid;

    // Check if show already exists in catalog
    const showDoc = await showRef.get();

    if (showDoc.exists) {
      // Add user to trackedBy
      await addToTrackedBy(showId, uid);
      return showDoc.data() as CatalogShow;
    }

    // Fetch from TMDB and create catalog entry
    const apiKey = tmdbApiKey.value();
    const showData = await fetchShowFromTMDB(apiKey, tmdbId, mediaType);

    await showRef.set({
      ...showData,
      trackedBy: [uid],
      trackedByCount: 1,
      lastSyncedAt: FieldValue.serverTimestamp(),
    });

    return showData;
  }
);
```

- [ ] **Step 2: Update index.ts to export addShow**

```typescript
// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { addShow } from "./addShow";
```

- [ ] **Step 3: Build and verify**

```bash
cd functions && npm run build
```

Expected: Successful compilation.

- [ ] **Step 4: Commit**

```bash
git add functions/src/addShow.ts functions/src/index.ts
git commit -m "feat: add addShow cloud function"
```

---

### Task 3: removeShow Cloud Function

**Files:**
- Create: `functions/src/removeShow.ts`
- Modify: `functions/src/index.ts` (add export)

**Interfaces:**
- Consumes: `removeFromTrackedBy()` from `functions/src/utils.ts`
- Produces: `removeShow` HTTPS Callable — `{ tmdbId: number }` → deletes tracking doc, removes from trackedBy, cleans up show if zero trackers. Does NOT delete watchedEpisodes/watchedMovies.

- [ ] **Step 1: Create removeShow.ts**

```typescript
// functions/src/removeShow.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { removeFromTrackedBy } from "./utils";

interface RemoveShowRequest {
  tmdbId: number;
}

export const removeShow = onCall(
  {
    maxInstances: 5,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { tmdbId } = request.data as RemoveShowRequest;
    if (!tmdbId) {
      throw new HttpsError("invalid-argument", "tmdbId required");
    }

    const db = getFirestore();
    const uid = request.auth.uid;
    const showId = String(tmdbId);

    // Remove user's tracking doc (keep watchedEpisodes + watchedMovies)
    const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);
    await trackingRef.delete();

    // Update stats
    const userRef = db.doc(`users/${uid}`);
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      const stats = userDoc.data()?.stats ?? {};
      const showsTracking = Math.max(0, (stats.showsTracking ?? 1) - 1);
      await userRef.update({ "stats.showsTracking": showsTracking });
    }

    // Remove from trackedBy, get remaining count
    const remainingCount = await removeFromTrackedBy(showId, uid);

    // If no one tracks it, delete the show doc + overflow subcollection
    if (remainingCount <= 0) {
      const showRef = db.doc(`shows/${showId}`);
      const overflowSnap = await showRef
        .collection("trackedByOverflow")
        .get();
      const batch = db.batch();
      for (const doc of overflowSnap.docs) {
        batch.delete(doc.ref);
      }
      batch.delete(showRef);
      await batch.commit();
    }

    return { success: true };
  }
);
```

- [ ] **Step 2: Update index.ts**

```typescript
// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { addShow } from "./addShow";
export { removeShow } from "./removeShow";
```

- [ ] **Step 3: Build and verify**

```bash
cd functions && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add functions/src/removeShow.ts functions/src/index.ts
git commit -m "feat: add removeShow cloud function"
```

---

### Task 4: importMatches Cloud Function + FCM

**Files:**
- Create: `functions/src/importMatches.ts`
- Modify: `functions/src/index.ts` (add export)

**Interfaces:**
- Consumes: `fetchShowFromTMDB()` from `tmdb.ts`, `addToTrackedBy()` from `utils.ts`
- Produces: `importMatches` HTTPS Callable — accepts array of matches, batch writes to Firestore, sends FCM push on completion

- [ ] **Step 1: Create importMatches.ts**

```typescript
// functions/src/importMatches.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { fetchShowFromTMDB, pooled } from "./tmdb";
import { addToTrackedBy } from "./utils";

const tmdbApiKey = defineSecret("TMDB_API_KEY");

interface ImportEpisode {
  season: number;
  episode: number;
  episodeTitle: string;
  watchedAt: string;
  runtime: number;
  watchCount: number;
}

interface ImportMatch {
  tmdbId: number;
  mediaType: "tv" | "movie";
  status: "watching" | "completed" | "plan_to_watch";
  watchedEpisodes?: ImportEpisode[];
  movieRuntime?: number;
  movieWatchedAt?: string;
}

interface ImportRequest {
  matches: ImportMatch[];
}

interface ImportStats {
  showsImported: number;
  moviesImported: number;
  episodesImported: number;
  minutesImported: number;
}

export const importMatches = onCall(
  {
    secrets: [tmdbApiKey],
    maxInstances: 5,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request): Promise<ImportStats> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { matches } = request.data as ImportRequest;
    if (!matches?.length) {
      throw new HttpsError("invalid-argument", "matches array required");
    }

    const db = getFirestore();
    const uid = request.auth.uid;
    const apiKey = tmdbApiKey.value();
    const stats: ImportStats = {
      showsImported: 0,
      moviesImported: 0,
      episodesImported: 0,
      minutesImported: 0,
    };

    // Fetch TMDB data for all matches and populate catalog
    const catalogTasks = matches.map(
      (m) => async () => {
        const showId = String(m.tmdbId);
        const showRef = db.doc(`shows/${showId}`);
        const showDoc = await showRef.get();

        if (!showDoc.exists) {
          const showData = await fetchShowFromTMDB(
            apiKey,
            m.tmdbId,
            m.mediaType
          );
          await showRef.set({
            ...showData,
            trackedBy: [uid],
            trackedByCount: 1,
            lastSyncedAt: FieldValue.serverTimestamp(),
          });
        } else {
          await addToTrackedBy(showId, uid);
        }

        return m;
      }
    );

    await pooled(catalogTasks, 5);

    // Batch write user tracking + watched data
    const batchOps: Array<() => Promise<void>> = [];
    let totalMinutes = 0;
    let totalEpisodes = 0;

    for (const match of matches) {
      const showId = String(match.tmdbId);
      const now = Timestamp.now();

      // Create tracking doc
      batchOps.push(async () => {
        const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);

        let nextEpisode: { season: number; episode: number } | null = null;
        let lastWatchedAt = now;

        if (match.mediaType === "tv" && match.watchedEpisodes?.length) {
          // Find the latest watched episode
          const sorted = [...match.watchedEpisodes].sort((a, b) => {
            if (a.season !== b.season) return b.season - a.season;
            return b.episode - a.episode;
          });
          const latest = sorted[0];

          // Next episode is one after the latest watched
          nextEpisode = {
            season: latest.season,
            episode: latest.episode + 1,
          };

          const latestDate = new Date(latest.watchedAt);
          if (!isNaN(latestDate.getTime())) {
            lastWatchedAt = Timestamp.fromDate(latestDate);
          }
        }

        if (match.mediaType === "movie" && match.movieWatchedAt) {
          const d = new Date(match.movieWatchedAt);
          if (!isNaN(d.getTime())) {
            lastWatchedAt = Timestamp.fromDate(d);
          }
        }

        await trackingRef.set({
          tmdbId: match.tmdbId,
          mediaType: match.mediaType,
          status: match.status,
          nextEpisode,
          rewatchCount: 0,
          addedAt: now,
          lastWatchedAt,
          priorityDate: lastWatchedAt,
        });
      });

      // Create watched episode docs
      if (match.mediaType === "tv" && match.watchedEpisodes) {
        // Batch in groups of 500
        const eps = match.watchedEpisodes;
        for (let i = 0; i < eps.length; i += 400) {
          const chunk = eps.slice(i, i + 400);
          batchOps.push(async () => {
            const batch = db.batch();
            for (const ep of chunk) {
              const epId = `${match.tmdbId}_S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;
              const epRef = db.doc(
                `users/${uid}/watchedEpisodes/${epId}`
              );
              batch.set(epRef, {
                tmdbShowId: match.tmdbId,
                season: ep.season,
                episode: ep.episode,
                episodeTitle: ep.episodeTitle,
                watchCount: ep.watchCount || 1,
                watchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
                lastWatchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
                runtime: ep.runtime || 0,
              });
            }
            await batch.commit();
          });
          totalEpisodes += chunk.length;
          totalMinutes += chunk.reduce((s, e) => s + (e.runtime || 0), 0);
        }
        stats.showsImported++;
      }

      // Create watched movie doc
      if (match.mediaType === "movie") {
        batchOps.push(async () => {
          const movieRef = db.doc(
            `users/${uid}/watchedMovies/${showId}`
          );
          await movieRef.set({
            tmdbId: match.tmdbId,
            watchCount: 1,
            watchedAt: match.movieWatchedAt
              ? Timestamp.fromDate(new Date(match.movieWatchedAt))
              : now,
            lastWatchedAt: match.movieWatchedAt
              ? Timestamp.fromDate(new Date(match.movieWatchedAt))
              : now,
            runtime: match.movieRuntime || 0,
          });
        });
        stats.moviesImported++;
        totalMinutes += Math.round((match.movieRuntime || 0) / 60);
      }
    }

    // Execute batch ops with concurrency limit
    await pooled(
      batchOps.map((op) => () => op()),
      10
    );

    stats.episodesImported = totalEpisodes;
    stats.minutesImported = totalMinutes;

    // Update user stats + mark import complete
    const userRef = db.doc(`users/${uid}`);
    await userRef.update({
      hasCompletedImport: true,
      "stats.showsTracking": FieldValue.increment(stats.showsImported),
      "stats.episodesWatched": FieldValue.increment(stats.episodesImported),
      "stats.moviesWatched": FieldValue.increment(stats.moviesImported),
      "stats.totalMinutes": FieldValue.increment(stats.minutesImported),
    });

    // Send FCM push notification
    try {
      const userDoc = await userRef.get();
      const fcmToken = userDoc.data()?.fcmToken;
      if (fcmToken) {
        await getMessaging().send({
          token: fcmToken,
          notification: {
            title: "Import Complete",
            body: `Imported ${stats.showsImported} shows, ${stats.moviesImported} movies, ${stats.episodesImported} episodes`,
          },
          data: {
            type: "import_complete",
            stats: JSON.stringify(stats),
          },
        });
      }
    } catch (e) {
      // FCM failure is non-fatal
      console.warn("FCM send failed:", e);
    }

    return stats;
  }
);
```

- [ ] **Step 2: Update index.ts**

```typescript
// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { addShow } from "./addShow";
export { removeShow } from "./removeShow";
export { importMatches } from "./importMatches";
```

- [ ] **Step 3: Build and verify**

```bash
cd functions && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add functions/src/importMatches.ts functions/src/index.ts
git commit -m "feat: add importMatches cloud function with FCM notification"
```

---

### Task 5: syncCatalog Cloud Function (Weekly Cron)

**Files:**
- Create: `functions/src/syncCatalog.ts`
- Modify: `functions/src/index.ts` (add export)

**Interfaces:**
- Consumes: `fetchShowFromTMDB()`, `pooled()` from `tmdb.ts`, `getAllTrackerUids()` from `utils.ts`
- Produces: `syncCatalog` scheduled function — refreshes all TV shows in catalog, reactivates completed users when new content found

- [ ] **Step 1: Create syncCatalog.ts**

```typescript
// functions/src/syncCatalog.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { fetchShowFromTMDB, pooled, CatalogShow } from "./tmdb";
import { getAllTrackerUids } from "./utils";

const tmdbApiKey = defineSecret("TMDB_API_KEY");

export const syncCatalog = onSchedule(
  {
    schedule: "0 3 * * 0", // Every Sunday 3:00 AM UTC
    secrets: [tmdbApiKey],
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
    retryCount: 1,
  },
  async () => {
    const db = getFirestore();
    const apiKey = tmdbApiKey.value();

    // Get all TV shows from catalog
    const showsSnap = await db
      .collection("shows")
      .where("mediaType", "==", "tv")
      .get();

    console.log(`Syncing ${showsSnap.size} TV shows`);

    const syncTasks = showsSnap.docs.map(
      (showDoc) => async () => {
        const oldData = showDoc.data() as CatalogShow & {
          trackedBy: string[];
          trackedByCount: number;
        };

        try {
          const freshData = await fetchShowFromTMDB(
            apiKey,
            oldData.tmdbId,
            "tv"
          );

          const oldEpCount = oldData.totalEpisodes ?? 0;
          const newEpCount = freshData.totalEpisodes ?? 0;
          const hasNewContent = newEpCount > oldEpCount;

          // Update catalog doc
          await showDoc.ref.update({
            title: freshData.title,
            posterPath: freshData.posterPath,
            backdropPath: freshData.backdropPath,
            overview: freshData.overview,
            status: freshData.status,
            totalSeasons: freshData.totalSeasons,
            totalEpisodes: freshData.totalEpisodes,
            runtime: freshData.runtime,
            voteAverage: freshData.voteAverage,
            seasons: freshData.seasons,
            lastSyncedAt: FieldValue.serverTimestamp(),
          });

          // If new content found, reactivate completed users
          if (hasNewContent) {
            console.log(
              `New content for ${freshData.title}: ${oldEpCount} → ${newEpCount} episodes`
            );
            await reactivateCompletedUsers(
              db,
              showDoc.id,
              freshData
            );
          }
        } catch (err) {
          console.error(
            `Failed to sync show ${oldData.tmdbId} (${oldData.title}):`,
            err
          );
        }
      }
    );

    // Process in batches of 50 to avoid TMDB rate limits
    for (let i = 0; i < syncTasks.length; i += 50) {
      const batch = syncTasks.slice(i, i + 50);
      await pooled(batch, 5);

      // Brief pause between batches to respect rate limits
      if (i + 50 < syncTasks.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log("Catalog sync complete");
  }
);

async function reactivateCompletedUsers(
  db: FirebaseFirestore.Firestore,
  showId: string,
  freshData: CatalogShow
): Promise<void> {
  const allUids = await getAllTrackerUids(showId);

  // Find the first new episode (first ep in the newest season not in old data)
  const lastSeason = freshData.seasons[freshData.seasons.length - 1];
  const firstNewEp = lastSeason?.episodes[0];

  if (!firstNewEp) return;

  const newAirDate = firstNewEp.airDate;
  const airDateTs = newAirDate
    ? Timestamp.fromDate(new Date(newAirDate))
    : Timestamp.now();

  for (const uid of allUids) {
    try {
      const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);
      const trackingDoc = await trackingRef.get();

      if (!trackingDoc.exists) continue;

      const status = trackingDoc.data()?.status;
      if (status !== "completed") continue;

      // Reactivate: set to watching with next episode pointing to new content
      await trackingRef.update({
        status: "watching",
        nextEpisode: {
          season: lastSeason.seasonNumber,
          episode: firstNewEp.episodeNumber,
        },
        priorityDate: airDateTs,
      });

      console.log(
        `Reactivated user ${uid} for show ${freshData.title} S${lastSeason.seasonNumber}E${firstNewEp.episodeNumber}`
      );
    } catch (err) {
      console.error(`Failed to reactivate user ${uid}:`, err);
    }
  }
}
```

- [ ] **Step 2: Update index.ts**

```typescript
// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { addShow } from "./addShow";
export { removeShow } from "./removeShow";
export { importMatches } from "./importMatches";
export { syncCatalog } from "./syncCatalog";
```

- [ ] **Step 3: Build and verify**

```bash
cd functions && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add functions/src/syncCatalog.ts functions/src/index.ts
git commit -m "feat: add syncCatalog weekly cron cloud function"
```

---

### Task 6: Update TypeScript Types + Auth Store

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/stores/authStore.ts`

**Interfaces:**
- Consumes: Nothing from prior tasks (client-side changes)
- Produces: Updated `WatchlistItem` → `TrackingItem`, new `CatalogShow`/`CatalogSeason`/`CatalogEpisode` types, new `WatchedMovie` type, updated `UserProfile`/`UserStats`, auth store with app-level TMDB key from `config/app`

- [ ] **Step 1: Update types/index.ts**

Read the current file, then replace with updated types. Key changes:
- Add `CatalogShow`, `CatalogSeason`, `CatalogEpisode` types
- Rename `WatchlistItem` → `TrackingItem` (keep `WatchlistItem` as alias for compatibility during migration)
- Add `WatchedMovie` type
- Update `UserProfile` (remove `tmdbApiKey`, add `hasCompletedImport`, `fcmToken`)
- Update `UserStats` (add `moviesWatched`)
- Update navigation params (remove `ApiKeySetup`)

```typescript
// New/changed types to add to app/src/types/index.ts:

// --- Catalog Types (shared show data from shows/ collection) ---

export interface CatalogEpisode {
  episodeNumber: number;
  title: string;
  airDate: string | null;
  runtime: number | null;
}

export interface CatalogSeason {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
  episodes: CatalogEpisode[];
}

export interface CatalogShow {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  status: string;
  totalSeasons: number;
  totalEpisodes: number;
  runtime: number | null;
  voteAverage: number;
  firstAirDate: string | null;
  releaseDate: string | null;
  seasons: CatalogSeason[];
  trackedBy: string[];
  trackedByCount: number;
  lastSyncedAt: any; // Firestore Timestamp
}

// --- Per-User Tracking (replaces WatchlistItem) ---

export interface TrackingItem {
  id: string; // Firestore doc ID = tmdbId
  tmdbId: number;
  mediaType: MediaType;
  status: WatchStatus;
  nextEpisode: { season: number; episode: number } | null;
  rewatchCount: number;
  addedAt: any; // Firestore Timestamp
  lastWatchedAt: any;
  priorityDate: any; // Firestore Timestamp — denormalized sort key
}

// Keep alias during transition
export type WatchlistItem = TrackingItem;

// --- Watched Movie ---

export interface WatchedMovie {
  id: string;
  tmdbId: number;
  watchCount: number;
  watchedAt: any;
  lastWatchedAt: any;
  runtime: number;
}

// --- Updated UserProfile ---
// Remove tmdbApiKey, add hasCompletedImport and fcmToken

export interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: any;
  stats: UserStats;
  hasCompletedImport: boolean;
  fcmToken?: string;
}

// --- Updated UserStats ---

export interface UserStats {
  episodesWatched: number;
  showsTracking: number;
  moviesWatched: number;
  totalMinutes: number;
}

// --- Updated Navigation ---
// Remove ApiKeySetup from RootStackParamList

export type RootStackParamList = {
  Login: undefined;
  ImportData: undefined;
  Main: undefined;
};
```

- [ ] **Step 2: Update authStore.ts**

Key changes:
- Remove `tmdbApiKey`, `tmdbApiKeyLoading`, `loadTmdbApiKey()`, `saveTmdbApiKey()`
- Add `appTmdbApiKey: string | null` — loaded from `config/app` doc
- Add `loadAppConfig()` — reads Firestore `config/app` once on auth
- Remove `hasSeenImport` → use `hasCompletedImport` from user doc

```typescript
// Key changes to app/src/stores/authStore.ts:
// Read the full file first, then apply these changes:

// 1. Replace tmdbApiKey state with:
//    appTmdbApiKey: string | null
//    appTmdbApiKeyLoading: boolean
//    hasCompletedImport: boolean

// 2. Replace loadTmdbApiKey with:
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
} from "@react-native-firebase/firestore";

// loadAppConfig: async () => {
//   const db = getFirestore();
//   const configDoc = await getDoc(doc(db, "config", "app"));
//   if (configDoc.exists()) {
//     set({ appTmdbApiKey: configDoc.data()?.tmdbApiKey ?? null });
//   }
//   set({ appTmdbApiKeyLoading: false });
// }

// 3. Replace saveTmdbApiKey → remove entirely

// 4. Add loadUserFlags to check hasCompletedImport:
// loadUserFlags: async (userId: string) => {
//   const db = getFirestore();
//   const userDoc = await getDoc(doc(db, "users", userId));
//   if (userDoc.exists()) {
//     set({ hasCompletedImport: userDoc.data()?.hasCompletedImport ?? false });
//   }
// }

// 5. On setUser: call loadAppConfig() + loadUserFlags(uid)
```

The implementer should read the current `authStore.ts` fully and refactor accordingly, keeping the Google/email sign-in logic intact.

- [ ] **Step 3: Verify app compiles**

```bash
cd app && npx expo start --no-dev --minify 2>&1 | head -20
```

Note: There will be import errors from screens/hooks that still reference old types. That's expected — they'll be fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add app/src/types/index.ts app/src/stores/authStore.ts
git commit -m "feat: update types and auth store for shared catalog model"
```

---

### Task 7: Refactor Firestore Service

**Files:**
- Modify: `app/src/services/firestore.ts`

**Interfaces:**
- Consumes: `TrackingItem`, `WatchedMovie`, `CatalogShow` from types
- Produces: Updated CRUD functions using `tracking/` instead of `watchlist/`, new `markMovieWatched` (with `watchedMovies/`), updated `markEpisodeWatched` (with `priorityDate`), new `getCatalogShow()`, `getTracking()`. Removes all `episodeCache` functions.

- [ ] **Step 1: Read current firestore.ts and refactor**

Key changes to apply:

```typescript
// 1. Collection references — replace watchlist with tracking:
// Old: collection(db, "users", userId, "watchlist")
// New: collection(db, "users", userId, "tracking")

// 2. Remove all episodeCache functions:
// Delete: getCachedSeason(), setCachedSeason(), CACHE_TTL

// 3. getCatalogShow — read from shared catalog:
export async function getCatalogShow(
  tmdbId: number
): Promise<CatalogShow | null> {
  const db = getFirestore();
  const showDoc = await getDoc(doc(db, "shows", String(tmdbId)));
  if (!showDoc.exists()) return null;
  return { id: showDoc.id, ...showDoc.data() } as CatalogShow;
}

// 4. Update addToWatchlist → addToTracking:
// - No longer stores title, posterPath in tracking doc
// - Adds priorityDate field
// - Calls addShow CF instead of creating catalog entry
export async function addToTracking(
  userId: string,
  tmdbId: number,
  mediaType: "tv" | "movie"
): Promise<void> {
  const db = getFirestore();
  const trackingRef = doc(db, "users", userId, "tracking", String(tmdbId));
  const now = serverTimestamp();

  // Call addShow CF (handles catalog population)
  const { getFunctions, httpsCallable } = require("@react-native-firebase/functions");
  const functions = getFunctions();
  await httpsCallable(functions, "addShow")({ tmdbId, mediaType });

  // Create local tracking doc
  await setDoc(trackingRef, {
    tmdbId,
    mediaType,
    status: "watching" as WatchStatus,
    nextEpisode: mediaType === "tv" ? { season: 1, episode: 1 } : null,
    rewatchCount: 0,
    addedAt: now,
    lastWatchedAt: now,
    priorityDate: now,
  });

  // Update user stats
  const userRef = doc(db, "users", userId);
  const batch = writeBatch(db);
  batch.update(userRef, {
    "stats.showsTracking": increment(1),
  });
  await batch.commit();
}

// 5. Update removeFromWatchlist → removeFromTracking:
export async function removeFromTracking(
  userId: string,
  tmdbId: number
): Promise<void> {
  // Call removeShow CF (handles trackedBy + cleanup)
  const { getFunctions, httpsCallable } = require("@react-native-firebase/functions");
  const functions = getFunctions();
  await httpsCallable(functions, "removeShow")({ tmdbId });
  // CF handles tracking doc deletion + stats update
}

// 6. Update markEpisodeWatched — add priorityDate:
// In the batch that updates tracking doc, also set:
//   priorityDate: serverTimestamp()
// (lastWatchedAt and priorityDate both update to now)

// 7. Add markMovieWatched with watchedMovies collection:
export async function markMovieWatched(
  userId: string,
  tmdbId: number,
  runtime: number
): Promise<void> {
  const db = getFirestore();
  const batch = writeBatch(db);
  const movieRef = doc(db, "users", userId, "watchedMovies", String(tmdbId));
  const trackingRef = doc(db, "users", userId, "tracking", String(tmdbId));
  const userRef = doc(db, "users", userId);
  const now = serverTimestamp();

  // Check if already watched (for rewatch)
  const movieDoc = await getDoc(movieRef);
  if (movieDoc.exists()) {
    batch.update(movieRef, {
      watchCount: increment(1),
      lastWatchedAt: now,
    });
  } else {
    batch.set(movieRef, {
      tmdbId,
      watchCount: 1,
      watchedAt: now,
      lastWatchedAt: now,
      runtime: runtime || 0,
    });
  }

  batch.update(trackingRef, {
    status: "completed",
    lastWatchedAt: now,
    priorityDate: now,
  });

  batch.update(userRef, {
    "stats.moviesWatched": increment(1),
    "stats.totalMinutes": increment(Math.round(runtime / 60)),
  });

  await batch.commit();
}

// 8. Update stopWatching — same logic, uses tracking/ path

// 9. Update startRewatch, resumeRewatch — use tracking/ path
```

The implementer should read the full current `firestore.ts`, understand every function, and apply the refactor systematically. Key principle: every function that referenced `watchlist` subcollection now references `tracking`.

- [ ] **Step 2: Verify build compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | head -30
```

Expect some errors from hooks/screens not yet updated — that's fine for this task.

- [ ] **Step 3: Commit**

```bash
git add app/src/services/firestore.ts
git commit -m "refactor: update firestore service for shared catalog + tracking model"
```

---

### Task 8: Refactor Hooks

**Files:**
- Modify: `app/src/hooks/useWatchlist.ts` (rename logic to useTracking)
- Modify: `app/src/hooks/useShowDetails.ts`
- Modify: `app/src/hooks/useCalendarEpisodes.ts`
- Modify: `app/src/hooks/useUpcomingEpisodes.ts`
- Modify: `app/src/hooks/useSeasonDetails.ts`
- Modify: `app/src/hooks/useSearch.ts`
- Modify: `app/src/hooks/useUserStats.ts`
- Modify: `app/src/hooks/useWatchedEpisodes.ts`
- Create: `app/src/hooks/useWatchedMovies.ts`
- Modify: `app/src/hooks/useTrending.ts`

**Interfaces:**
- Consumes: Updated types (`TrackingItem`, `CatalogShow`), updated `firestore.ts`, `authStore` (appTmdbApiKey)
- Produces: All hooks updated to use new data model — `useWatchlist` reads from `tracking/` + joins `shows/`, `useShowDetails` checks catalog first, `useCalendarEpisodes` reads from catalog, `useSearch`/`useTrending` use `appTmdbApiKey`

- [ ] **Step 1: Update useWatchlist.ts**

Read the current file. Change:
- Firestore path from `users/${userId}/watchlist` → `users/${userId}/tracking`
- `TrackingItem` has no `title`/`posterPath` — need to join with `shows/` catalog
- Add catalog data join using `getDoc` for each tracked show's `shows/{tmdbId}`

```typescript
// Key changes to useWatchlist.ts:
// The hook should return items enriched with catalog data.

// Define enriched type:
interface EnrichedTrackingItem extends TrackingItem {
  title: string;
  posterPath: string | null;
  totalEpisodes: number;
  catalogShow: CatalogShow | null;
}

// In the onSnapshot listener:
// 1. Map tracking docs to TrackingItem[]
// 2. For each item, read shows/{tmdbId} from cache or Firestore
// 3. Merge title/posterPath from catalog into the enriched item

// Use React Query for catalog reads (auto-cached):
// const showDoc = await getDoc(doc(db, "shows", String(item.tmdbId)));

// Return: { items: EnrichedTrackingItem[], loading: boolean }
```

- [ ] **Step 2: Update useShowDetails.ts**

```typescript
// Key changes:
// 1. Check shows/{tmdbId} catalog first
// 2. If exists → return catalog data (no TMDB call needed)
// 3. If not in catalog → fall back to TMDB API call using appTmdbApiKey
// 4. Replace apiKey from authStore.tmdbApiKey → authStore.appTmdbApiKey

// queryFn: async () => {
//   // Try catalog first
//   const catalogShow = await getCatalogShow(tmdbId);
//   if (catalogShow) return catalogShowToTMDBShow(catalogShow);
//   // Fallback to TMDB
//   const apiKey = useAuthStore.getState().appTmdbApiKey;
//   return getShowDetails(apiKey!, tmdbId, mediaType);
// }
```

- [ ] **Step 3: Update useCalendarEpisodes.ts**

```typescript
// Key changes:
// 1. Remove all TMDB API calls — read from shows/ catalog
// 2. Remove Firebase episodeCache dependency
// 3. For each tracked show, read shows/{tmdbId} → extract episodes from seasons array
// 4. Filter by airDate matching viewed month

// The hook now:
// - Takes tracking items (not watchlist items)
// - For each tracked TV show, reads shows/{tmdbId}
// - Flattens seasons[].episodes[] into UpcomingEpisode[]
// - No loadMonthEpisodes needed — all data is already in catalog
```

- [ ] **Step 4: Update useUpcomingEpisodes.ts**

```typescript
// Key changes:
// 1. Read from shows/ catalog instead of TMDB API
// 2. For each tracked TV show, get CatalogShow
// 3. Extract episodes from seasons array where airDate >= today
// 4. No TMDB API calls needed
```

- [ ] **Step 5: Update useSearch.ts and useTrending.ts**

```typescript
// Both hooks: replace authStore.tmdbApiKey → authStore.appTmdbApiKey
// Same TMDB API calls, just different key source

// useSearch.ts:
// const apiKey = useAuthStore((s) => s.appTmdbApiKey);

// useTrending.ts:
// const apiKey = useAuthStore((s) => s.appTmdbApiKey);
```

- [ ] **Step 6: Update useSeasonDetails.ts**

```typescript
// Key changes:
// 1. Check catalog first — if show in shows/ collection, read season from inline data
// 2. Fallback to TMDB API for untracked shows
// 3. Replace apiKey source
```

- [ ] **Step 7: Create useWatchedMovies.ts**

```typescript
// app/src/hooks/useWatchedMovies.ts
import { useState, useEffect } from "react";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
} from "@react-native-firebase/firestore";
import { WatchedMovie } from "../types";

export function useWatchedMovies(userId?: string) {
  const [movies, setMovies] = useState<WatchedMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const q = query(
      collection(db, "users", userId, "watchedMovies"),
      orderBy("lastWatchedAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as WatchedMovie[];
      setMovies(items);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  return { movies, loading };
}
```

- [ ] **Step 8: Update useUserStats.ts**

```typescript
// Add moviesWatched to the stats interface if not already present
// The hook reads from users/{uid} doc — stats shape now includes moviesWatched
```

- [ ] **Step 9: Commit**

```bash
git add app/src/hooks/
git commit -m "refactor: update all hooks for shared catalog + tracking model"
```

---

### Task 9: Watchlist Visibility + Sort Logic

**Files:**
- Create: `app/src/hooks/useVisibleTracking.ts`

**Interfaces:**
- Consumes: `useWatchlist()` (enriched tracking items), `useWatchedEpisodes()`, `CatalogShow`
- Produces: `useVisibleTracking()` — filters and sorts tracking items per visibility rules + priorityDate sort

- [ ] **Step 1: Create useVisibleTracking.ts**

```typescript
// app/src/hooks/useVisibleTracking.ts
import { useMemo } from "react";
import { CatalogShow, TrackingItem } from "../types";

interface EnrichedTrackingItem extends TrackingItem {
  title: string;
  posterPath: string | null;
  totalEpisodes: number;
  catalogShow: CatalogShow | null;
}

interface VisibleTrackingResult {
  items: EnrichedTrackingItem[];
  loading: boolean;
}

/**
 * Determines if a show should be visible in the "Currently Watching" list.
 *
 * Visible when:
 * - status is watching/rewatching/plan_to_watch
 * - AND has unwatched episodes that have already aired
 *
 * Hidden when:
 * - All aired eps watched + next ep not yet aired
 * - All aired eps watched + show ended (no more eps)
 * - status is completed
 */
export function isShowVisible(
  item: EnrichedTrackingItem,
  watchedEpisodeCount: number
): boolean {
  const activeStatuses = ["watching", "rewatching", "plan_to_watch"];
  if (!activeStatuses.includes(item.status)) return false;

  // plan_to_watch with no watched eps — always visible
  if (item.status === "plan_to_watch" && watchedEpisodeCount === 0) {
    return true;
  }

  const catalog = item.catalogShow;
  if (!catalog || catalog.mediaType === "movie") return true;

  // Count aired episodes
  const today = new Date().toISOString().split("T")[0];
  let airedEpCount = 0;
  for (const season of catalog.seasons) {
    for (const ep of season.episodes) {
      if (ep.airDate && ep.airDate <= today) {
        airedEpCount++;
      }
    }
  }

  // If all aired eps are watched, check if there's upcoming content
  if (watchedEpisodeCount >= airedEpCount) {
    // Check if any future episode exists
    let hasFutureEp = false;
    for (const season of catalog.seasons) {
      for (const ep of season.episodes) {
        if (ep.airDate && ep.airDate > today) {
          hasFutureEp = true;
          break;
        }
      }
      if (hasFutureEp) break;
    }

    // All caught up — hide regardless of future eps
    return false;
  }

  // Has unwatched aired episodes — visible
  return true;
}

/**
 * Sort by priorityDate descending.
 * Items are already sorted by Firestore query if using orderBy,
 * but this handles client-side re-sort after visibility filtering.
 */
export function sortByPriority(
  items: EnrichedTrackingItem[]
): EnrichedTrackingItem[] {
  return [...items].sort((a, b) => {
    const aDate = a.priorityDate?.toMillis?.() ?? 0;
    const bDate = b.priorityDate?.toMillis?.() ?? 0;
    return bDate - aDate;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/hooks/useVisibleTracking.ts
git commit -m "feat: add watchlist visibility rules and priority sort"
```

---

### Task 10: Update Screens

**Files:**
- Modify: `app/src/screens/WatchlistTab.tsx`
- Modify: `app/src/screens/ShowDetailScreen.tsx`
- Modify: `app/src/screens/CalendarScreen.tsx`
- Modify: `app/src/screens/SearchScreen.tsx`
- Modify: `app/src/screens/UpcomingTab.tsx`
- Modify: `app/src/screens/ProfileScreen.tsx`
- Modify: `app/src/components/SeasonDropdown.tsx`
- Modify: `app/src/components/ShowCard.tsx`
- Delete: `app/src/screens/ApiKeySetupScreen.tsx`

**Interfaces:**
- Consumes: All updated hooks and services from Tasks 6-9
- Produces: All screens using new data model — no TMDB API key refs, tracking/ instead of watchlist/, visibility filtering, catalog reads

- [ ] **Step 1: Update WatchlistTab.tsx**

Read the current file. Key changes:
- Import `isShowVisible`, `sortByPriority` from `useVisibleTracking`
- Filter "Currently Watching" items through `isShowVisible()`
- Need `watchedEpisodeCount` per show — query `watchedEpisodes` where `tmdbShowId == X` and count
- Sort visible items by `sortByPriority()`
- Show metadata (title, poster) now comes from enriched tracking items
- `handleMarkWatched` → read next episode from catalog `seasons` array instead of TMDB API
- Remove all `tmdbApiKey` references
- `addToWatchlist` → `addToTracking`, `removeFromWatchlist` → `removeFromTracking`

- [ ] **Step 2: Update ShowDetailScreen.tsx**

Read the current file. Key changes:
- `useShowDetails` now returns catalog data first, TMDB fallback
- Season data comes from `catalogShow.seasons` inline — no per-season TMDB fetches
- `addToWatchlist` → `addToTracking`
- `removeFromWatchlist` → `removeFromTracking`
- `markMovieWatched` → updated version using `watchedMovies/`
- Remove `apiKey` references

- [ ] **Step 3: Update SeasonDropdown.tsx**

Read the current file. Key changes:
- Season episode data comes from `CatalogSeason.episodes` (passed as prop from ShowDetail)
- No more `useSeasonDetails` TMDB call for tracked shows
- For untracked shows (browsing), still use TMDB API via `useSeasonDetails`
- `markEpisodeWatched` → uses updated function from firestore.ts
- Next episode calculation reads from catalog seasons array

- [ ] **Step 4: Update CalendarScreen.tsx**

Read the current file. Key changes:
- `useCalendarEpisodes` now reads from catalog — episodes already available
- No more `loadMonthEpisodes` with TMDB API calls
- Remove `apiKey` references
- Episode data shape may differ — adapt to `CatalogEpisode` → `UpcomingEpisode` mapping

- [ ] **Step 5: Update SearchScreen.tsx**

Read the current file. Key changes:
- `useSearch` and `useTrending` now use `appTmdbApiKey`
- "Add to watchlist" action → calls `addToTracking` (which calls `addShow` CF)
- Remove per-user API key checks

- [ ] **Step 6: Update UpcomingTab.tsx**

Read the current file. Key changes:
- `useUpcomingEpisodes` now reads from catalog
- Remove `apiKey` references
- Filter logic same (today + future airDate)

- [ ] **Step 7: Update ProfileScreen.tsx**

Read the current file. Key changes:
- Stats display adds `moviesWatched`
- Remove "API Key" section if shown
- Add "Import from TV Time" button (links to ImportData screen) — always visible in settings

- [ ] **Step 8: Update ShowCard.tsx**

Read the current file. Key changes:
- Props now receive `TrackingItem` (enriched with title/poster from catalog)
- Remaining episodes calculation: `catalogShow.totalEpisodes - watchedCount`
- Interface changes for any removed props (title/posterPath now from enriched item)

- [ ] **Step 9: Delete ApiKeySetupScreen.tsx**

```bash
rm app/src/screens/ApiKeySetupScreen.tsx
```

- [ ] **Step 10: Commit**

```bash
git add app/src/screens/ app/src/components/SeasonDropdown.tsx app/src/components/ShowCard.tsx
git commit -m "refactor: update all screens for shared catalog model"
```

---

### Task 11: Onboarding + Navigation + Import Flow + FCM

**Files:**
- Modify: `app/App.tsx`
- Modify: `app/src/navigation/` (all navigation files)
- Modify: `app/src/screens/ImportDataScreen/index.tsx`
- Modify: `app/src/screens/ImportDataScreen/ReviewPhase.tsx`
- Modify: `app/src/services/tvtimeImport.ts`

**Interfaces:**
- Consumes: Updated auth store (`hasCompletedImport`, `appTmdbApiKey`), `importMatches` CF
- Produces: New onboarding flow (sign-in → import or skip → app), import sends final matches to CF, FCM token registration, blocking loader during import

- [ ] **Step 1: Update App.tsx auth gate**

Read the current file. Key changes:
- Remove `ApiKeySetupScreen` from the flow
- Replace API key check with `hasCompletedImport` check:

```typescript
// Old flow:
// !user → LoginScreen
// !tmdbApiKey → ApiKeySetupScreen
// !hasSeenImport → ImportDataScreen
// else → AppNavigator

// New flow:
// !user → LoginScreen
// !hasCompletedImport → ImportDataScreen (with skip option)
// else → AppNavigator
```

- Add FCM token registration on auth:

```typescript
import messaging from "@react-native-firebase/messaging";

// After user signs in:
async function registerFCMToken(userId: string) {
  const token = await messaging().getToken();
  const db = getFirestore();
  await updateDoc(doc(db, "users", userId), { fcmToken: token });
}
```

- Request notification permissions on app start:

```typescript
await messaging().requestPermission();
```

- [ ] **Step 2: Update navigation**

Read the navigation files. Key changes:
- Remove `ApiKeySetup` route from `RootStackParamList`
- Remove `ApiKeySetupScreen` import
- Add `ImportData` route to `ProfileStackParamList` (for settings access)

- [ ] **Step 3: Update ImportDataScreen/index.tsx**

Read the current file. Key changes after the review/disambiguation phases:
- Instead of calling `importToFirestore()` client-side, call `importMatches` CF
- Show blocking `LoadingSpinner` while CF processes
- Listen for CF response or FCM notification for completion
- On completion → show DonePhase with stats

```typescript
// After user confirms matches in ReviewPhase:
const handleImport = async (selectedMatches: TMDBMatch[]) => {
  setPhase("importing");

  const { getFunctions, httpsCallable } = require("@react-native-firebase/functions");
  const functions = getFunctions();
  const importFn = httpsCallable(functions, "importMatches");

  // Transform matches to CF format
  const cfMatches = selectedMatches.map((m) => ({
    tmdbId: m.tmdbId,
    mediaType: m.mediaType,
    status: determineStatus(m), // watching/completed/plan_to_watch
    watchedEpisodes: getWatchedEpisodesForShow(m),
    movieRuntime: m.mediaType === "movie" ? m.runtime : undefined,
    movieWatchedAt: m.mediaType === "movie" ? m.watchedAt : undefined,
  }));

  try {
    const result = await importFn({ matches: cfMatches });
    setImportStats(result.data);
    setPhase("done");
  } catch (err) {
    Alert.alert("Import Failed", String(err));
    setPhase("review");
  }
};
```

- [ ] **Step 4: Update tvtimeImport.ts**

Read the current file. Key changes:
- `matchShowsAndMovies` now uses `appTmdbApiKey` instead of per-user key
- Remove `importToFirestore` function — import is now handled by CF
- Keep `parseGdprZip` and `matchShowsAndMovies` (client-side disambiguation stays)

- [ ] **Step 5: Add FCM dependency to app**

Check if `@react-native-firebase/messaging` is already installed:

```bash
cd app && cat package.json | grep messaging
```

If not installed:

```bash
cd app && npm install @react-native-firebase/messaging
```

Add to Expo plugins in `app.json`:

```json
"plugins": [
  "@react-native-firebase/app",
  "@react-native-firebase/auth",
  "@react-native-firebase/messaging",
  // ... rest
]
```

- [ ] **Step 6: Commit**

```bash
git add app/App.tsx app/src/navigation/ app/src/screens/ImportDataScreen/ app/src/services/tvtimeImport.ts app/package.json app/app.json
git commit -m "feat: update onboarding flow, import via CF, FCM registration"
```

---

### Task 12: Deploy + Manual Setup + End-to-End Test

**Files:**
- No new files — deployment and configuration steps

**Interfaces:**
- Consumes: All prior tasks
- Produces: Deployed Cloud Functions, configured budget alerts, working app

- [ ] **Step 1: Set TMDB API key in Secret Manager**

```bash
firebase functions:secrets:set TMDB_API_KEY
# Paste your TMDB API key when prompted
```

- [ ] **Step 2: Set TMDB API key in Firestore config/app doc**

```bash
# Use Firebase console or CLI:
# Firestore → config/app → set tmdbApiKey: "your_key_here"
```

Or via Node.js script:

```bash
node -e "
const admin = require('firebase-admin');
admin.initializeApp();
admin.firestore().doc('config/app').set({ tmdbApiKey: 'YOUR_KEY_HERE' });
"
```

- [ ] **Step 3: Deploy Firestore rules + indexes**

```bash
firebase deploy --only firestore
```

- [ ] **Step 4: Deploy Cloud Functions**

```bash
firebase deploy --only functions
```

- [ ] **Step 5: Set up budget alerts**

In Firebase console → Settings → Usage and billing:
1. Upgrade to Blaze plan
2. Set budget alerts at $5, $10, $25
3. Enable email notifications

Or via gcloud CLI:

```bash
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT \
  --display-name="TV Time Returns Budget" \
  --budget-amount=25 \
  --threshold-rules=percent=0.2,basis=CURRENT_SPEND \
  --threshold-rules=percent=0.4,basis=CURRENT_SPEND \
  --threshold-rules=percent=1.0,basis=CURRENT_SPEND
```

- [ ] **Step 6: Clear existing user data**

In Firebase console → Firestore, delete:
- All docs in `users/{uid}/watchlist/`
- All docs in `users/{uid}/watchedEpisodes/`
- All docs in `users/{uid}/episodeCache/`
- Reset `users/{uid}.stats` to zeros

- [ ] **Step 7: Rebuild app**

```bash
cd app && npx expo prebuild --clean
# Copy google-services.json back if needed:
cp app/google-services.json android/app/google-services.json
```

- [ ] **Step 8: End-to-end test checklist**

Run the app on emulator/device and verify:
- [ ] Sign in works (no API key setup screen)
- [ ] Import screen shows (or skip)
- [ ] Search works (uses app-level TMDB key)
- [ ] Add show from search → calls addShow CF → appears in watchlist
- [ ] Show detail loads from catalog (fast, no TMDB delay)
- [ ] Season dropdown shows episodes from catalog
- [ ] Mark episode watched → tracking doc updates
- [ ] Completed show disappears from watchlist
- [ ] Calendar shows episodes from catalog
- [ ] Remove show → calls removeShow CF → disappears from tracking but watchedEpisodes preserved
- [ ] Re-add same show → progress restored
- [ ] Profile shows updated stats (including moviesWatched)
- [ ] Settings has "Import from TV Time" button

- [ ] **Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end testing fixes"
```

---

## Dependency Graph

```
Task 1 (Infrastructure)
  ├→ Task 2 (addShow CF)
  ├→ Task 3 (removeShow CF)
  ├→ Task 4 (importMatches CF)
  └→ Task 5 (syncCatalog CF)

Task 6 (Types + Auth Store) ─→ Task 7 (Firestore Service) ─→ Task 8 (Hooks)
                                                                    │
Task 9 (Visibility Logic) ←────────────────────────────────────────┘
       │
       └→ Task 10 (Screens) ─→ Task 11 (Onboarding + Import + FCM)
                                        │
                                        └→ Task 12 (Deploy + Test)
```

**Parallel tracks:**
- Tasks 1-5 (Cloud Functions) can be done in parallel with Tasks 6-9 (client refactor)
- Tasks 2-5 can be done in parallel with each other (all depend only on Task 1)
- Task 10 depends on Tasks 8 + 9
- Task 11 depends on Task 10
- Task 12 depends on everything
