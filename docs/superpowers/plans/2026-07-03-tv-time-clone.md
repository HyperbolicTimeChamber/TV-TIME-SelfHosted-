# TV Time Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted TV Time clone with show/movie tracking, calendar, search, and rewatch support.

**Architecture:** Expo React Native app (dark mode, TypeScript) with Firebase backend. Cloud Functions proxy all TMDB API calls with Firestore caching. Firestore stores user data with real-time listeners. Zustand for client state, TanStack React Query for server state.

**Tech Stack:** Expo SDK, TypeScript, React Navigation, Reanimated 3, Gesture Handler, Zustand, TanStack React Query, Firebase (Auth, Firestore, Functions), TMDB API v3

## Global Constraints

- TypeScript strict mode in both app and functions
- Expo managed workflow with dev build (expo-dev-client) for native modules
- Firebase Functions v2 (2nd gen), Node 18+
- All TMDB calls server-side only — API key never on client
- Dark mode only — no light theme
- All Firestore writes require authenticated user
- No optimistic writes — wait for network confirmation

---

## File Structure

```
TV-TIME-SelfHosted-/
├── app/
│   ├── App.tsx                          # Root: providers, auth gate
│   ├── app.json                         # Expo config
│   ├── package.json
│   ├── tsconfig.json
│   ├── babel.config.js
│   └── src/
│       ├── types/
│       │   └── index.ts                 # All shared TypeScript types
│       ├── theme/
│       │   └── index.ts                 # Colors, spacing, typography
│       ├── config/
│       │   └── firebase.ts              # Firebase app init
│       ├── stores/
│       │   ├── authStore.ts             # Auth state + actions
│       │   └── uiStore.ts              # UI state (connectivity, etc)
│       ├── services/
│       │   ├── functions.ts             # Firebase callable function wrappers
│       │   └── firestore.ts             # Firestore read/write helpers
│       ├── hooks/
│       │   ├── useWatchlist.ts           # Real-time watchlist listener
│       │   ├── useWatchedEpisodes.ts     # Real-time watched eps listener
│       │   ├── useUserStats.ts           # Real-time user stats listener
│       │   ├── useSearch.ts              # React Query: TMDB search
│       │   ├── useTrending.ts            # React Query: trending
│       │   ├── useShowDetails.ts         # React Query: show details
│       │   ├── useSeasonDetails.ts       # React Query: season details
│       │   └── useUpcomingEpisodes.ts    # React Query: upcoming eps
│       ├── components/
│       │   ├── SwipeableCard.tsx          # Reusable swipe card w/ green/blue bg
│       │   ├── ShowCard.tsx              # Show poster + info card
│       │   ├── EpisodeCard.tsx           # Episode row card
│       │   ├── OfflineOverlay.tsx        # No-internet overlay
│       │   └── LoadingSpinner.tsx        # Shared loading indicator
│       ├── screens/
│       │   ├── LoginScreen.tsx
│       │   ├── HomeScreen.tsx            # Top tabs container
│       │   ├── WatchlistTab.tsx          # Watchlist FlatList
│       │   ├── UpcomingTab.tsx           # Upcoming FlatList
│       │   ├── SearchScreen.tsx          # Trending + search
│       │   ├── CalendarScreen.tsx        # Monthly calendar
│       │   ├── ProfileScreen.tsx         # Stats + sign out
│       │   ├── ShowDetailScreen.tsx      # Show info + seasons
│       │   └── SeasonDetailScreen.tsx    # Episode list
│       └── navigation/
│           └── AppNavigator.tsx          # All nav config
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                     # Export all functions
│       ├── tmdb/
│       │   ├── client.ts                # Axios TMDB client
│       │   ├── cache.ts                 # Firestore cache helpers
│       │   ├── searchMulti.ts
│       │   ├── getTrending.ts
│       │   ├── getShowDetails.ts
│       │   ├── getSeasonDetails.ts
│       │   └── getUpcomingEpisodes.ts
│       └── triggers/
│           ├── onUserCreate.ts
│           ├── onEpisodeWatched.ts
│           └── onWatchlistChange.ts
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── .firebaserc
└── package.json
```

---

### Task 1: Project Scaffolding & Foundation

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/babel.config.js`, `app/app.json`, `app/App.tsx`
- Create: `app/src/types/index.ts`, `app/src/theme/index.ts`, `app/src/config/firebase.ts`
- Create: `functions/package.json`, `functions/tsconfig.json`, `functions/src/index.ts`
- Create: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc`, `package.json`, `.env.example`

**Interfaces:**
- Produces: All TypeScript types used across the app, theme constants, Firebase app instance

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "tv-time-selfhosted",
  "private": true,
  "scripts": {
    "app:start": "cd app && npx expo start --dev-client",
    "app:android": "cd app && npx expo run:android",
    "app:ios": "cd app && npx expo run:ios",
    "functions:build": "cd functions && npm run build",
    "functions:serve": "cd functions && npm run serve",
    "functions:deploy": "cd functions && npm run deploy"
  }
}
```

- [ ] **Step 2: Create .env.example**

```
# Firebase (app/google-services.json and app/GoogleService-Info.plist handle this)
# Functions environment — set via: firebase functions:config:set tmdb.api_key="YOUR_KEY"
TMDB_API_KEY=your_tmdb_api_key_here
```

- [ ] **Step 3: Initialize Expo app**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-
npx create-expo-app@latest app --template blank-typescript
```

- [ ] **Step 4: Install app dependencies**

```bash
cd app
npx expo install expo-dev-client \
  @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore \
  @react-native-google-signin/google-signin \
  @react-navigation/native @react-navigation/bottom-tabs @react-navigation/material-top-tabs @react-navigation/native-stack \
  react-native-screens react-native-safe-area-context react-native-pager-view \
  react-native-gesture-handler react-native-reanimated \
  @react-native-community/netinfo \
  expo-image \
  zustand \
  @tanstack/react-query
```

- [ ] **Step 5: Update app/babel.config.js for Reanimated**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-reanimated/plugin"],
  };
};
```

- [ ] **Step 6: Create app/src/types/index.ts**

```ts
import { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

export type WatchStatus =
  | "watching"
  | "plan_to_watch"
  | "completed"
  | "rewatching"
  | "paused_rewatch";

export type MediaType = "tv" | "movie";

export interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  stats: UserStats;
}

export interface UserStats {
  episodesWatched: number;
  showsTracking: number;
  totalMinutes: number;
}

export interface WatchlistItem {
  id: string; // Firestore doc ID = tmdbId as string
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string;
  addedAt: FirebaseFirestoreTypes.Timestamp;
  lastWatchedAt: FirebaseFirestoreTypes.Timestamp | null;
  status: WatchStatus;
  nextEpisode: { season: number; episode: number } | null;
  rewatchCount: number;
}

export interface WatchedEpisode {
  id: string; // Firestore doc ID = tmdbShowId_SxxExx
  tmdbShowId: number;
  season: number;
  episode: number;
  episodeTitle: string;
  watchedAt: FirebaseFirestoreTypes.Timestamp;
  lastWatchedAt: FirebaseFirestoreTypes.Timestamp;
  runtime: number;
  watchCount: number;
}

export interface TMDBShow {
  id: number;
  name?: string; // TV shows
  title?: string; // Movies
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  first_air_date?: string;
  release_date?: string;
  media_type?: MediaType;
  genre_ids: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  seasons?: TMDBSeason[];
}

export interface TMDBSeason {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
}

export interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
}

export interface UpcomingEpisode {
  tmdbShowId: number;
  showTitle: string;
  posterPath: string | null;
  season: number;
  episode: number;
  episodeTitle: string;
  airDate: string;
  runtime: number | null;
}

// Navigation param types
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Calendar: undefined;
  Profile: undefined;
};

export type HomeTopTabParamList = {
  Watchlist: undefined;
  Upcoming: undefined;
};

export type HomeStackParamList = {
  HomeTabs: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
  SeasonDetail: { tmdbId: number; seasonNumber: number; showTitle: string };
};

export type SearchStackParamList = {
  SearchMain: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
};

export type CalendarStackParamList = {
  CalendarMain: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
};
```

- [ ] **Step 7: Create app/src/theme/index.ts**

```ts
export const colors = {
  background: "#0D0D0D",
  surface: "#1A1A1A",
  surfaceLight: "#252525",
  primary: "#E50914",
  accent: "#4A90D9",
  text: "#FFFFFF",
  textSecondary: "#A0A0A0",
  textMuted: "#666666",
  watchedGreen: "#2ECC71",
  stopBlue: "#3498DB",
  destructiveRed: "#E74C3C",
  border: "#333333",
  overlay: "rgba(0, 0, 0, 0.85)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const typography = {
  title: { fontSize: 22, fontWeight: "700" as const, color: colors.text },
  subtitle: { fontSize: 16, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 14, fontWeight: "400" as const, color: colors.text },
  caption: {
    fontSize: 12,
    fontWeight: "400" as const,
    color: colors.textSecondary,
  },
} as const;

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
export const posterSize = {
  small: `${TMDB_IMAGE_BASE}/w185`,
  medium: `${TMDB_IMAGE_BASE}/w342`,
  large: `${TMDB_IMAGE_BASE}/w500`,
} as const;
```

- [ ] **Step 8: Create app/src/config/firebase.ts**

```ts
import { firebase } from "@react-native-firebase/app";

// Firebase is auto-initialized from google-services.json (Android)
// and GoogleService-Info.plist (iOS) — no manual config needed.
// This file exists for any future custom initialization.

export default firebase;
```

- [ ] **Step 9: Initialize Firebase Functions**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-
mkdir -p functions/src/tmdb functions/src/triggers
```

Create `functions/package.json`:

```json
{
  "name": "tv-time-functions",
  "private": true,
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "serve": "npm run build && firebase emulators:start --only functions",
    "deploy": "firebase deploy --only functions"
  },
  "engines": {
    "node": "18"
  },
  "main": "lib/index.js",
  "dependencies": {
    "axios": "^1.7.0",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "firebase-functions-test": "^3.0.0"
  }
}
```

Create `functions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2018",
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "compileOnSave": true,
  "include": ["src"]
}
```

- [ ] **Step 10: Create firebase.json**

```json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs18"
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "ui": { "enabled": true }
  }
}
```

- [ ] **Step 11: Create firestore.indexes.json**

```json
{
  "indexes": [
    {
      "collectionGroup": "watchlist",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "lastWatchedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 12: Create .firebaserc**

```json
{
  "projects": {
    "default": "YOUR_FIREBASE_PROJECT_ID"
  }
}
```

- [ ] **Step 13: Create stub functions/src/index.ts**

```ts
// All function exports will be added in subsequent tasks
export {};
```

- [ ] **Step 14: Install functions dependencies**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions
npm install
```

- [ ] **Step 15: Verify app builds**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app
npx expo prebuild --clean
```

Expected: Prebuild completes, generates ios/ and android/ directories.

- [ ] **Step 16: Verify functions compile**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions
npm run build
```

Expected: Compiles with no errors.

- [ ] **Step 17: Commit**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-
git add -A
git commit -m "feat: scaffold Expo app, Firebase Functions, types, and theme"
```

---

### Task 2: Firebase Functions — TMDB Proxy Endpoints

**Files:**
- Create: `functions/src/tmdb/client.ts`, `functions/src/tmdb/cache.ts`
- Create: `functions/src/tmdb/searchMulti.ts`, `functions/src/tmdb/getTrending.ts`
- Create: `functions/src/tmdb/getShowDetails.ts`, `functions/src/tmdb/getSeasonDetails.ts`
- Create: `functions/src/tmdb/getUpcomingEpisodes.ts`
- Modify: `functions/src/index.ts`
- Create: `functions/src/tmdb/__tests__/cache.test.ts`

**Interfaces:**
- Produces: 5 HTTPS callable functions (`searchMulti`, `getTrending`, `getShowDetails`, `getSeasonDetails`, `getUpcomingEpisodes`) — all auth-gated, cache-first

- [ ] **Step 1: Create functions/src/tmdb/client.ts**

```ts
import axios, { AxiosInstance } from "axios";
import { defineString } from "firebase-functions/params";

const tmdbApiKey = defineString("TMDB_API_KEY");

let _client: AxiosInstance | null = null;

export function getTmdbClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: "https://api.themoviedb.org/3",
      params: { api_key: tmdbApiKey.value() },
    });
  }
  return _client;
}
```

- [ ] **Step 2: Create functions/src/tmdb/cache.ts**

```ts
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface CacheEntry {
  data: unknown;
  lastUpdated: admin.firestore.Timestamp;
}

export async function getCached(
  collection: string,
  docId: string,
  ttlMs: number
): Promise<unknown | null> {
  const doc = await db.collection(collection).doc(docId).get();
  if (!doc.exists) return null;

  const entry = doc.data() as CacheEntry;
  const age = Date.now() - entry.lastUpdated.toMillis();
  if (age > ttlMs) return null;

  return entry.data;
}

export async function setCache(
  collection: string,
  docId: string,
  data: unknown
): Promise<void> {
  await db
    .collection(collection)
    .doc(docId)
    .set({
      data,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
}

export { db };
```

- [ ] **Step 3: Create functions/src/tmdb/searchMulti.ts**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";

export const searchMulti = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { query, page = 1 } = request.data as {
    query: string;
    page?: number;
  };
  if (!query || typeof query !== "string") {
    throw new HttpsError("invalid-argument", "query is required");
  }

  const client = getTmdbClient();
  const response = await client.get("/search/multi", {
    params: { query, page, include_adult: false },
  });

  // Filter to only tv and movie results
  const filtered = response.data.results.filter(
    (r: { media_type: string }) =>
      r.media_type === "tv" || r.media_type === "movie"
  );

  return {
    results: filtered,
    page: response.data.page,
    totalPages: response.data.total_pages,
    totalResults: response.data.total_results,
  };
});
```

- [ ] **Step 4: Create functions/src/tmdb/getTrending.ts**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";
import { getCached, setCache } from "./cache";

const TRENDING_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_COLLECTION = "cache_trending";

export const getTrending = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { mediaType = "tv", timeWindow = "week" } = request.data as {
    mediaType?: string;
    timeWindow?: string;
  };

  const cacheKey = `${mediaType}_${timeWindow}`;
  const cached = await getCached(CACHE_COLLECTION, cacheKey, TRENDING_TTL);
  if (cached) return cached;

  const client = getTmdbClient();
  const response = await client.get(`/trending/${mediaType}/${timeWindow}`);

  const result = {
    results: response.data.results,
    page: response.data.page,
    totalPages: response.data.total_pages,
  };

  await setCache(CACHE_COLLECTION, cacheKey, result);
  return result;
});
```

- [ ] **Step 5: Create functions/src/tmdb/getShowDetails.ts**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";
import { getCached, setCache } from "./cache";

const SHOW_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_COLLECTION = "cache_shows";

export const getShowDetails = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { tmdbId, mediaType = "tv" } = request.data as {
    tmdbId: number;
    mediaType?: string;
  };
  if (!tmdbId) {
    throw new HttpsError("invalid-argument", "tmdbId is required");
  }

  const cacheKey = `${mediaType}_${tmdbId}`;
  const cached = await getCached(CACHE_COLLECTION, cacheKey, SHOW_TTL);
  if (cached) return cached;

  const client = getTmdbClient();
  const endpoint = mediaType === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
  const response = await client.get(endpoint);

  const result = response.data;
  await setCache(CACHE_COLLECTION, cacheKey, result);
  return result;
});
```

- [ ] **Step 6: Create functions/src/tmdb/getSeasonDetails.ts**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";
import { getCached, setCache } from "./cache";

const SEASON_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_COLLECTION = "cache_seasons";

export const getSeasonDetails = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { tmdbId, seasonNumber } = request.data as {
    tmdbId: number;
    seasonNumber: number;
  };
  if (!tmdbId || seasonNumber === undefined) {
    throw new HttpsError(
      "invalid-argument",
      "tmdbId and seasonNumber are required"
    );
  }

  const cacheKey = `${tmdbId}_s${seasonNumber}`;
  const cached = await getCached(CACHE_COLLECTION, cacheKey, SEASON_TTL);
  if (cached) return cached;

  const client = getTmdbClient();
  const response = await client.get(
    `/tv/${tmdbId}/season/${seasonNumber}`
  );

  const result = response.data;
  await setCache(CACHE_COLLECTION, cacheKey, result);
  return result;
});
```

- [ ] **Step 7: Create functions/src/tmdb/getUpcomingEpisodes.ts**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";

export const getUpcomingEpisodes = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { tmdbIds } = request.data as { tmdbIds: number[] };
  if (!tmdbIds || !Array.isArray(tmdbIds) || tmdbIds.length === 0) {
    throw new HttpsError("invalid-argument", "tmdbIds array is required");
  }

  const client = getTmdbClient();
  const today = new Date().toISOString().split("T")[0];

  const results = await Promise.all(
    tmdbIds.map(async (tmdbId) => {
      try {
        const showRes = await client.get(`/tv/${tmdbId}`);
        const show = showRes.data;
        const episodes: Array<{
          tmdbShowId: number;
          showTitle: string;
          posterPath: string | null;
          season: number;
          episode: number;
          episodeTitle: string;
          airDate: string;
          runtime: number | null;
        }> = [];

        // Check each season for upcoming episodes
        for (const season of show.seasons || []) {
          if (season.season_number === 0) continue; // Skip specials
          try {
            const seasonRes = await client.get(
              `/tv/${tmdbId}/season/${season.season_number}`
            );
            for (const ep of seasonRes.data.episodes || []) {
              if (ep.air_date && ep.air_date >= today) {
                episodes.push({
                  tmdbShowId: tmdbId,
                  showTitle: show.name,
                  posterPath: show.poster_path,
                  season: ep.season_number,
                  episode: ep.episode_number,
                  episodeTitle: ep.name,
                  airDate: ep.air_date,
                  runtime: ep.runtime,
                });
              }
            }
          } catch {
            // Season might not exist yet, skip
          }
        }

        return episodes;
      } catch {
        return [];
      }
    })
  );

  return { episodes: results.flat().sort((a, b) => a.airDate.localeCompare(b.airDate)) };
});
```

- [ ] **Step 8: Update functions/src/index.ts**

```ts
export { searchMulti } from "./tmdb/searchMulti";
export { getTrending } from "./tmdb/getTrending";
export { getShowDetails } from "./tmdb/getShowDetails";
export { getSeasonDetails } from "./tmdb/getSeasonDetails";
export { getUpcomingEpisodes } from "./tmdb/getUpcomingEpisodes";
```

- [ ] **Step 9: Verify functions compile**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions
npm run build
```

Expected: Compiles with no errors.

- [ ] **Step 10: Commit**

```bash
git add functions/src/tmdb functions/src/index.ts
git commit -m "feat: add TMDB proxy Cloud Functions with caching"
```

---

### Task 3: Firebase Functions — Firestore Triggers

**Files:**
- Create: `functions/src/triggers/onUserCreate.ts`
- Create: `functions/src/triggers/onEpisodeWatched.ts`
- Create: `functions/src/triggers/onWatchlistChange.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: Firestore document shapes from spec (users, watchedEpisodes, watchlist)
- Produces: Auto-managed `users/{userId}.stats` field

- [ ] **Step 1: Create functions/src/triggers/onUserCreate.ts**

```ts
import { beforeUserCreated } from "firebase-functions/v2/identity";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onUserCreate = beforeUserCreated(async (event) => {
  const user = event.data;
  await db.collection("users").doc(user.uid).set({
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    stats: {
      episodesWatched: 0,
      showsTracking: 0,
      totalMinutes: 0,
    },
  });
});
```

- [ ] **Step 2: Create functions/src/triggers/onEpisodeWatched.ts**

```ts
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onEpisodeCreated = onDocumentCreated(
  "users/{userId}/watchedEpisodes/{episodeId}",
  async (event) => {
    const userId = event.params.userId;
    const data = event.data?.data();
    if (!data) return;

    await db
      .collection("users")
      .doc(userId)
      .update({
        "stats.episodesWatched": admin.firestore.FieldValue.increment(1),
        "stats.totalMinutes": admin.firestore.FieldValue.increment(
          data.runtime || 0
        ),
      });
  }
);

export const onEpisodeDeleted = onDocumentDeleted(
  "users/{userId}/watchedEpisodes/{episodeId}",
  async (event) => {
    const userId = event.params.userId;
    const data = event.data?.data();
    if (!data) return;

    await db
      .collection("users")
      .doc(userId)
      .update({
        "stats.episodesWatched": admin.firestore.FieldValue.increment(-1),
        "stats.totalMinutes": admin.firestore.FieldValue.increment(
          -(data.runtime || 0)
        ),
      });
  }
);

export const onEpisodeUpdated = onDocumentUpdated(
  "users/{userId}/watchedEpisodes/{episodeId}",
  async (event) => {
    const userId = event.params.userId;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // On rewatch: watchCount incremented, add runtime again
    if (after.watchCount > before.watchCount) {
      await db
        .collection("users")
        .doc(userId)
        .update({
          "stats.episodesWatched": admin.firestore.FieldValue.increment(1),
          "stats.totalMinutes": admin.firestore.FieldValue.increment(
            after.runtime || 0
          ),
        });
    }
  }
);
```

- [ ] **Step 3: Create functions/src/triggers/onWatchlistChange.ts**

```ts
import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onWatchlistAdded = onDocumentCreated(
  "users/{userId}/watchlist/{showId}",
  async (event) => {
    const userId = event.params.userId;
    await db
      .collection("users")
      .doc(userId)
      .update({
        "stats.showsTracking": admin.firestore.FieldValue.increment(1),
      });
  }
);

export const onWatchlistRemoved = onDocumentDeleted(
  "users/{userId}/watchlist/{showId}",
  async (event) => {
    const userId = event.params.userId;
    await db
      .collection("users")
      .doc(userId)
      .update({
        "stats.showsTracking": admin.firestore.FieldValue.increment(-1),
      });
  }
);
```

- [ ] **Step 4: Update functions/src/index.ts — add trigger exports**

```ts
export { searchMulti } from "./tmdb/searchMulti";
export { getTrending } from "./tmdb/getTrending";
export { getShowDetails } from "./tmdb/getShowDetails";
export { getSeasonDetails } from "./tmdb/getSeasonDetails";
export { getUpcomingEpisodes } from "./tmdb/getUpcomingEpisodes";

export { onUserCreate } from "./triggers/onUserCreate";
export {
  onEpisodeCreated,
  onEpisodeDeleted,
  onEpisodeUpdated,
} from "./triggers/onEpisodeWatched";
export {
  onWatchlistAdded,
  onWatchlistRemoved,
} from "./triggers/onWatchlistChange";
```

- [ ] **Step 5: Verify functions compile**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions
npm run build
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add functions/
git commit -m "feat: add Firestore triggers for user stats and watchlist tracking"
```

---

### Task 4: Firestore Security Rules

**Files:**
- Create: `firestore.rules`

**Interfaces:**
- Produces: Security rules ensuring users can only read/write their own data, cache is read-only for clients

- [ ] **Step 1: Write firestore.rules**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own profile
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;

      // Watchlist subcollection
      match /watchlist/{showId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      // Watched episodes subcollection
      match /watchedEpisodes/{episodeId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    // Cache collections — read-only for authenticated users, write by admin SDK only
    match /cache_shows/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /cache_trending/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /cache_seasons/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat: add Firestore security rules"
```

---

### Task 5: Auth Flow — Google Sign-In, Auth Store, Login Screen

**Files:**
- Create: `app/src/stores/authStore.ts`
- Create: `app/src/screens/LoginScreen.tsx`
- Modify: `app/App.tsx`

**Interfaces:**
- Consumes: `@react-native-firebase/auth`, `@react-native-google-signin/google-signin`
- Produces: `useAuthStore()` → `{ user, loading, signIn, signOut }`, auth-gated app root

- [ ] **Step 1: Create app/src/stores/authStore.ts**

```ts
import { create } from "zustand";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

interface AuthState {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  setUser: (user: FirebaseAuthTypes.User | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),

  signIn: async () => {
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) throw new Error("No ID token");

      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      await auth().signInWithCredential(googleCredential);
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  },

  signOut: async () => {
    try {
      await GoogleSignin.revokeAccess();
      await auth().signOut();
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  },
}));
```

- [ ] **Step 2: Create app/src/screens/LoginScreen.tsx**

```tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors, spacing, typography } from "../theme";
import { useAuthStore } from "../stores/authStore";

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signIn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TV Time</Text>
      <Text style={styles.subtitle}>Track your shows & movies</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handleSignIn}
        disabled={signingIn}
      >
        {signingIn ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.buttonText}>Sign in with Google</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 16,
    marginBottom: spacing.xxl * 2,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    borderRadius: 8,
    minWidth: 250,
    alignItems: "center",
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
  error: {
    color: colors.destructiveRed,
    marginTop: spacing.lg,
    ...typography.body,
  },
});
```

- [ ] **Step 3: Update app/App.tsx — auth gate + providers**

```tsx
import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import auth from "@react-native-firebase/auth";
import { useAuthStore } from "./src/stores/authStore";
import LoginScreen from "./src/screens/LoginScreen";
import { colors } from "./src/theme";

// TODO: Replace with your web client ID from Firebase Console
GoogleSignin.configure({
  webClientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

function AppContent() {
  const { user, loading, setUser } = useAuthStore();

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
    });
    return unsubscribe;
  }, [setUser]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // AppNavigator will be added in Task 6
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add app/src/stores/authStore.ts app/src/screens/LoginScreen.tsx app/App.tsx
git commit -m "feat: add Google Sign-In auth flow with Zustand store"
```

---

### Task 6: Navigation Shell & Offline Guard

**Files:**
- Create: `app/src/navigation/AppNavigator.tsx`
- Create: `app/src/components/OfflineOverlay.tsx`
- Create: `app/src/stores/uiStore.ts`
- Create: `app/src/screens/HomeScreen.tsx` (stub with top tabs)
- Create: `app/src/screens/SearchScreen.tsx` (stub)
- Create: `app/src/screens/CalendarScreen.tsx` (stub)
- Create: `app/src/screens/ProfileScreen.tsx` (stub)
- Create: `app/src/screens/ShowDetailScreen.tsx` (stub)
- Create: `app/src/screens/SeasonDetailScreen.tsx` (stub)
- Create: `app/src/screens/WatchlistTab.tsx` (stub)
- Create: `app/src/screens/UpcomingTab.tsx` (stub)
- Modify: `app/App.tsx` — wire in AppNavigator

**Interfaces:**
- Consumes: `useAuthStore()` for auth gate, screen stubs
- Produces: Full navigation tree (bottom tabs + top tabs + stacks), `OfflineOverlay` component, `useUiStore()`

- [ ] **Step 1: Create app/src/stores/uiStore.ts**

```ts
import { create } from "zustand";

interface UiState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isConnected: true,
  setConnected: (isConnected) => set({ isConnected }),
}));
```

- [ ] **Step 2: Create app/src/components/OfflineOverlay.tsx**

```tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { colors, spacing, typography } from "../theme";
import { useUiStore } from "../stores/uiStore";

export default function OfflineOverlay() {
  const isConnected = useUiStore((s) => s.isConnected);

  const handleRetry = async () => {
    const state = await NetInfo.fetch();
    useUiStore.getState().setConnected(state.isConnected ?? false);
  };

  if (isConnected) return null;

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.overlay}>
        <Text style={styles.title}>No Internet Connection</Text>
        <Text style={styles.subtitle}>
          Please check your connection and try again
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleRetry}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 14,
    marginBottom: spacing.xxl,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: 8,
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
});
```

- [ ] **Step 3: Create stub screens**

Create each stub as a simple centered text screen. All follow this pattern:

`app/src/screens/WatchlistTab.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme";

export default function WatchlistTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Watchlist</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  text: { ...typography.title },
});
```

`app/src/screens/UpcomingTab.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme";

export default function UpcomingTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Upcoming</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  text: { ...typography.title },
});
```

`app/src/screens/HomeScreen.tsx`:
```tsx
import React from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { colors } from "../theme";
import { HomeTopTabParamList } from "../types";
import WatchlistTab from "./WatchlistTab";
import UpcomingTab from "./UpcomingTab";

const TopTab = createMaterialTopTabNavigator<HomeTopTabParamList>();

export default function HomeScreen() {
  return (
    <TopTab.Navigator
      screenOptions={{
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIndicatorStyle: { backgroundColor: colors.primary },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 14 },
      }}
    >
      <TopTab.Screen name="Watchlist" component={WatchlistTab} />
      <TopTab.Screen name="Upcoming" component={UpcomingTab} />
    </TopTab.Navigator>
  );
}
```

`app/src/screens/SearchScreen.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme";

export default function SearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Search</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  text: { ...typography.title },
});
```

`app/src/screens/CalendarScreen.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme";

export default function CalendarScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Calendar</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  text: { ...typography.title },
});
```

`app/src/screens/ProfileScreen.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme";

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Profile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  text: { ...typography.title },
});
```

`app/src/screens/ShowDetailScreen.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme";

export default function ShowDetailScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Show Detail</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  text: { ...typography.title },
});
```

`app/src/screens/SeasonDetailScreen.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "../theme";

export default function SeasonDetailScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Season Detail</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  text: { ...typography.title },
});
```

- [ ] **Step 4: Create app/src/navigation/AppNavigator.tsx**

```tsx
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { colors } from "../theme";
import {
  MainTabParamList,
  HomeStackParamList,
  SearchStackParamList,
  CalendarStackParamList,
} from "../types";
import HomeScreen from "../screens/HomeScreen";
import SearchScreen from "../screens/SearchScreen";
import CalendarScreen from "../screens/CalendarScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ShowDetailScreen from "../screens/ShowDetailScreen";
import SeasonDetailScreen from "../screens/SeasonDetailScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: "600" as const },
};

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="HomeTabs"
        component={HomeScreen}
        options={{ headerTitle: "TV Time" }}
      />
      <HomeStack.Screen
        name="ShowDetail"
        component={ShowDetailScreen}
        options={{ headerTitle: "" }}
      />
      <HomeStack.Screen
        name="SeasonDetail"
        component={SeasonDetailScreen}
        options={({ route }) => ({ headerTitle: route.params.showTitle })}
      />
    </HomeStack.Navigator>
  );
}

function SearchStackScreen() {
  return (
    <SearchStack.Navigator screenOptions={stackScreenOptions}>
      <SearchStack.Screen
        name="SearchMain"
        component={SearchScreen}
        options={{ headerTitle: "Search" }}
      />
      <SearchStack.Screen
        name="ShowDetail"
        component={ShowDetailScreen}
        options={{ headerTitle: "" }}
      />
    </SearchStack.Navigator>
  );
}

function CalendarStackScreen() {
  return (
    <CalendarStack.Navigator screenOptions={stackScreenOptions}>
      <CalendarStack.Screen
        name="CalendarMain"
        component={CalendarScreen}
        options={{ headerTitle: "Calendar" }}
      />
      <CalendarStack.Screen
        name="ShowDetail"
        component={ShowDetailScreen}
        options={{ headerTitle: "" }}
      />
    </CalendarStack.Navigator>
  );
}

// Simple icon component using text symbols
function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    Home: "🏠",
    Search: "🔍",
    Calendar: "📅",
    Profile: "👤",
  };
  return <Text style={{ fontSize: 20, color }}>{icons[name] || "•"}</Text>;
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color }) => (
            <TabIcon name={route.name} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Home" component={HomeStackScreen} />
        <Tab.Screen name="Search" component={SearchStackScreen} />
        <Tab.Screen name="Calendar" component={CalendarStackScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
        }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 5: Update app/App.tsx — wire in navigator + offline overlay + NetInfo listener**

```tsx
import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import NetInfo from "@react-native-community/netinfo";
import auth from "@react-native-firebase/auth";
import { useAuthStore } from "./src/stores/authStore";
import { useUiStore } from "./src/stores/uiStore";
import LoginScreen from "./src/screens/LoginScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import OfflineOverlay from "./src/components/OfflineOverlay";
import { colors } from "./src/theme";

// TODO: Replace with your web client ID from Firebase Console
GoogleSignin.configure({
  webClientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

function AppContent() {
  const { user, loading, setUser } = useAuthStore();
  const setConnected = useUiStore((s) => s.setConnected);

  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
    });
    return unsubscribeAuth;
  }, [setUser]);

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setConnected(state.isConnected ?? false);
    });
    return unsubscribeNet;
  }, [setConnected]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <>
      <AppNavigator />
      <OfflineOverlay />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
```

- [ ] **Step 6: Verify app compiles**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add app/
git commit -m "feat: add navigation shell, offline overlay, and stub screens"
```

---

### Task 7: Firestore Service Layer & Hooks

**Files:**
- Create: `app/src/services/firestore.ts`
- Create: `app/src/hooks/useWatchlist.ts`
- Create: `app/src/hooks/useWatchedEpisodes.ts`
- Create: `app/src/hooks/useUserStats.ts`

**Interfaces:**
- Consumes: `@react-native-firebase/firestore`, types from `types/index.ts`
- Produces: `addToWatchlist()`, `removeFromWatchlist()`, `markEpisodeWatched()`, `markEpisodeUnwatched()`, `startRewatch()`, `resumeRewatch()`, `useWatchlist()`, `useWatchedEpisodes()`, `useUserStats()`

- [ ] **Step 1: Create app/src/services/firestore.ts**

```ts
import firestore from "@react-native-firebase/firestore";
import { WatchStatus, MediaType } from "../types";

const db = firestore();

function userRef(userId: string) {
  return db.collection("users").doc(userId);
}

function watchlistRef(userId: string) {
  return userRef(userId).collection("watchlist");
}

function watchedEpisodesRef(userId: string) {
  return userRef(userId).collection("watchedEpisodes");
}

function episodeDocId(tmdbShowId: number, season: number, episode: number) {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return `${tmdbShowId}_S${s}E${e}`;
}

export async function addToWatchlist(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  title: string,
  posterPath: string,
  firstEpisode?: { season: number; episode: number }
) {
  await watchlistRef(userId)
    .doc(String(tmdbId))
    .set({
      tmdbId,
      mediaType,
      title,
      posterPath,
      addedAt: firestore.FieldValue.serverTimestamp(),
      lastWatchedAt: null,
      status: "watching" as WatchStatus,
      nextEpisode: firstEpisode || (mediaType === "tv" ? { season: 1, episode: 1 } : null),
      rewatchCount: 0,
    });
}

export async function removeFromWatchlist(userId: string, tmdbId: number) {
  await watchlistRef(userId).doc(String(tmdbId)).delete();
}

export async function stopWatching(userId: string, tmdbId: number, currentStatus: WatchStatus) {
  if (currentStatus === "rewatching") {
    // Pause rewatch — preserve nextEpisode
    await watchlistRef(userId).doc(String(tmdbId)).update({
      status: "paused_rewatch" as WatchStatus,
    });
  } else {
    await removeFromWatchlist(userId, tmdbId);
  }
}

export async function markEpisodeWatched(
  userId: string,
  tmdbShowId: number,
  season: number,
  episode: number,
  episodeTitle: string,
  runtime: number,
  nextEpisode: { season: number; episode: number } | null,
  isShowComplete: boolean
) {
  const docId = episodeDocId(tmdbShowId, season, episode);
  const epRef = watchedEpisodesRef(userId).doc(docId);
  const epDoc = await epRef.get();

  if (epDoc.exists) {
    // Rewatch — increment watchCount
    await epRef.update({
      watchCount: firestore.FieldValue.increment(1),
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await epRef.set({
      tmdbShowId,
      season,
      episode,
      episodeTitle,
      watchedAt: firestore.FieldValue.serverTimestamp(),
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
      runtime,
      watchCount: 1,
    });
  }

  // Update watchlist item
  const watchlistUpdate: Record<string, unknown> = {
    lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    nextEpisode,
  };
  if (isShowComplete) {
    watchlistUpdate.status = "completed";
  }
  await watchlistRef(userId).doc(String(tmdbShowId)).update(watchlistUpdate);
}

export async function startRewatch(userId: string, tmdbId: number) {
  await watchlistRef(userId)
    .doc(String(tmdbId))
    .update({
      status: "rewatching" as WatchStatus,
      rewatchCount: firestore.FieldValue.increment(1),
      nextEpisode: { season: 1, episode: 1 },
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    });
}

export async function resumeRewatch(userId: string, tmdbId: number) {
  await watchlistRef(userId).doc(String(tmdbId)).update({
    status: "rewatching" as WatchStatus,
  });
}

export { db, watchlistRef, watchedEpisodesRef, userRef };
```

- [ ] **Step 2: Create app/src/hooks/useWatchlist.ts**

```ts
import { useEffect, useState } from "react";
import firestore from "@react-native-firebase/firestore";
import { WatchlistItem } from "../types";

export function useWatchlist(userId: string | undefined) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const unsubscribe = firestore()
      .collection("users")
      .doc(userId)
      .collection("watchlist")
      .onSnapshot(
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as WatchlistItem[];
          setItems(data);
          setLoading(false);
        },
        (error) => {
          console.error("Watchlist listener error:", error);
          setLoading(false);
        }
      );

    return unsubscribe;
  }, [userId]);

  return { items, loading };
}
```

- [ ] **Step 3: Create app/src/hooks/useWatchedEpisodes.ts**

```ts
import { useEffect, useState } from "react";
import firestore from "@react-native-firebase/firestore";
import { WatchedEpisode } from "../types";

export function useWatchedEpisodes(
  userId: string | undefined,
  tmdbShowId?: number
) {
  const [episodes, setEpisodes] = useState<WatchedEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setEpisodes([]);
      setLoading(false);
      return;
    }

    let query = firestore()
      .collection("users")
      .doc(userId)
      .collection("watchedEpisodes") as FirebaseFirestoreTypes.Query;

    if (tmdbShowId !== undefined) {
      query = query.where("tmdbShowId", "==", tmdbShowId);
    }

    const unsubscribe = query.onSnapshot(
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as WatchedEpisode[];
        setEpisodes(data);
        setLoading(false);
      },
      (error) => {
        console.error("WatchedEpisodes listener error:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId, tmdbShowId]);

  return { episodes, loading };
}
```

Add the missing import at the top:

```ts
import { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
```

- [ ] **Step 4: Create app/src/hooks/useUserStats.ts**

```ts
import { useEffect, useState } from "react";
import firestore from "@react-native-firebase/firestore";
import { UserStats } from "../types";

const defaultStats: UserStats = {
  episodesWatched: 0,
  showsTracking: 0,
  totalMinutes: 0,
};

export function useUserStats(userId: string | undefined) {
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setStats(defaultStats);
      setLoading(false);
      return;
    }

    const unsubscribe = firestore()
      .collection("users")
      .doc(userId)
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            const data = doc.data();
            setStats(data?.stats || defaultStats);
          }
          setLoading(false);
        },
        (error) => {
          console.error("UserStats listener error:", error);
          setLoading(false);
        }
      );

    return unsubscribe;
  }, [userId]);

  return { stats, loading };
}
```

- [ ] **Step 5: Commit**

```bash
git add app/src/services/firestore.ts app/src/hooks/
git commit -m "feat: add Firestore service layer and real-time listener hooks"
```

---

### Task 8: React Query Hooks — TMDB Proxy Calls

**Files:**
- Create: `app/src/services/functions.ts`
- Create: `app/src/hooks/useSearch.ts`
- Create: `app/src/hooks/useTrending.ts`
- Create: `app/src/hooks/useShowDetails.ts`
- Create: `app/src/hooks/useSeasonDetails.ts`
- Create: `app/src/hooks/useUpcomingEpisodes.ts`

**Interfaces:**
- Consumes: `@react-native-firebase/firestore` (for callable functions), TanStack React Query
- Produces: `useSearch(query)`, `useTrending(type)`, `useShowDetails(id)`, `useSeasonDetails(id, season)`, `useUpcomingEpisodes(ids)`

- [ ] **Step 1: Create app/src/services/functions.ts**

```ts
import functions from "@react-native-firebase/functions";

const callable = functions();

export async function searchMulti(query: string, page: number = 1) {
  const result = await callable.httpsCallable("searchMulti")({ query, page });
  return result.data as {
    results: Array<Record<string, unknown>>;
    page: number;
    totalPages: number;
    totalResults: number;
  };
}

export async function getTrending(
  mediaType: string = "tv",
  timeWindow: string = "week"
) {
  const result = await callable.httpsCallable("getTrending")({
    mediaType,
    timeWindow,
  });
  return result.data as {
    results: Array<Record<string, unknown>>;
    page: number;
    totalPages: number;
  };
}

export async function getShowDetails(tmdbId: number, mediaType: string = "tv") {
  const result = await callable.httpsCallable("getShowDetails")({
    tmdbId,
    mediaType,
  });
  return result.data;
}

export async function getSeasonDetails(
  tmdbId: number,
  seasonNumber: number
) {
  const result = await callable.httpsCallable("getSeasonDetails")({
    tmdbId,
    seasonNumber,
  });
  return result.data;
}

export async function getUpcomingEpisodes(tmdbIds: number[]) {
  const result = await callable.httpsCallable("getUpcomingEpisodes")({
    tmdbIds,
  });
  return result.data as {
    episodes: Array<{
      tmdbShowId: number;
      showTitle: string;
      posterPath: string | null;
      season: number;
      episode: number;
      episodeTitle: string;
      airDate: string;
      runtime: number | null;
    }>;
  };
}
```

- [ ] **Step 2: Create app/src/hooks/useSearch.ts**

```ts
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchMulti } from "../services/functions";
import { TMDBShow } from "../types";

export function useSearch(query: string) {
  return useInfiniteQuery({
    queryKey: ["search", query],
    queryFn: ({ pageParam = 1 }) => searchMulti(query, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: query.length > 0,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      results: data.pages.flatMap((p) => p.results) as unknown as TMDBShow[],
    }),
  });
}
```

- [ ] **Step 3: Create app/src/hooks/useTrending.ts**

```ts
import { useQuery } from "@tanstack/react-query";
import { getTrending } from "../services/functions";
import { TMDBShow } from "../types";

export function useTrending(mediaType: string = "tv") {
  return useQuery({
    queryKey: ["trending", mediaType],
    queryFn: () => getTrending(mediaType),
    staleTime: 60 * 60 * 1000, // 1 hour
    select: (data) => data.results as unknown as TMDBShow[],
  });
}
```

- [ ] **Step 4: Create app/src/hooks/useShowDetails.ts**

```ts
import { useQuery } from "@tanstack/react-query";
import { getShowDetails } from "../services/functions";
import { TMDBShow } from "../types";

export function useShowDetails(tmdbId: number, mediaType: string = "tv") {
  return useQuery({
    queryKey: ["show", tmdbId, mediaType],
    queryFn: () => getShowDetails(tmdbId, mediaType),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    select: (data) => data as unknown as TMDBShow,
  });
}
```

- [ ] **Step 5: Create app/src/hooks/useSeasonDetails.ts**

```ts
import { useQuery } from "@tanstack/react-query";
import { getSeasonDetails } from "../services/functions";
import { TMDBEpisode } from "../types";

export function useSeasonDetails(tmdbId: number, seasonNumber: number) {
  return useQuery({
    queryKey: ["season", tmdbId, seasonNumber],
    queryFn: () => getSeasonDetails(tmdbId, seasonNumber),
    staleTime: 24 * 60 * 60 * 1000,
    select: (data) => {
      const d = data as { episodes: TMDBEpisode[]; name: string; season_number: number };
      return d;
    },
  });
}
```

- [ ] **Step 6: Create app/src/hooks/useUpcomingEpisodes.ts**

```ts
import { useQuery } from "@tanstack/react-query";
import { getUpcomingEpisodes } from "../services/functions";
import { UpcomingEpisode } from "../types";

export function useUpcomingEpisodes(tmdbIds: number[]) {
  return useQuery({
    queryKey: ["upcoming", tmdbIds],
    queryFn: () => getUpcomingEpisodes(tmdbIds),
    staleTime: 60 * 60 * 1000, // 1 hour
    enabled: tmdbIds.length > 0,
    select: (data) => data.episodes as UpcomingEpisode[],
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add app/src/services/functions.ts app/src/hooks/
git commit -m "feat: add React Query hooks for TMDB proxy calls"
```

---

### Task 9: Swipeable Card Component

**Files:**
- Create: `app/src/components/SwipeableCard.tsx`
- Create: `app/src/components/LoadingSpinner.tsx`

**Interfaces:**
- Consumes: `react-native-gesture-handler`, `react-native-reanimated`
- Produces: `<SwipeableCard onSwipeLeft onSwipeRight children />` with green/blue background reveals, spinner state, and smooth layout animations

- [ ] **Step 1: Create app/src/components/LoadingSpinner.tsx**

```tsx
import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { colors } from "../theme";

interface Props {
  size?: "small" | "large";
  color?: string;
}

export default function LoadingSpinner({
  size = "small",
  color = colors.text,
}: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
```

- [ ] **Step 2: Create app/src/components/SwipeableCard.tsx**

```tsx
import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { colors, spacing, typography } from "../theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

type SwipeState = "idle" | "swiped_left" | "swiped_right" | "loading" | "done";

interface Props {
  children: React.ReactNode;
  onSwipeLeft: () => Promise<void>; // Mark watched
  onSwipeRight: () => Promise<void>; // Stop watching
  onCheckmarkPress?: () => Promise<void>; // Tap checkmark
  height?: number;
}

export default function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  height = 100,
}: Props) {
  const translateX = useSharedValue(0);
  const [swipeState, setSwipeState] = React.useState<SwipeState>("idle");
  const [actionColor, setActionColor] = React.useState(colors.watchedGreen);
  const isProcessing = useRef(false);

  const handleSwipeComplete = useCallback(
    async (direction: "left" | "right") => {
      if (isProcessing.current) return;
      isProcessing.current = true;

      const color =
        direction === "left" ? colors.watchedGreen : colors.stopBlue;
      setActionColor(color);
      setSwipeState("loading");

      try {
        if (direction === "left") {
          await onSwipeLeft();
        } else {
          await onSwipeRight();
        }
        setSwipeState("done");
        // Animate remaining cards up
        LayoutAnimation.configureNext(
          LayoutAnimation.create(300, "easeInEaseOut", "opacity")
        );
      } catch {
        // Slide card back
        translateX.value = withTiming(0, { duration: 300 });
        setSwipeState("idle");
        isProcessing.current = false;
      }
    },
    [onSwipeLeft, onSwipeRight, translateX]
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (swipeState !== "idle") return;
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (swipeState !== "idle") return;

      if (event.translationX > SWIPE_THRESHOLD) {
        // Swiped right (card moves right) = mark watched
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
          runOnJS(handleSwipeComplete)("left");
        });
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        // Swiped left (card moves left) = stop watching
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => {
          runOnJS(handleSwipeComplete)("right");
        });
      } else {
        translateX.value = withTiming(0, { duration: 200 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftRevealOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const rightRevealOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  if (swipeState === "done") {
    return null;
  }

  if (swipeState === "loading") {
    return (
      <View style={[styles.revealCard, { height, backgroundColor: actionColor }]}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.revealText}>
          {actionColor === colors.watchedGreen ? "Watched" : "Stop Watching"}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height, overflow: "hidden" }}>
      {/* Green background (swipe right = watched) */}
      <Animated.View
        style={[
          styles.revealCard,
          { height, backgroundColor: colors.watchedGreen },
          leftRevealOpacity,
        ]}
      >
        <Text style={styles.revealText}>✓ Watched</Text>
      </Animated.View>

      {/* Blue background (swipe left = stop watching) */}
      <Animated.View
        style={[
          styles.revealCard,
          { height, backgroundColor: colors.stopBlue },
          rightRevealOpacity,
        ]}
      >
        <Text style={styles.revealText}>Stop Watching</Text>
      </Animated.View>

      {/* Card content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, { height }, cardStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    zIndex: 1,
  },
  revealCard: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    zIndex: 0,
  },
  revealText: {
    ...typography.subtitle,
    color: colors.text,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/
git commit -m "feat: add SwipeableCard component with green/blue reveal animations"
```

---

### Task 10: Show & Episode Card Components

**Files:**
- Create: `app/src/components/ShowCard.tsx`
- Create: `app/src/components/EpisodeCard.tsx`

**Interfaces:**
- Consumes: `WatchlistItem`, `TMDBShow`, `UpcomingEpisode` types, `SwipeableCard`
- Produces: `<ShowCard item onSwipeLeft onSwipeRight onPress onCheckmark />`, `<EpisodeCard episode onSwipeLeft onSwipeRight onPress />`

- [ ] **Step 1: Create app/src/components/ShowCard.tsx**

```tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, posterSize } from "../theme";
import { WatchlistItem } from "../types";
import SwipeableCard from "./SwipeableCard";

interface Props {
  item: WatchlistItem;
  onSwipeLeft: () => Promise<void>;
  onSwipeRight: () => Promise<void>;
  onPress: () => void;
  onCheckmark: () => Promise<void>;
}

export default function ShowCard({
  item,
  onSwipeLeft,
  onSwipeRight,
  onPress,
  onCheckmark,
}: Props) {
  const episodeLabel = item.nextEpisode
    ? `S${String(item.nextEpisode.season).padStart(2, "0")}E${String(item.nextEpisode.episode).padStart(2, "0")}`
    : item.mediaType === "movie"
      ? "Movie"
      : "";

  return (
    <SwipeableCard onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
      <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
        <Image
          source={{ uri: `${posterSize.small}${item.posterPath}` }}
          style={styles.poster}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.episode}>{episodeLabel}</Text>
          {item.rewatchCount > 0 && (
            <Text style={styles.rewatch}>
              Rewatch #{item.rewatchCount}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.checkmark}
          onPress={onCheckmark}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.checkmarkText}>✓</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  poster: {
    width: 55,
    height: 82,
    borderRadius: 4,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  title: {
    ...typography.subtitle,
  },
  episode: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  rewatch: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  checkmark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    fontSize: 18,
    color: colors.textMuted,
  },
});
```

- [ ] **Step 2: Create app/src/components/EpisodeCard.tsx**

```tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, posterSize } from "../theme";
import { UpcomingEpisode } from "../types";
import SwipeableCard from "./SwipeableCard";

interface Props {
  episode: UpcomingEpisode;
  onSwipeLeft: () => Promise<void>;
  onSwipeRight: () => Promise<void>;
  onPress: () => void;
  onCheckmark: () => Promise<void>;
}

export default function EpisodeCard({
  episode,
  onSwipeLeft,
  onSwipeRight,
  onPress,
  onCheckmark,
}: Props) {
  const label = `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;

  return (
    <SwipeableCard onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: `${posterSize.small}${episode.posterPath}` }}
          style={styles.poster}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={styles.showTitle} numberOfLines={1}>
            {episode.showTitle}
          </Text>
          <Text style={styles.episodeLabel}>{label}</Text>
          <Text style={styles.episodeTitle} numberOfLines={1}>
            {episode.episodeTitle}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.checkmark}
          onPress={onCheckmark}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.checkmarkText}>✓</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  poster: {
    width: 55,
    height: 82,
    borderRadius: 4,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  showTitle: {
    ...typography.subtitle,
  },
  episodeLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  episodeTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  checkmark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    fontSize: 18,
    color: colors.textMuted,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/ShowCard.tsx app/src/components/EpisodeCard.tsx
git commit -m "feat: add ShowCard and EpisodeCard components with swipe support"
```

---

### Task 11: Home — Watchlist Tab

**Files:**
- Modify: `app/src/screens/WatchlistTab.tsx`

**Interfaces:**
- Consumes: `useWatchlist()`, `useAuthStore()`, `ShowCard`, `markEpisodeWatched()`, `stopWatching()`, `useSeasonDetails()`
- Produces: Fully functional Watchlist tab with sorted FlatList, swipe actions, checkmark tap

- [ ] **Step 1: Implement WatchlistTab.tsx**

```tsx
import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { useWatchlist } from "../hooks/useWatchlist";
import { markEpisodeWatched, stopWatching } from "../services/firestore";
import { getSeasonDetails } from "../services/functions";
import ShowCard from "../components/ShowCard";
import { colors, spacing, typography } from "../theme";
import { WatchlistItem, HomeStackParamList } from "../types";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "HomeTabs">;

export default function WatchlistTab() {
  const user = useAuthStore((s) => s.user);
  const { items, loading } = useWatchlist(user?.uid);
  const navigation = useNavigation<NavProp>();

  // Filter to active shows only
  const activeItems = useMemo(() => {
    return items.filter(
      (item) =>
        item.status === "watching" ||
        item.status === "rewatching" ||
        item.status === "plan_to_watch"
    );
  }, [items]);

  // Sort: lastWatchedAt desc (recently watched first)
  const sortedItems = useMemo(() => {
    return [...activeItems].sort((a, b) => {
      const aTime = a.lastWatchedAt?.toMillis() || 0;
      const bTime = b.lastWatchedAt?.toMillis() || 0;
      return bTime - aTime;
    });
  }, [activeItems]);

  const handleMarkWatched = useCallback(
    async (item: WatchlistItem) => {
      if (!user?.uid || !item.nextEpisode) return;

      // Fetch season to determine next episode
      const seasonData = await getSeasonDetails(
        item.tmdbId,
        item.nextEpisode.season
      );
      const season = seasonData as {
        episodes: Array<{
          episode_number: number;
          name: string;
          runtime: number | null;
          season_number: number;
        }>;
      };

      const currentEp = season.episodes.find(
        (e) => e.episode_number === item.nextEpisode!.episode
      );
      const nextEpInSeason = season.episodes.find(
        (e) => e.episode_number === item.nextEpisode!.episode + 1
      );

      let nextEpisode: { season: number; episode: number } | null = null;
      let isComplete = false;

      if (nextEpInSeason) {
        nextEpisode = {
          season: item.nextEpisode.season,
          episode: nextEpInSeason.episode_number,
        };
      } else {
        // Check if there's a next season
        try {
          const nextSeasonData = await getSeasonDetails(
            item.tmdbId,
            item.nextEpisode.season + 1
          );
          const nextSeason = nextSeasonData as {
            episodes: Array<{ episode_number: number }>;
          };
          if (nextSeason.episodes && nextSeason.episodes.length > 0) {
            nextEpisode = {
              season: item.nextEpisode.season + 1,
              episode: 1,
            };
          } else {
            isComplete = true;
          }
        } catch {
          isComplete = true;
        }
      }

      await markEpisodeWatched(
        user.uid,
        item.tmdbId,
        item.nextEpisode.season,
        item.nextEpisode.episode,
        currentEp?.name || "",
        currentEp?.runtime || 0,
        nextEpisode,
        isComplete
      );
    },
    [user?.uid]
  );

  const handleStopWatching = useCallback(
    async (item: WatchlistItem) => {
      if (!user?.uid) return;
      await stopWatching(user.uid, item.tmdbId, item.status);
    },
    [user?.uid]
  );

  const handlePress = useCallback(
    (item: WatchlistItem) => {
      navigation.navigate("ShowDetail", {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
      });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: WatchlistItem }) => (
      <ShowCard
        item={item}
        onSwipeLeft={() => handleMarkWatched(item)}
        onSwipeRight={() => handleStopWatching(item)}
        onPress={() => handlePress(item)}
        onCheckmark={() => handleMarkWatched(item)}
      />
    ),
    [handleMarkWatched, handleStopWatching, handlePress]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (sortedItems.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No shows in your watchlist</Text>
        <Text style={styles.emptyHint}>Search to add shows</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={sortedItems}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  emptyHint: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
});
```

- [ ] **Step 2: Verify app compiles**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/WatchlistTab.tsx
git commit -m "feat: implement Watchlist tab with sorted list and swipe actions"
```

---

### Task 12: Home — Upcoming Tab

**Files:**
- Modify: `app/src/screens/UpcomingTab.tsx`

**Interfaces:**
- Consumes: `useWatchlist()`, `useUpcomingEpisodes()`, `useAuthStore()`, `EpisodeCard`, `markEpisodeWatched()`, `stopWatching()`
- Produces: Upcoming episodes list grouped by air date with swipe actions

- [ ] **Step 1: Implement UpcomingTab.tsx**

```tsx
import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { useWatchlist } from "../hooks/useWatchlist";
import { useUpcomingEpisodes } from "../hooks/useUpcomingEpisodes";
import { markEpisodeWatched, stopWatching } from "../services/firestore";
import EpisodeCard from "../components/EpisodeCard";
import { colors, spacing, typography } from "../theme";
import { UpcomingEpisode, HomeStackParamList, WatchlistItem } from "../types";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "HomeTabs">;

type ListItem =
  | { type: "header"; date: string }
  | { type: "episode"; episode: UpcomingEpisode };

export default function UpcomingTab() {
  const user = useAuthStore((s) => s.user);
  const { items: watchlist } = useWatchlist(user?.uid);
  const navigation = useNavigation<NavProp>();

  const tvShowIds = useMemo(
    () =>
      watchlist
        .filter(
          (w) =>
            w.mediaType === "tv" &&
            (w.status === "watching" || w.status === "rewatching")
        )
        .map((w) => w.tmdbId),
    [watchlist]
  );

  const { data: episodes, isLoading } = useUpcomingEpisodes(tvShowIds);

  // Group episodes by date for section-like rendering
  const listData: ListItem[] = useMemo(() => {
    if (!episodes) return [];
    const grouped = new Map<string, UpcomingEpisode[]>();

    for (const ep of episodes) {
      const existing = grouped.get(ep.airDate) || [];
      existing.push(ep);
      grouped.set(ep.airDate, existing);
    }

    const result: ListItem[] = [];
    for (const [date, eps] of grouped) {
      result.push({ type: "header", date });
      for (const ep of eps) {
        result.push({ type: "episode", episode: ep });
      }
    }
    return result;
  }, [episodes]);

  const watchlistMap = useMemo(() => {
    const map = new Map<number, WatchlistItem>();
    for (const w of watchlist) {
      map.set(w.tmdbId, w);
    }
    return map;
  }, [watchlist]);

  const handleMarkWatched = useCallback(
    async (ep: UpcomingEpisode) => {
      if (!user?.uid) return;
      const wItem = watchlistMap.get(ep.tmdbShowId);
      if (!wItem) return;

      // For upcoming tab, mark the episode and advance
      // Next episode calculation is simplified here — the Cloud Function
      // could handle this, but we set null and let the watchlist listener update
      await markEpisodeWatched(
        user.uid,
        ep.tmdbShowId,
        ep.season,
        ep.episode,
        ep.episodeTitle,
        ep.runtime || 0,
        { season: ep.season, episode: ep.episode + 1 }, // Approximate next
        false
      );
    },
    [user?.uid, watchlistMap]
  );

  const handleStopWatching = useCallback(
    async (ep: UpcomingEpisode) => {
      if (!user?.uid) return;
      const wItem = watchlistMap.get(ep.tmdbShowId);
      if (!wItem) return;
      await stopWatching(user.uid, ep.tmdbShowId, wItem.status);
    },
    [user?.uid, watchlistMap]
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return "Today";
    if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "header") {
        return (
          <View style={styles.header}>
            <Text style={styles.headerText}>{formatDate(item.date)}</Text>
          </View>
        );
      }

      return (
        <EpisodeCard
          episode={item.episode}
          onSwipeLeft={() => handleMarkWatched(item.episode)}
          onSwipeRight={() => handleStopWatching(item.episode)}
          onPress={() =>
            navigation.navigate("ShowDetail", {
              tmdbId: item.episode.tmdbShowId,
              mediaType: "tv",
            })
          }
          onCheckmark={() => handleMarkWatched(item.episode)}
        />
      );
    },
    [handleMarkWatched, handleStopWatching, navigation]
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (listData.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No upcoming episodes</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={listData}
      keyExtractor={(item, index) =>
        item.type === "header"
          ? `header_${item.date}`
          : `ep_${item.episode.tmdbShowId}_${item.episode.season}_${item.episode.episode}`
      }
      renderItem={renderItem}
      style={styles.list}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  headerText: {
    ...typography.subtitle,
    color: colors.textSecondary,
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 1,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/src/screens/UpcomingTab.tsx
git commit -m "feat: implement Upcoming tab with date-grouped episode list"
```

---

### Task 13: Search & Discovery Screen

**Files:**
- Modify: `app/src/screens/SearchScreen.tsx`

**Interfaces:**
- Consumes: `useSearch()`, `useTrending()`, `addToWatchlist()`, navigation
- Produces: Search screen with trending default, search results, poster grid, tap to detail

- [ ] **Step 1: Implement SearchScreen.tsx**

```tsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSearch } from "../hooks/useSearch";
import { useTrending } from "../hooks/useTrending";
import { colors, spacing, typography, posterSize } from "../theme";
import { TMDBShow, SearchStackParamList, MediaType } from "../types";

type NavProp = NativeStackNavigationProp<SearchStackParamList, "SearchMain">;

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const navigation = useNavigation<NavProp>();

  const {
    data: searchData,
    isLoading: searchLoading,
    fetchNextPage,
    hasNextPage,
  } = useSearch(query);

  const { data: trending, isLoading: trendingLoading } = useTrending("tv");

  const displayData = query.length > 0 ? searchData?.results : trending;
  const isLoading = query.length > 0 ? searchLoading : trendingLoading;

  const handlePress = useCallback(
    (item: TMDBShow) => {
      const mediaType: MediaType =
        item.media_type || (item.title ? "movie" : "tv");
      navigation.navigate("ShowDetail", {
        tmdbId: item.id,
        mediaType,
      });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: TMDBShow }) => {
      const title = item.name || item.title || "";
      const year = (item.first_air_date || item.release_date || "").substring(
        0,
        4
      );

      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => handlePress(item)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: `${posterSize.medium}${item.poster_path}` }}
            style={styles.poster}
            contentFit="cover"
          />
          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>
          {year ? <Text style={styles.cardYear}>{year}</Text> : null}
        </TouchableOpacity>
      );
    },
    [handlePress]
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search shows & movies..."
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      {!query && (
        <Text style={styles.sectionTitle}>Trending</Text>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayData || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          onEndReached={() => {
            if (query && hasNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchInput: {
    backgroundColor: colors.surfaceLight,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    borderRadius: 8,
    ...typography.body,
  },
  sectionTitle: {
    ...typography.subtitle,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  grid: {
    paddingHorizontal: spacing.sm,
  },
  row: {
    justifyContent: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  card: {
    flex: 1,
    maxWidth: "32%",
  },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: 6,
    backgroundColor: colors.surface,
    width: "100%",
  },
  cardTitle: {
    ...typography.caption,
    color: colors.text,
    marginTop: spacing.xs,
  },
  cardYear: {
    ...typography.caption,
    fontSize: 11,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/src/screens/SearchScreen.tsx
git commit -m "feat: implement Search screen with trending and TMDB search"
```

---

### Task 14: Show Detail & Season Detail Screens

**Files:**
- Modify: `app/src/screens/ShowDetailScreen.tsx`
- Modify: `app/src/screens/SeasonDetailScreen.tsx`

**Interfaces:**
- Consumes: `useShowDetails()`, `useSeasonDetails()`, `useWatchlist()`, `useWatchedEpisodes()`, `addToWatchlist()`, `startRewatch()`, `resumeRewatch()`, `markEpisodeWatched()`
- Produces: Show info screen with poster, seasons list, add/rewatch buttons. Season detail with episode list and watched state.

- [ ] **Step 1: Implement ShowDetailScreen.tsx**

```tsx
import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { useShowDetails } from "../hooks/useShowDetails";
import { useWatchlist } from "../hooks/useWatchlist";
import { useAuthStore } from "../stores/authStore";
import {
  addToWatchlist,
  removeFromWatchlist,
  startRewatch,
  resumeRewatch,
} from "../services/firestore";
import { colors, spacing, typography, posterSize } from "../theme";
import { HomeStackParamList, TMDBSeason } from "../types";

type RouteParams = RouteProp<HomeStackParamList, "ShowDetail">;
type NavProp = NativeStackNavigationProp<HomeStackParamList, "ShowDetail">;

export default function ShowDetailScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation<NavProp>();
  const { tmdbId, mediaType } = route.params;
  const user = useAuthStore((s) => s.user);
  const { data: show, isLoading } = useShowDetails(tmdbId, mediaType);
  const { items: watchlist } = useWatchlist(user?.uid);

  const watchlistItem = useMemo(
    () => watchlist.find((w) => w.tmdbId === tmdbId),
    [watchlist, tmdbId]
  );

  const title = show?.name || show?.title || "";
  const year = (show?.first_air_date || show?.release_date || "").substring(
    0,
    4
  );

  const handleAddToWatchlist = useCallback(async () => {
    if (!user?.uid || !show) return;
    await addToWatchlist(
      user.uid,
      tmdbId,
      mediaType,
      title,
      show.poster_path || ""
    );
  }, [user?.uid, show, tmdbId, mediaType, title]);

  const handleRemove = useCallback(async () => {
    if (!user?.uid) return;
    await removeFromWatchlist(user.uid, tmdbId);
  }, [user?.uid, tmdbId]);

  const handleRewatch = useCallback(async () => {
    if (!user?.uid) return;
    if (watchlistItem?.status === "paused_rewatch") {
      await resumeRewatch(user.uid, tmdbId);
    } else {
      await startRewatch(user.uid, tmdbId);
    }
  }, [user?.uid, tmdbId, watchlistItem?.status]);

  const handleSeasonPress = useCallback(
    (season: TMDBSeason) => {
      navigation.navigate("SeasonDetail", {
        tmdbId,
        seasonNumber: season.season_number,
        showTitle: title,
      });
    },
    [navigation, tmdbId, title]
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!show) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load show</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Backdrop / Poster */}
      <Image
        source={{ uri: `${posterSize.large}${show.backdrop_path || show.poster_path}` }}
        style={styles.backdrop}
        contentFit="cover"
      />

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {year}
          {show.number_of_seasons
            ? ` · ${show.number_of_seasons} Season${show.number_of_seasons > 1 ? "s" : ""}`
            : ""}
          {show.vote_average ? ` · ★ ${show.vote_average.toFixed(1)}` : ""}
        </Text>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {!watchlistItem ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddToWatchlist}
            >
              <Text style={styles.buttonText}>+ Add to Watchlist</Text>
            </TouchableOpacity>
          ) : (
            <>
              {(watchlistItem.status === "completed" ||
                watchlistItem.status === "paused_rewatch") && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: colors.accent }]}
                  onPress={handleRewatch}
                >
                  <Text style={styles.buttonText}>
                    {watchlistItem.status === "paused_rewatch"
                      ? "Resume Rewatch"
                      : "Rewatch"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.addButton,
                  { backgroundColor: colors.destructiveRed },
                ]}
                onPress={handleRemove}
              >
                <Text style={styles.buttonText}>Remove</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Overview */}
        <Text style={styles.overview}>{show.overview}</Text>

        {/* Seasons */}
        {mediaType === "tv" && show.seasons && (
          <View style={styles.seasonsSection}>
            <Text style={styles.sectionTitle}>Seasons</Text>
            {show.seasons
              .filter((s) => s.season_number > 0)
              .map((season) => (
                <TouchableOpacity
                  key={season.id}
                  style={styles.seasonRow}
                  onPress={() => handleSeasonPress(season)}
                >
                  <Image
                    source={{
                      uri: `${posterSize.small}${season.poster_path || show.poster_path}`,
                    }}
                    style={styles.seasonPoster}
                    contentFit="cover"
                  />
                  <View style={styles.seasonInfo}>
                    <Text style={styles.seasonName}>{season.name}</Text>
                    <Text style={styles.seasonMeta}>
                      {season.episode_count} episodes
                      {season.air_date
                        ? ` · ${season.air_date.substring(0, 4)}`
                        : ""}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  backdrop: {
    width: "100%",
    height: 220,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    fontSize: 24,
  },
  meta: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  addButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.text,
  },
  overview: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    lineHeight: 22,
  },
  seasonsSection: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 18,
    marginBottom: spacing.md,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  seasonPoster: {
    width: 45,
    height: 67,
    borderRadius: 4,
  },
  seasonInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  seasonName: {
    ...typography.subtitle,
    fontSize: 14,
  },
  seasonMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  chevron: {
    ...typography.title,
    color: colors.textMuted,
  },
});
```

- [ ] **Step 2: Implement SeasonDetailScreen.tsx**

```tsx
import React, { useMemo, useCallback } from "react";
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { RouteProp } from "@react-navigation/native";
import { useSeasonDetails } from "../hooks/useSeasonDetails";
import { useWatchedEpisodes } from "../hooks/useWatchedEpisodes";
import { useWatchlist } from "../hooks/useWatchlist";
import { useAuthStore } from "../stores/authStore";
import { markEpisodeWatched } from "../services/firestore";
import { getSeasonDetails as fetchSeason } from "../services/functions";
import { colors, spacing, typography } from "../theme";
import { HomeStackParamList, TMDBEpisode } from "../types";

type RouteParams = RouteProp<HomeStackParamList, "SeasonDetail">;

export default function SeasonDetailScreen() {
  const route = useRoute<RouteParams>();
  const { tmdbId, seasonNumber, showTitle } = route.params;
  const user = useAuthStore((s) => s.user);
  const { data: seasonData, isLoading } = useSeasonDetails(tmdbId, seasonNumber);
  const { episodes: watchedEps } = useWatchedEpisodes(user?.uid, tmdbId);
  const { items: watchlist } = useWatchlist(user?.uid);

  const watchlistItem = useMemo(
    () => watchlist.find((w) => w.tmdbId === tmdbId),
    [watchlist, tmdbId]
  );

  const watchedSet = useMemo(() => {
    const set = new Set<string>();
    for (const ep of watchedEps) {
      if (ep.season === seasonNumber) {
        set.add(`${ep.season}_${ep.episode}`);
      }
    }
    return set;
  }, [watchedEps, seasonNumber]);

  const handleMarkWatched = useCallback(
    async (ep: TMDBEpisode) => {
      if (!user?.uid || !watchlistItem) return;

      const episodes = seasonData?.episodes || [];
      const nextEpInSeason = episodes.find(
        (e: TMDBEpisode) => e.episode_number === ep.episode_number + 1
      );

      let nextEpisode: { season: number; episode: number } | null = null;
      let isComplete = false;

      if (nextEpInSeason) {
        nextEpisode = {
          season: seasonNumber,
          episode: nextEpInSeason.episode_number,
        };
      } else {
        try {
          const nextSeasonData = await fetchSeason(tmdbId, seasonNumber + 1);
          const ns = nextSeasonData as { episodes: Array<{ episode_number: number }> };
          if (ns.episodes?.length > 0) {
            nextEpisode = { season: seasonNumber + 1, episode: 1 };
          } else {
            isComplete = true;
          }
        } catch {
          isComplete = true;
        }
      }

      await markEpisodeWatched(
        user.uid,
        tmdbId,
        seasonNumber,
        ep.episode_number,
        ep.name,
        ep.runtime || 0,
        nextEpisode,
        isComplete
      );
    },
    [user?.uid, watchlistItem, seasonData, tmdbId, seasonNumber]
  );

  const renderEpisode = useCallback(
    ({ item }: { item: TMDBEpisode }) => {
      const isWatched = watchedSet.has(`${seasonNumber}_${item.episode_number}`);
      const watchedEp = watchedEps.find(
        (e) => e.season === seasonNumber && e.episode === item.episode_number
      );

      return (
        <View style={styles.episodeRow}>
          <View style={styles.episodeInfo}>
            <Text style={styles.episodeNumber}>
              E{String(item.episode_number).padStart(2, "0")}
            </Text>
            <View style={styles.episodeText}>
              <Text style={styles.episodeName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.air_date && (
                <Text style={styles.episodeMeta}>{item.air_date}</Text>
              )}
              {watchedEp && watchedEp.watchCount > 1 && (
                <Text style={styles.rewatchBadge}>
                  Watched {watchedEp.watchCount}x
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.checkmark,
              isWatched && styles.checkmarkWatched,
            ]}
            onPress={() => handleMarkWatched(item)}
          >
            <Text
              style={[
                styles.checkmarkText,
                isWatched && styles.checkmarkTextWatched,
              ]}
            >
              ✓
            </Text>
          </TouchableOpacity>
        </View>
      );
    },
    [watchedSet, watchedEps, seasonNumber, handleMarkWatched]
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={seasonData?.episodes || []}
      keyExtractor={(item) => String(item.episode_number)}
      renderItem={renderEpisode}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  episodeInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  episodeNumber: {
    ...typography.subtitle,
    color: colors.textMuted,
    width: 35,
  },
  episodeText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  episodeName: {
    ...typography.body,
  },
  episodeMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  rewatchBadge: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  checkmark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkWatched: {
    backgroundColor: colors.watchedGreen,
    borderColor: colors.watchedGreen,
  },
  checkmarkText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  checkmarkTextWatched: {
    color: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/ShowDetailScreen.tsx app/src/screens/SeasonDetailScreen.tsx
git commit -m "feat: implement ShowDetail and SeasonDetail screens"
```

---

### Task 15: Calendar Screen

**Files:**
- Modify: `app/src/screens/CalendarScreen.tsx`

**Interfaces:**
- Consumes: `useWatchlist()`, `useUpcomingEpisodes()`, `useAuthStore()`, navigation
- Produces: Monthly calendar with dots on days that have episodes, tap day to see episode list

- [ ] **Step 1: Install react-native-calendars**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app
npx expo install react-native-calendars
```

- [ ] **Step 2: Implement CalendarScreen.tsx**

```tsx
import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { useAuthStore } from "../stores/authStore";
import { useWatchlist } from "../hooks/useWatchlist";
import { useUpcomingEpisodes } from "../hooks/useUpcomingEpisodes";
import { colors, spacing, typography, posterSize } from "../theme";
import { UpcomingEpisode, CalendarStackParamList } from "../types";

type NavProp = NativeStackNavigationProp<CalendarStackParamList, "CalendarMain">;

export default function CalendarScreen() {
  const user = useAuthStore((s) => s.user);
  const { items: watchlist } = useWatchlist(user?.uid);
  const navigation = useNavigation<NavProp>();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const tvShowIds = useMemo(
    () =>
      watchlist
        .filter(
          (w) =>
            w.mediaType === "tv" &&
            (w.status === "watching" || w.status === "rewatching")
        )
        .map((w) => w.tmdbId),
    [watchlist]
  );

  const { data: episodes } = useUpcomingEpisodes(tvShowIds);

  // Build marked dates for calendar
  const markedDates = useMemo(() => {
    const marks: Record<
      string,
      { marked: boolean; dotColor: string; selected?: boolean; selectedColor?: string }
    > = {};
    if (!episodes) return marks;

    for (const ep of episodes) {
      marks[ep.airDate] = {
        marked: true,
        dotColor: colors.primary,
      };
    }

    if (selectedDate && marks[selectedDate]) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
        selectedColor: colors.primary,
      };
    } else if (selectedDate) {
      marks[selectedDate] = {
        marked: false,
        dotColor: colors.primary,
        selected: true,
        selectedColor: colors.surfaceLight,
      };
    }

    return marks;
  }, [episodes, selectedDate]);

  // Episodes for selected date
  const selectedEpisodes = useMemo(() => {
    if (!selectedDate || !episodes) return [];
    return episodes.filter((ep) => ep.airDate === selectedDate);
  }, [episodes, selectedDate]);

  const handleDayPress = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
  }, []);

  const renderEpisode = useCallback(
    ({ item }: { item: UpcomingEpisode }) => (
      <TouchableOpacity
        style={styles.episodeRow}
        onPress={() =>
          navigation.navigate("ShowDetail", {
            tmdbId: item.tmdbShowId,
            mediaType: "tv",
          })
        }
      >
        <Image
          source={{ uri: `${posterSize.small}${item.posterPath}` }}
          style={styles.poster}
          contentFit="cover"
        />
        <View style={styles.epInfo}>
          <Text style={styles.showTitle} numberOfLines={1}>
            {item.showTitle}
          </Text>
          <Text style={styles.epLabel}>
            S{String(item.season).padStart(2, "0")}E
            {String(item.episode).padStart(2, "0")}
          </Text>
          <Text style={styles.epTitle} numberOfLines={1}>
            {item.episodeTitle}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [navigation]
  );

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={handleDayPress}
        markedDates={markedDates}
        theme={{
          backgroundColor: colors.background,
          calendarBackground: colors.background,
          textSectionTitleColor: colors.textSecondary,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: colors.text,
          todayTextColor: colors.primary,
          dayTextColor: colors.text,
          textDisabledColor: colors.textMuted,
          monthTextColor: colors.text,
          arrowColor: colors.primary,
        }}
      />

      {selectedDate && (
        <View style={styles.episodeList}>
          <Text style={styles.dateHeader}>
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          {selectedEpisodes.length === 0 ? (
            <Text style={styles.noEps}>No episodes on this day</Text>
          ) : (
            <FlatList
              data={selectedEpisodes}
              keyExtractor={(item) =>
                `${item.tmdbShowId}_${item.season}_${item.episode}`
              }
              renderItem={renderEpisode}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  episodeList: {
    flex: 1,
    paddingTop: spacing.md,
  },
  dateHeader: {
    ...typography.subtitle,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  noEps: {
    ...typography.caption,
    paddingHorizontal: spacing.lg,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  poster: {
    width: 45,
    height: 67,
    borderRadius: 4,
  },
  epInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  showTitle: {
    ...typography.subtitle,
    fontSize: 14,
  },
  epLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  epTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: 13,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/CalendarScreen.tsx app/package.json
git commit -m "feat: implement Calendar screen with monthly view and episode list"
```

---

### Task 16: Profile Screen

**Files:**
- Modify: `app/src/screens/ProfileScreen.tsx`

**Interfaces:**
- Consumes: `useAuthStore()`, `useUserStats()`, `useWatchlist()`, navigation
- Produces: Profile with avatar, stats, completed shows, sign out

- [ ] **Step 1: Implement ProfileScreen.tsx**

```tsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useAuthStore } from "../stores/authStore";
import { useUserStats } from "../hooks/useUserStats";
import { useWatchlist } from "../hooks/useWatchlist";
import { colors, spacing, typography, posterSize } from "../theme";

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { stats } = useUserStats(user?.uid);
  const { items: watchlist } = useWatchlist(user?.uid);

  const completedShows = useMemo(
    () => watchlist.filter((w) => w.status === "completed"),
    [watchlist]
  );

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        {user?.photoURL ? (
          <Image
            source={{ uri: user.photoURL }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {(user?.displayName || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.name}>{user?.displayName || "User"}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.episodesWatched}</Text>
          <Text style={styles.statLabel}>Episodes</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.showsTracking}</Text>
          <Text style={styles.statLabel}>Tracking</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>
            {formatTime(stats.totalMinutes)}
          </Text>
          <Text style={styles.statLabel}>Watch Time</Text>
        </View>
      </View>

      {/* Completed Shows */}
      {completedShows.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Completed ({completedShows.length})
          </Text>
          <View style={styles.completedGrid}>
            {completedShows.map((show) => (
              <Image
                key={show.id}
                source={{ uri: `${posterSize.small}${show.posterPath}` }}
                style={styles.completedPoster}
                contentFit="cover"
              />
            ))}
          </View>
        </View>
      )}

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...typography.title,
    fontSize: 32,
  },
  name: {
    ...typography.title,
    marginTop: spacing.md,
  },
  email: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  statBox: {
    alignItems: "center",
  },
  statNumber: {
    ...typography.title,
    fontSize: 20,
  },
  statLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.subtitle,
    marginBottom: spacing.md,
  },
  completedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  completedPoster: {
    width: 70,
    height: 105,
    borderRadius: 4,
  },
  signOutButton: {
    marginTop: spacing.xxl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xxl * 2,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 8,
    alignItems: "center",
  },
  signOutText: {
    ...typography.subtitle,
    color: colors.destructiveRed,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/src/screens/ProfileScreen.tsx
git commit -m "feat: implement Profile screen with stats and completed shows"
```

---

### Task 17: Final Integration & Cleanup

**Files:**
- Modify: `app/App.tsx` — ensure all imports correct
- Modify: `app/src/navigation/AppNavigator.tsx` — replace emoji icons with proper icon library
- Update: `.gitignore` — add Expo/RN specific ignores

**Interfaces:**
- Consumes: All prior tasks
- Produces: Fully integrated, buildable app

- [ ] **Step 1: Install vector icons**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app
npx expo install @expo/vector-icons
```

- [ ] **Step 2: Update AppNavigator.tsx — replace emoji icons**

Replace the `TabIcon` component and its usage:

```tsx
import { Ionicons } from "@expo/vector-icons";

// Remove the TabIcon component entirely.
// Update the Tab.Navigator screenOptions:

<Tab.Navigator
  screenOptions={({ route }) => ({
    headerShown: false,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
    },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarIcon: ({ color, size }) => {
      const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
        Home: "home",
        Search: "search",
        Calendar: "calendar",
        Profile: "person",
      };
      return (
        <Ionicons
          name={icons[route.name] || "ellipse"}
          size={size}
          color={color}
        />
      );
    },
  })}
>
```

Remove the `Text` import if no longer needed.

- [ ] **Step 3: Update .gitignore for Expo/RN**

Append to existing `.gitignore`:

```
# Expo
.expo/
dist/
web-build/
expo-env.d.ts

# Native builds
app/ios/
app/android/

# Firebase
.firebase/
functions/lib/
```

- [ ] **Step 4: Verify full project compiles**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions && npm run build
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit
```

Expected: Both compile with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: final integration — icons, gitignore, and build verification"
```
