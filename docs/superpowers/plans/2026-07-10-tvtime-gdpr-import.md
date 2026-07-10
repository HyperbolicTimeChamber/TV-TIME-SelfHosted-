# TV Time GDPR Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import TV Time GDPR export data (shows, episodes, movies) into the app's Firestore database.

**Architecture:** New service `tvtimeImport.ts` handles CSV parsing + TMDB matching + Firestore batch writes. New screen `ImportDataScreen.tsx` drives 4-phase UI (pick file → match → disambiguate/review → upload). Integrated into onboarding after API key setup and accessible from Profile.

**Tech Stack:** expo-document-picker, jszip, papaparse, existing Firestore + TMDB services

## Global Constraints

- Expo 57, React Native 0.86, RNFirebase v25 (modular API)
- No Cloud Functions — all TMDB calls direct from client
- TMDB rate limit: batch 50 requests, 1 second pause between batches
- Firestore batch limit: 500 operations per batch
- Follow existing theme (`colors`, `spacing`, `typography` from `../theme`)
- Follow existing patterns (zustand stores, axios for TMDB, firestore namespaced API)

---

### Task 1: Install Dependencies

**Files:**
- Modify: `app/package.json`

**Interfaces:**
- Produces: `expo-document-picker`, `jszip`, `papaparse`, `@types/papaparse` available as imports

- [ ] **Step 1: Install packages**

```bash
cd app && npx expo install expo-document-picker && npm install jszip papaparse && npm install -D @types/papaparse
```

- [ ] **Step 2: Verify installation**

```bash
cd app && node -e "require('jszip'); require('papaparse'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "chore: add expo-document-picker, jszip, papaparse for GDPR import"
```

---

### Task 2: CSV Parsing Service

**Files:**
- Create: `app/src/services/tvtimeImport.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `parseGdprZip(uri: string): Promise<ParsedGdprData>`
  - `ParsedGdprData { shows: ParsedShow[], watchedEpisodes: ParsedEpisode[], rewatchedEpisodes: ParsedEpisode[], movies: ParsedMovie[] }`
  - `ParsedShow { tvTimeId: number, name: string, isArchived: boolean, isForLater: boolean, followedAt: string | null, rewatchCount: number, epWatchCount: number }`
  - `ParsedEpisode { tvTimeShowId: number, showName: string, season: number, episode: number, watchedAt: string }`
  - `ParsedMovie { name: string, watchedAt: string, runtimeSeconds: number, releaseDate: string }`

- [ ] **Step 1: Create the parsing service**

Create `app/src/services/tvtimeImport.ts`:

```typescript
import JSZip from "jszip";
import Papa from "papaparse";
import * as FileSystem from "expo-file-system";

// --- Parsed types ---

export interface ParsedShow {
  tvTimeId: number;
  name: string;
  isArchived: boolean;
  isForLater: boolean;
  followedAt: string | null;
  rewatchCount: number;
  epWatchCount: number;
}

export interface ParsedEpisode {
  tvTimeShowId: number;
  showName: string;
  season: number;
  episode: number;
  watchedAt: string;
}

export interface ParsedMovie {
  name: string;
  watchedAt: string;
  runtimeSeconds: number;
  releaseDate: string;
}

export interface ParsedGdprData {
  shows: ParsedShow[];
  watchedEpisodes: ParsedEpisode[];
  rewatchedEpisodes: ParsedEpisode[];
  movies: ParsedMovie[];
}

// --- CSV row types (raw) ---

interface V2Row {
  key: string;
  s_id: string;
  season_number: string;
  episode_number: string;
  created_at: string;
  series_name: string;
  is_archived: string;
  is_for_later: string;
  followed_at: string;
  rewatch_count: string;
  ep_watch_count: string;
}

interface V1Row {
  type: string;
  entity_type: string;
  movie_name: string;
  created_at: string;
  runtime: string;
  release_date: string;
}

// --- Parsing ---

async function readCsvFromZip(zip: JSZip, filename: string): Promise<string> {
  const file = zip.file(filename);
  if (!file) throw new Error(`Missing ${filename} in zip`);
  return file.async("string");
}

function parseCsv<T>(csvString: string): T[] {
  const result = Papa.parse<T>(csvString, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

function parseV2Shows(rows: V2Row[]): ParsedShow[] {
  return rows
    .filter((r) => r.key.startsWith("user-series-"))
    .map((r) => ({
      tvTimeId: parseInt(r.s_id, 10),
      name: r.series_name,
      isArchived: r.is_archived === "true",
      isForLater: r.is_for_later === "true",
      followedAt: r.followed_at || null,
      rewatchCount: parseInt(r.rewatch_count, 10) || 0,
      epWatchCount: parseInt(r.ep_watch_count, 10) || 0,
    }));
}

function parseV2Episodes(rows: V2Row[], prefix: string): ParsedEpisode[] {
  return rows
    .filter((r) => r.key.startsWith(prefix))
    .filter((r) => r.season_number && r.episode_number)
    .map((r) => ({
      tvTimeShowId: parseInt(r.s_id, 10),
      showName: r.series_name,
      season: parseInt(r.season_number, 10),
      episode: parseInt(r.episode_number, 10),
      watchedAt: r.created_at,
    }));
}

function parseV1Movies(rows: V1Row[]): ParsedMovie[] {
  return rows
    .filter((r) => r.type === "watch" && r.entity_type === "movie")
    .filter((r) => r.movie_name)
    .map((r) => ({
      name: r.movie_name,
      watchedAt: r.created_at,
      runtimeSeconds: parseInt(r.runtime, 10) || 0,
      releaseDate: r.release_date || "",
    }));
}

export async function parseGdprZip(uri: string): Promise<ParsedGdprData> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const v2Csv = await readCsvFromZip(zip, "tracking-prod-records-v2.csv");
  const v2Rows = parseCsv<V2Row>(v2Csv);

  const v1Csv = await readCsvFromZip(zip, "tracking-prod-records.csv");
  const v1Rows = parseCsv<V1Row>(v1Csv);

  return {
    shows: parseV2Shows(v2Rows),
    watchedEpisodes: parseV2Episodes(v2Rows, "watch-episode-"),
    rewatchedEpisodes: parseV2Episodes(v2Rows, "rewatch-episode-"),
    movies: parseV1Movies(v1Rows),
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd app && npx tsc --noEmit src/services/tvtimeImport.ts 2>&1 | head -20
```

Expected: no errors (or only unrelated errors from other files). If `expo-file-system` is not found, it's bundled with Expo 57 — check with `npx expo install expo-file-system`.

- [ ] **Step 3: Commit**

```bash
git add app/src/services/tvtimeImport.ts
git commit -m "feat(import): add GDPR zip CSV parsing service"
```

---

### Task 3: TMDB Matching Service

**Files:**
- Modify: `app/src/services/tvtimeImport.ts`

**Interfaces:**
- Consumes: `ParsedGdprData`, `ParsedShow`, `ParsedMovie`
- Produces:
  - `TMDBMatch { tvTimeName: string, tmdbId: number, tmdbName: string, posterPath: string | null, mediaType: "tv" | "movie", year: string, overview: string, totalEpisodes: number | null }`
  - `MatchResult { matched: TMDBMatch[], ambiguous: AmbiguousMatch[], unmatched: string[] }`
  - `AmbiguousMatch { tvTimeName: string, candidates: TMDBMatch[] }`
  - `matchShowsAndMovies(apiKey: string, shows: ParsedShow[], movies: ParsedMovie[], onProgress: (done: number, total: number) => void): Promise<MatchResult>`

- [ ] **Step 1: Add TMDB matching types and function**

Append to `app/src/services/tvtimeImport.ts`:

```typescript
import axios from "axios";

// --- TMDB Matching ---

export interface TMDBMatch {
  tvTimeName: string;
  tmdbId: number;
  tmdbName: string;
  posterPath: string | null;
  mediaType: "tv" | "movie";
  year: string;
  overview: string;
  totalEpisodes: number | null;
}

export interface AmbiguousMatch {
  tvTimeName: string;
  mediaType: "tv" | "movie";
  candidates: TMDBMatch[];
}

export interface MatchResult {
  matched: TMDBMatch[];
  ambiguous: AmbiguousMatch[];
  unmatched: string[];
}

const TMDB_BASE = "https://api.themoviedb.org/3";
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchTMDB(
  apiKey: string,
  name: string,
  mediaType: "tv" | "movie"
): Promise<TMDBMatch[]> {
  try {
    const res = await axios.get(`${TMDB_BASE}/search/${mediaType}`, {
      params: { api_key: apiKey, query: name, page: 1 },
    });
    const results = res.data.results || [];
    return results.slice(0, 5).map((r: any) => ({
      tvTimeName: name,
      tmdbId: r.id,
      tmdbName: mediaType === "tv" ? r.name : r.title,
      posterPath: r.poster_path,
      mediaType,
      year: (mediaType === "tv" ? r.first_air_date : r.release_date || "").slice(0, 4),
      overview: (r.overview || "").slice(0, 120),
      totalEpisodes: r.number_of_episodes ?? null,
    }));
  } catch (err: any) {
    if (err?.response?.status === 429) {
      const retryAfter = parseInt(err.response.headers["retry-after"] || "10", 10);
      await delay(retryAfter * 1000);
      return searchTMDB(apiKey, name, mediaType);
    }
    return [];
  }
}

interface MatchItem {
  name: string;
  mediaType: "tv" | "movie";
}

export async function matchShowsAndMovies(
  apiKey: string,
  shows: ParsedShow[],
  movies: ParsedMovie[],
  onProgress: (done: number, total: number) => void
): Promise<MatchResult> {
  // Deduplicate names
  const showNames = [...new Set(shows.map((s) => s.name))];
  const movieNames = [...new Set(movies.map((m) => m.name))];

  const items: MatchItem[] = [
    ...showNames.map((n) => ({ name: n, mediaType: "tv" as const })),
    ...movieNames.map((n) => ({ name: n, mediaType: "movie" as const })),
  ];

  const matched: TMDBMatch[] = [];
  const ambiguous: AmbiguousMatch[] = [];
  const unmatched: string[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((item) => searchTMDB(apiKey, item.name, item.mediaType))
    );

    for (let j = 0; j < batch.length; j++) {
      const candidates = results[j];
      const item = batch[j];
      if (candidates.length === 0) {
        unmatched.push(item.name);
      } else if (candidates.length === 1) {
        matched.push(candidates[0]);
      } else {
        // Check if first result is exact name match — auto-select
        const exactMatch = candidates.find(
          (c) => c.tmdbName.toLowerCase() === item.name.toLowerCase()
        );
        if (exactMatch) {
          matched.push(exactMatch);
        } else {
          ambiguous.push({
            tvTimeName: item.name,
            mediaType: item.mediaType,
            candidates,
          });
        }
      }
    }

    onProgress(Math.min(i + BATCH_SIZE, items.length), items.length);

    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < items.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  return { matched, ambiguous, unmatched };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | grep tvtimeImport || echo "No errors"
```

- [ ] **Step 3: Commit**

```bash
git add app/src/services/tvtimeImport.ts
git commit -m "feat(import): add TMDB batch matching for shows and movies"
```

---

### Task 4: Firestore Import Service

**Files:**
- Modify: `app/src/services/tvtimeImport.ts`

**Interfaces:**
- Consumes: `TMDBMatch`, `ParsedShow`, `ParsedEpisode`, `ParsedMovie`, Firestore types from `firestore.ts`
- Produces:
  - `ImportStats { showsImported: number, moviesImported: number, episodesImported: number, minutesImported: number, skipped: number }`
  - `importToFirestore(userId: string, selectedMatches: TMDBMatch[], shows: ParsedShow[], watchedEpisodes: ParsedEpisode[], rewatchedEpisodes: ParsedEpisode[], movies: ParsedMovie[], onProgress: (done: number, total: number) => void): Promise<ImportStats>`

- [ ] **Step 1: Add Firestore import function**

Append to `app/src/services/tvtimeImport.ts`:

```typescript
import firestore from "@react-native-firebase/firestore";
import { WatchStatus } from "../types";

// --- Firestore Import ---

export interface ImportStats {
  showsImported: number;
  moviesImported: number;
  episodesImported: number;
  minutesImported: number;
  skipped: number;
}

function episodeDocId(tmdbShowId: number, season: number, episode: number) {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return `${tmdbShowId}_S${s}E${e}`;
}

function deriveStatus(show: ParsedShow): WatchStatus {
  if (show.isArchived) return "completed";
  if (show.isForLater) return "plan_to_watch";
  return "watching";
}

function parseTimestamp(dateStr: string | null): FirebaseFirestoreTypes.Timestamp | null {
  if (!dateStr || dateStr === "0001-01-01 00:00:00") return null;
  const ms = new Date(dateStr).getTime();
  if (isNaN(ms)) return null;
  return firestore.Timestamp.fromMillis(ms);
}

export async function importToFirestore(
  userId: string,
  selectedMatches: TMDBMatch[],
  shows: ParsedShow[],
  watchedEpisodes: ParsedEpisode[],
  rewatchedEpisodes: ParsedEpisode[],
  movies: ParsedMovie[],
  onProgress: (done: number, total: number) => void
): Promise<ImportStats> {
  const db = firestore();
  const userRef = db.collection("users").doc(userId);
  const watchlistRef = userRef.collection("watchlist");
  const watchedEpRef = userRef.collection("watchedEpisodes");

  const stats: ImportStats = {
    showsImported: 0,
    moviesImported: 0,
    episodesImported: 0,
    minutesImported: 0,
    skipped: 0,
  };

  // Build tvTimeName → TMDBMatch lookup
  const matchByName = new Map<string, TMDBMatch>();
  for (const m of selectedMatches) {
    matchByName.set(m.tvTimeName, m);
  }

  // Build tvTimeId → TMDBMatch lookup for episodes
  const showById = new Map<number, ParsedShow>();
  for (const s of shows) showById.set(s.tvTimeId, s);

  const matchByTvTimeId = new Map<number, TMDBMatch>();
  for (const s of shows) {
    const match = matchByName.get(s.name);
    if (match) matchByTvTimeId.set(s.tvTimeId, match);
  }

  // Collect all operations as { ref, data } pairs
  type WriteOp = { ref: FirebaseFirestoreTypes.DocumentReference; data: Record<string, any>; isNew: boolean };
  const ops: WriteOp[] = [];

  // --- Watchlist: Shows ---
  const selectedShowMatches = selectedMatches.filter((m) => m.mediaType === "tv");
  for (const match of selectedShowMatches) {
    const show = shows.find((s) => s.name === match.tvTimeName);
    if (!show) continue;
    const status = deriveStatus(show);
    const addedAt = parseTimestamp(show.followedAt) || firestore.Timestamp.now();

    // Find latest watched episode date for this show
    const showEps = watchedEpisodes.filter((e) => e.tvTimeShowId === show.tvTimeId);
    let lastWatchedAt: FirebaseFirestoreTypes.Timestamp | null = null;
    if (showEps.length > 0) {
      const latest = showEps.reduce((a, b) =>
        new Date(a.watchedAt) > new Date(b.watchedAt) ? a : b
      );
      lastWatchedAt = parseTimestamp(latest.watchedAt);
    }

    ops.push({
      ref: watchlistRef.doc(String(match.tmdbId)),
      data: {
        tmdbId: match.tmdbId,
        mediaType: "tv",
        title: match.tmdbName,
        posterPath: match.posterPath || "",
        addedAt,
        lastWatchedAt,
        status,
        nextEpisode: null,
        rewatchCount: show.rewatchCount,
        totalEpisodes: match.totalEpisodes ?? null,
      },
      isNew: true,
    });
  }

  // --- Watchlist: Movies ---
  const selectedMovieMatches = selectedMatches.filter((m) => m.mediaType === "movie");
  for (const match of selectedMovieMatches) {
    const movie = movies.find((m) => m.name === match.tvTimeName);
    if (!movie) continue;
    const watchedAt = parseTimestamp(movie.watchedAt) || firestore.Timestamp.now();
    const runtimeMin = Math.round(movie.runtimeSeconds / 60);

    ops.push({
      ref: watchlistRef.doc(String(match.tmdbId)),
      data: {
        tmdbId: match.tmdbId,
        mediaType: "movie",
        title: match.tmdbName,
        posterPath: match.posterPath || "",
        addedAt: watchedAt,
        lastWatchedAt: watchedAt,
        status: "completed" as WatchStatus,
        nextEpisode: null,
        rewatchCount: 0,
        totalEpisodes: null,
      },
      isNew: true,
    });

    stats.minutesImported += runtimeMin;
  }

  // --- Watched Episodes ---
  // Merge watch + rewatch into per-episode counts
  const epCountMap = new Map<string, { season: number; episode: number; tmdbShowId: number; firstWatched: string; lastWatched: string; count: number }>();

  for (const ep of watchedEpisodes) {
    const match = matchByTvTimeId.get(ep.tvTimeShowId);
    if (!match) continue;
    const key = episodeDocId(match.tmdbId, ep.season, ep.episode);
    const existing = epCountMap.get(key);
    if (existing) {
      existing.count++;
      if (new Date(ep.watchedAt) < new Date(existing.firstWatched)) existing.firstWatched = ep.watchedAt;
      if (new Date(ep.watchedAt) > new Date(existing.lastWatched)) existing.lastWatched = ep.watchedAt;
    } else {
      epCountMap.set(key, {
        season: ep.season,
        episode: ep.episode,
        tmdbShowId: match.tmdbId,
        firstWatched: ep.watchedAt,
        lastWatched: ep.watchedAt,
        count: 1,
      });
    }
  }

  for (const ep of rewatchedEpisodes) {
    const match = matchByTvTimeId.get(ep.tvTimeShowId);
    if (!match) continue;
    const key = episodeDocId(match.tmdbId, ep.season, ep.episode);
    const existing = epCountMap.get(key);
    if (existing) {
      existing.count++;
      if (new Date(ep.watchedAt) > new Date(existing.lastWatched)) existing.lastWatched = ep.watchedAt;
    } else {
      epCountMap.set(key, {
        season: ep.season,
        episode: ep.episode,
        tmdbShowId: match.tmdbId,
        firstWatched: ep.watchedAt,
        lastWatched: ep.watchedAt,
        count: 1,
      });
    }
  }

  for (const [docId, ep] of epCountMap) {
    ops.push({
      ref: watchedEpRef.doc(docId),
      data: {
        tmdbShowId: ep.tmdbShowId,
        season: ep.season,
        episode: ep.episode,
        episodeTitle: "",
        watchedAt: parseTimestamp(ep.firstWatched) || firestore.Timestamp.now(),
        lastWatchedAt: parseTimestamp(ep.lastWatched) || firestore.Timestamp.now(),
        runtime: 0,
        watchCount: ep.count,
      },
      isNew: true,
    });
  }

  // --- Execute batched writes (skip existing docs) ---
  const totalOps = ops.length;
  let done = 0;

  // Check which docs already exist (batch get in chunks of 100)
  const existingDocs = new Set<string>();
  for (let i = 0; i < ops.length; i += 100) {
    const chunk = ops.slice(i, i + 100);
    const snapshots = await Promise.all(chunk.map((op) => op.ref.get()));
    for (const snap of snapshots) {
      if (snap.exists()) existingDocs.add(snap.ref.path);
    }
  }

  // Write in Firestore batches of 500
  const BATCH_LIMIT = 500;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    let batchCount = 0;
    const chunk = ops.slice(i, i + BATCH_LIMIT);

    for (const op of chunk) {
      if (existingDocs.has(op.ref.path)) {
        stats.skipped++;
      } else {
        batch.set(op.ref, op.data);
        batchCount++;
        // Count stats
        if (op.data.mediaType === "tv" && op.data.status) stats.showsImported++;
        else if (op.data.mediaType === "movie") stats.moviesImported++;
        else if (op.data.tmdbShowId && op.data.season !== undefined) stats.episodesImported++;
      }
    }

    if (batchCount > 0) await batch.commit();
    done += chunk.length;
    onProgress(done, totalOps);
  }

  // --- Update user stats ---
  const watchingCount = selectedShowMatches.filter((m) => {
    const show = shows.find((s) => s.name === m.tvTimeName);
    return show && deriveStatus(show) === "watching";
  }).length;

  await userRef.update({
    "stats.episodesWatched": firestore.FieldValue.increment(stats.episodesImported + stats.moviesImported),
    "stats.showsTracking": firestore.FieldValue.increment(watchingCount),
    "stats.totalMinutes": firestore.FieldValue.increment(stats.minutesImported),
  });

  return stats;
}
```

Note: add `import { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";` to the existing imports at top of file.

- [ ] **Step 2: Verify it compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | grep tvtimeImport || echo "No errors"
```

- [ ] **Step 3: Commit**

```bash
git add app/src/services/tvtimeImport.ts
git commit -m "feat(import): add Firestore batch import with conflict detection"
```

---

### Task 5: Import Data Screen

**Files:**
- Create: `app/src/screens/ImportDataScreen.tsx`

**Interfaces:**
- Consumes: `parseGdprZip`, `matchShowsAndMovies`, `importToFirestore`, `TMDBMatch`, `AmbiguousMatch`, `ParsedGdprData`, `ImportStats` from `tvtimeImport.ts`
- Produces: Screen component `ImportDataScreen` with 4-phase UI

This is a large screen. It manages internal phase state and renders different views for each phase.

- [ ] **Step 1: Create the screen**

Create `app/src/screens/ImportDataScreen.tsx`:

```tsx
import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import { useAuthStore } from "../stores/authStore";
import {
  parseGdprZip,
  matchShowsAndMovies,
  importToFirestore,
  ParsedGdprData,
  TMDBMatch,
  AmbiguousMatch,
  ImportStats,
} from "../services/tvtimeImport";
import { colors, spacing, typography, posterSize } from "../theme";

type Phase =
  | "pick"
  | "matching"
  | "disambiguate"
  | "review"
  | "importing"
  | "done";

export default function ImportDataScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const tmdbApiKey = useAuthStore((s) => s.tmdbApiKey);

  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [statusText, setStatusText] = useState("");

  // Parsed data
  const parsedRef = useRef<ParsedGdprData | null>(null);

  // Match results
  const [matched, setMatched] = useState<TMDBMatch[]>([]);
  const [ambiguous, setAmbiguous] = useState<AmbiguousMatch[]>([]);
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);

  // Disambiguation
  const [disambigIndex, setDisambigIndex] = useState(0);

  // Review selections
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Import stats
  const [importStats, setImportStats] = useState<ImportStats | null>(null);

  // --- Phase 1: Pick file ---
  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/zip",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setPhase("matching");
      setStatusText("Extracting data...");

      const uri = result.assets[0].uri;
      const parsed = await parseGdprZip(uri);
      parsedRef.current = parsed;

      setStatusText("Matching with TMDB...");
      const matchResult = await matchShowsAndMovies(
        tmdbApiKey!,
        parsed.shows,
        parsed.movies,
        (done, total) => setProgress({ done, total })
      );

      setMatched(matchResult.matched);
      setAmbiguous(matchResult.ambiguous);
      setUnmatchedNames(matchResult.unmatched);

      if (matchResult.ambiguous.length > 0) {
        setDisambigIndex(0);
        setPhase("disambiguate");
      } else {
        // Pre-select all matched
        setSelected(new Set(matchResult.matched.map((m) => m.tvTimeName)));
        setPhase("review");
      }
    } catch (err: any) {
      Alert.alert("Import Error", err.message || "Failed to parse zip file.");
      setPhase("pick");
    }
  }, [tmdbApiKey]);

  // --- Phase 2.5: Disambiguation ---
  const handleDisambiguate = useCallback(
    (chosen: TMDBMatch) => {
      setMatched((prev) => [...prev, chosen]);
      const nextIdx = disambigIndex + 1;
      if (nextIdx >= ambiguous.length) {
        // All resolved — move to review
        const allMatched = [...matched, chosen];
        setSelected(new Set(allMatched.map((m) => m.tvTimeName)));
        setPhase("review");
      } else {
        setDisambigIndex(nextIdx);
      }
    },
    [disambigIndex, ambiguous, matched]
  );

  const handleSkipDisambig = useCallback(() => {
    const current = ambiguous[disambigIndex];
    if (current.candidates.length > 0) {
      handleDisambiguate(current.candidates[0]);
    }
  }, [disambigIndex, ambiguous, handleDisambiguate]);

  // --- Phase 3: Review toggle ---
  const toggleSelected = useCallback((tvTimeName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tvTimeName)) next.delete(tvTimeName);
      else next.add(tvTimeName);
      return next;
    });
  }, []);

  // --- Phase 4: Import ---
  const handleImport = useCallback(async () => {
    if (!user || !parsedRef.current) return;
    setPhase("importing");
    setStatusText("Importing...");

    const selectedMatches = matched.filter((m) => selected.has(m.tvTimeName));
    const parsed = parsedRef.current;

    try {
      const stats = await importToFirestore(
        user.uid,
        selectedMatches,
        parsed.shows,
        parsed.watchedEpisodes,
        parsed.rewatchedEpisodes,
        parsed.movies,
        (done, total) => setProgress({ done, total })
      );
      setImportStats(stats);
      setPhase("done");
    } catch (err: any) {
      Alert.alert("Import Error", err.message || "Failed to import data.");
      setPhase("review");
    }
  }, [user, matched, selected]);

  // --- Render phases ---

  if (phase === "pick") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Import TV Time Data</Text>
        <Text style={styles.desc}>
          Select your TV Time GDPR export (.zip) to import your watch history.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handlePickFile}>
          <Text style={styles.buttonText}>Select ZIP File</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => navigation.goBack?.() || navigation.navigate?.("Main")}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === "matching") {
    return (
      <View style={styles.centered}>
        <Text style={styles.warning}>Do not close the app during import</Text>
        <Text style={styles.title}>{statusText}</Text>
        {progress.total > 0 && (
          <>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(progress.done / progress.total) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {progress.done} / {progress.total}
            </Text>
          </>
        )}
        <ActivityIndicator
          color={colors.primary}
          size="large"
          style={{ marginTop: spacing.lg }}
        />
      </View>
    );
  }

  if (phase === "disambiguate") {
    const current = ambiguous[disambigIndex];
    return (
      <View style={styles.container}>
        <Text style={styles.warning}>Do not close the app during import</Text>
        <Text style={styles.sectionTitle}>
          Resolve {disambigIndex + 1}/{ambiguous.length}: "{current.tvTimeName}"
        </Text>
        <Text style={styles.desc}>
          Multiple matches found. Pick the correct one:
        </Text>
        <FlatList
          data={current.candidates}
          keyExtractor={(item) => String(item.tmdbId)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.candidateRow}
              onPress={() => handleDisambiguate(item)}
            >
              {item.posterPath ? (
                <Image
                  source={{ uri: `${posterSize.small}${item.posterPath}` }}
                  style={styles.poster}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.poster, styles.noPoster]}>
                  <Text style={styles.noPosterText}>?</Text>
                </View>
              )}
              <View style={styles.candidateInfo}>
                <Text style={styles.candidateName} numberOfLines={1}>
                  {item.tmdbName}
                </Text>
                <Text style={styles.candidateYear}>{item.year || "N/A"}</Text>
                <Text style={styles.candidateOverview} numberOfLines={2}>
                  {item.overview}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.skipButton} onPress={handleSkipDisambig}>
              <Text style={styles.skipText}>Skip (use first result)</Text>
            </TouchableOpacity>
          }
        />
      </View>
    );
  }

  if (phase === "review") {
    const showMatches = matched.filter((m) => m.mediaType === "tv");
    const movieMatches = matched.filter((m) => m.mediaType === "movie");
    const selectedCount = selected.size;
    const episodeCount = parsedRef.current
      ? parsedRef.current.watchedEpisodes.filter((e) => {
          const show = parsedRef.current!.shows.find(
            (s) => s.tvTimeId === e.tvTimeShowId
          );
          return show && selected.has(show.name);
        }).length
      : 0;

    return (
      <View style={styles.container}>
        <FlatList
          data={[...showMatches, ...movieMatches]}
          keyExtractor={(item) => `${item.mediaType}-${item.tmdbId}`}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionTitle}>
                Review Import ({selectedCount} selected)
              </Text>
              {showMatches.length > 0 && (
                <Text style={styles.subhead}>
                  Shows ({showMatches.filter((m) => selected.has(m.tvTimeName)).length})
                </Text>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            // Show "Movies" subheader at transition point
            const isFirstMovie =
              item.mediaType === "movie" &&
              (index === 0 || matched[index - 1]?.mediaType !== "movie");

            return (
              <>
                {isFirstMovie && showMatches.length > 0 && (
                  <Text style={styles.subhead}>
                    Movies ({movieMatches.filter((m) => selected.has(m.tvTimeName)).length})
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.reviewRow}
                  onPress={() => toggleSelected(item.tvTimeName)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selected.has(item.tvTimeName) && styles.checkboxChecked,
                    ]}
                  >
                    {selected.has(item.tvTimeName) && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                  {item.posterPath ? (
                    <Image
                      source={{ uri: `${posterSize.small}${item.posterPath}` }}
                      style={styles.posterSmall}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.posterSmall, styles.noPoster]}>
                      <Text style={styles.noPosterText}>?</Text>
                    </View>
                  )}
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewName} numberOfLines={1}>
                      {item.tmdbName}
                    </Text>
                    <Text style={styles.reviewSub}>
                      {item.tvTimeName !== item.tmdbName
                        ? `"${item.tvTimeName}" → ${item.year}`
                        : item.year}
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            );
          }}
          ListFooterComponent={
            <View>
              {unmatchedNames.length > 0 && (
                <View style={{ marginTop: spacing.lg }}>
                  <Text style={styles.subhead}>
                    Unmatched ({unmatchedNames.length})
                  </Text>
                  {unmatchedNames.map((n) => (
                    <Text key={n} style={styles.unmatchedText}>
                      {n}
                    </Text>
                  ))}
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { marginTop: spacing.xl, marginBottom: spacing.xxl * 2 },
                  selectedCount === 0 && styles.buttonDisabled,
                ]}
                onPress={handleImport}
                disabled={selectedCount === 0}
              >
                <Text style={styles.buttonText}>
                  Import {showMatches.filter((m) => selected.has(m.tvTimeName)).length} shows,{" "}
                  {movieMatches.filter((m) => selected.has(m.tvTimeName)).length} movies,{" "}
                  {episodeCount} episodes
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>
    );
  }

  if (phase === "importing") {
    return (
      <View style={styles.centered}>
        <Text style={styles.warning}>Do not close the app during import</Text>
        <Text style={styles.title}>{statusText}</Text>
        {progress.total > 0 && (
          <>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(progress.done / progress.total) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {progress.done} / {progress.total}
            </Text>
          </>
        )}
        <ActivityIndicator
          color={colors.primary}
          size="large"
          style={{ marginTop: spacing.lg }}
        />
      </View>
    );
  }

  // phase === "done"
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Import Complete!</Text>
      {importStats && (
        <View style={styles.statsBox}>
          <Text style={styles.statLine}>
            Shows: {importStats.showsImported}
          </Text>
          <Text style={styles.statLine}>
            Movies: {importStats.moviesImported}
          </Text>
          <Text style={styles.statLine}>
            Episodes: {importStats.episodesImported}
          </Text>
          {importStats.minutesImported > 0 && (
            <Text style={styles.statLine}>
              Watch time: {Math.round(importStats.minutesImported / 60)}h{" "}
              {importStats.minutesImported % 60}m
            </Text>
          )}
          {importStats.skipped > 0 && (
            <Text style={styles.statLine}>
              Skipped (already existed): {importStats.skipped}
            </Text>
          )}
        </View>
      )}
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate?.("Main") || navigation.goBack?.()}
      >
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.title,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  desc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  warning: {
    ...typography.caption,
    color: colors.destructiveRed,
    textAlign: "center",
    marginBottom: spacing.lg,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionTitle: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  subhead: {
    ...typography.subtitle,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
  skipButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  skipText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  progressBar: {
    width: "100%",
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: spacing.lg,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  // Disambiguation
  candidateRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 4,
  },
  noPoster: {
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  noPosterText: {
    ...typography.title,
    color: colors.textMuted,
  },
  candidateInfo: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: "center",
  },
  candidateName: {
    ...typography.subtitle,
  },
  candidateYear: {
    ...typography.caption,
    marginTop: 2,
  },
  candidateOverview: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  // Review
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  posterSmall: {
    width: 40,
    height: 60,
    borderRadius: 4,
  },
  reviewInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  reviewName: {
    ...typography.body,
    fontWeight: "600",
  },
  reviewSub: {
    ...typography.caption,
    marginTop: 2,
  },
  unmatchedText: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  // Done
  statsBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.xl,
    width: "100%",
    marginBottom: spacing.xl,
  },
  statLine: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
});
```

- [ ] **Step 2: Verify it compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | grep ImportDataScreen || echo "No errors"
```

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/ImportDataScreen.tsx
git commit -m "feat(import): add ImportDataScreen with 4-phase UI"
```

---

### Task 6: Navigation + Onboarding Integration

**Files:**
- Modify: `app/App.tsx:59-80` — add import prompt after API key setup
- Modify: `app/src/screens/ProfileScreen.tsx:158-180` — add import button
- Modify: `app/src/types/index.ts:104-108` — add ImportData to RootStackParamList
- Modify: `app/src/navigation/AppNavigator.tsx` — not needed (import is rendered from App.tsx auth gate, not navigation stack)

The import screen during onboarding is shown directly in the App.tsx auth gate flow. It doesn't need the navigation stack. Access from Profile uses the existing tab navigator with a modal/navigation action.

- [ ] **Step 1: Add `hasSeenImport` state to auth store**

In `app/src/stores/authStore.ts`, add a `hasSeenImport` boolean and setter to track if user has been shown the import prompt:

Add to the `AuthState` interface:

```typescript
hasSeenImport: boolean;
setHasSeenImport: (val: boolean) => void;
```

Add to the store body:

```typescript
hasSeenImport: false,
setHasSeenImport: (val) => set({ hasSeenImport: val }),
```

- [ ] **Step 2: Add import flow to App.tsx**

In `app/App.tsx`, add a state to show the import screen after API key is set. Modify the `AppContent` function:

Add import at top:

```typescript
import ImportDataScreen from "./src/screens/ImportDataScreen";
```

Replace the section after `if (!tmdbApiKey)` check (lines 71-80) with:

```tsx
if (!tmdbApiKey) {
  return <ApiKeySetupScreen />;
}

if (!hasSeenImport) {
  return <ImportDataScreen navigation={{
    navigate: () => setHasSeenImport(true),
    goBack: () => setHasSeenImport(true),
  }} />;
}

return (
  <>
    <AppNavigator />
    <OfflineOverlay />
  </>
);
```

And destructure `hasSeenImport` and `setHasSeenImport` from the auth store:

```typescript
const { user, loading, setUser, tmdbApiKey, tmdbApiKeyLoading, loadTmdbApiKey, hasSeenImport, setHasSeenImport } =
  useAuthStore();
```

Wait — this would show the import screen every app launch until the user has imported. Better approach: persist `hasSeenImport` in Firestore on the user doc. But that adds complexity. Simpler: just use the zustand state (resets per session). On first launch after API key setup, user sees import. On subsequent launches, they skip straight to main. If they close and reopen, they go to main. This is acceptable because import is also accessible from Profile.

Actually even simpler — the `hasSeenImport` only matters during onboarding. Once the user has an API key, the next app launch goes straight to main (API key exists → past the check). The import prompt only shows during the first session when they set up the API key. This is perfect behavior.

- [ ] **Step 3: Add import button to ProfileScreen**

In `app/src/screens/ProfileScreen.tsx`, add a button before the sign out button. The Profile tab doesn't have its own stack navigator, so we need to add one or use a modal. Simplest approach: add Profile to a stack navigator.

First, update `app/src/types/index.ts` to add a ProfileStackParamList:

```typescript
export type ProfileStackParamList = {
  ProfileMain: undefined;
  ImportData: undefined;
};
```

Then in `app/src/navigation/AppNavigator.tsx`:

Add imports:

```typescript
import ImportDataScreen from "../screens/ImportDataScreen";
```

Add a ProfileStack:

```typescript
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ headerTitle: "Profile" }}
      />
      <ProfileStack.Screen
        name="ImportData"
        component={ImportDataScreen}
        options={{ headerTitle: "Import Data" }}
      />
    </ProfileStack.Navigator>
  );
}
```

Update the Profile tab:

```tsx
<Tab.Screen name="Profile" component={ProfileStackScreen} options={{
  headerShown: false,
}} />
```

And import the type:

```typescript
import {
  MainTabParamList,
  HomeStackParamList,
  SearchStackParamList,
  CalendarStackParamList,
  ProfileStackParamList,
} from "../types";
```

Then in `ProfileScreen.tsx`, add the import button and accept navigation prop:

```tsx
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ProfileStackParamList } from "../types";
```

Add inside the component before the sign out button:

```tsx
const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
```

Add in the JSX before the sign-out button (`<TouchableOpacity style={styles.signOutButton}`):

```tsx
<TouchableOpacity
  style={styles.importButton}
  onPress={() => navigation.navigate("ImportData")}
>
  <Text style={styles.importText}>Import TV Time Data</Text>
</TouchableOpacity>
```

Add style:

```typescript
importButton: {
  marginTop: spacing.xl,
  marginHorizontal: spacing.lg,
  paddingVertical: spacing.lg,
  backgroundColor: colors.surface,
  borderRadius: 8,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.border,
},
importText: {
  ...typography.subtitle,
  color: colors.accent,
},
```

- [ ] **Step 4: Verify it compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/App.tsx app/src/stores/authStore.ts app/src/screens/ProfileScreen.tsx app/src/navigation/AppNavigator.tsx app/src/types/index.ts
git commit -m "feat(import): integrate import screen into onboarding + profile"
```

---

### Task 7: Build and Manual Test

**Files:** No new files

- [ ] **Step 1: Run prebuild and build**

```bash
cd app && npx expo prebuild --clean
```

Then copy google-services.json:

```bash
cp app/google-services.json android/app/google-services.json
```

Then build:

```bash
npx expo run:android
```

- [ ] **Step 2: Manual test — onboarding flow**

1. Sign out and sign back in (or clear app data)
2. After API key setup, import screen should appear
3. Tap "Skip" → main app loads
4. Verify Profile → "Import TV Time Data" button exists

- [ ] **Step 3: Manual test — full import**

1. Go to Profile → Import TV Time Data
2. Select the GDPR zip file from device
3. Watch TMDB matching progress bar
4. Resolve any disambiguation prompts
5. Review screen: verify shows and movies listed with posters
6. Deselect a few, then tap Import
7. Watch Firestore upload progress
8. Verify stats on completion screen
9. Navigate to Watchlist — verify imported shows appear
10. Check Profile stats updated

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(import): address issues found in manual testing"
```
