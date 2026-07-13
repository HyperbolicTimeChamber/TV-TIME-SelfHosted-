# Shared Catalog + Cloud Functions Design

**Date:** 2026-07-14
**Status:** Approved
**Branch:** development

## Problem Statement

1. Completed shows remain in watchlist — should disappear when all aired episodes watched
2. No mechanism to detect TMDB updates (new seasons/episodes) — stale data
3. TV Time import runs entirely client-side — should offload heavy batch writes to server
4. Per-user TMDB API keys and duplicated show data across users is wasteful

## Goals

- Shared show/episode catalog — one source of truth for all users
- Cloud Functions for TMDB sync, search proxy, and import
- Smart watchlist visibility and sorting
- Push notifications for import completion
- Firebase Blaze with budget protection

---

## Architecture Overview

### Client vs Cloud Function Split

**Client-side (direct Firestore reads/writes):**
- Read watchlist (`tracking/` + `shows/` join)
- Read upcoming episodes (filter by airDate from `shows/`)
- Mark episode watched (write `watchedEpisodes/`, update `tracking/`)
- Mark movie watched (write `watchedMovies/`, update `tracking/`)
- Rewatch, stop watching
- All sorted by denormalized `priorityDate`

**Cloud Functions only:**
| Function | Type | Purpose |
|----------|------|---------|
| `syncCatalog` | Scheduled (weekly) | Refresh `shows/` from TMDB, reactivate completed users if new content |
| `addShow` | HTTPS Callable | Fetch TMDB data, create/update `shows/` doc, add to trackedBy |
| `removeShow` | HTTPS Callable | Remove user from trackedBy, cleanup if zero trackers |
| `importMatches` | HTTPS Callable | Batch write import data + FCM notification when done |

---

## Data Model

### Shared Catalog

```
shows/{tmdbId}
  tmdbId: number
  mediaType: "tv" | "movie"
  title: string
  posterPath: string
  overview: string
  status: string              // TMDB status ("Returning Series", "Ended", "Canceled", etc.)
  totalSeasons: number        // TV only
  totalEpisodes: number
  runtime: number             // movie runtime or avg episode runtime
  lastSyncedAt: Timestamp
  trackedBy: string[]         // user UIDs, max ~1000 per array
  trackedByCount: number      // total across all overflow arrays
  seasons: [                  // TV only — inline array
    {
      seasonNumber: number,
      episodeCount: number,
      airDate: string,
      episodes: [
        {
          episodeNumber: number,
          title: string,
          airDate: string,
          runtime: number
        }
      ]
    }
  ]

  // Overflow when trackedBy > 1000:
  shows/{tmdbId}/trackedByOverflow/{chunk}
    uids: string[]
```

### Per-User Data

```
users/{uid}
  displayName: string
  email: string
  photoURL: string
  stats: {
    episodesWatched: number,
    showsTracking: number,
    moviesWatched: number,
    totalMinutes: number
  }
  hasCompletedImport: boolean   // skip import screen if true
  lastSyncedAt: Timestamp       // last catalog sync acknowledged
  fcmToken: string              // for push notifications
  createdAt: Timestamp

users/{uid}/tracking/{tmdbId}
  tmdbId: number
  mediaType: "tv" | "movie"
  status: WatchStatus           // watching | completed | plan_to_watch | rewatching | paused_rewatch
  nextEpisode: { season: number, episode: number } | null
  rewatchCount: number
  addedAt: Timestamp
  lastWatchedAt: Timestamp
  priorityDate: Timestamp      // denormalized sort key (see Watchlist Sort section)

users/{uid}/watchedEpisodes/{tmdbShowId_SxxExx}
  tmdbShowId: number
  season: number
  episode: number
  episodeTitle: string
  watchCount: number
  watchedAt: Timestamp
  lastWatchedAt: Timestamp
  runtime: number

users/{uid}/watchedMovies/{tmdbId}
  tmdbId: number
  watchCount: number
  watchedAt: Timestamp
  lastWatchedAt: Timestamp
  runtime: number
```

### Key Differences from Current Model

- `watchlist/` renamed to `tracking/` (clearer intent)
- No `title`, `posterPath` in user tracking — read from shared `shows/` catalog
- No per-user `episodeCache/` — shared catalog is the cache
- No per-user `tmdbApiKey` — single app-level key in Cloud Functions config
- Movies in same `shows/` collection (`mediaType` differentiates), no `seasons` array
- New `watchedMovies/` subcollection for movie watch history
- New `priorityDate` field on `tracking/` for denormalized sorting

---

## Watchlist Visibility Rules

A show appears in "Currently Watching" only if ALL conditions met:

| Condition | Required |
|-----------|----------|
| `status` is `watching`, `rewatching`, or `plan_to_watch` | Yes |
| Has unwatched episodes that have already aired | Yes |

### Visibility Matrix

| Scenario | Visible? | Reason |
|----------|----------|--------|
| Unwatched aired eps exist | Yes | Stuff to watch |
| All aired eps watched, next ep not yet aired | Hidden | Nothing to do — reappears when ep airs |
| All aired eps watched, no next ep (show ended) | Hidden | Completed — reappears if new season via sync |
| Unwatched eps exist, next ep not yet aired | Yes | Catchup needed |
| `plan_to_watch`, no eps watched | Yes | User intends to start |

### Previously Watched Section

Unchanged — shows recent `watchedEpisodes` entries sorted by `lastWatchedAt` descending.

---

## Watchlist Sort Order

Each show has a denormalized `priorityDate` field on its `tracking/` doc.

### Priority Date Calculation

```
if (all aired eps watched AND new ep just aired):
  priorityDate = newEpAirDate
else:
  priorityDate = lastWatchedAt
```

**Rules:**
- New ep airDate only boosts sort position when user is fully caught up
- If user is behind on episodes, show stays sorted by `lastWatchedAt`
- Sort descending — newest `priorityDate` at top
- Enables native Firestore pagination: `orderBy('priorityDate', 'desc').limit(20)`

### When priorityDate Updates

- User watches an episode → `priorityDate = lastWatchedAt`
- Weekly sync detects new aired ep + user is caught up → `priorityDate = airDate`

---

## Cloud Functions Detail

### 1. `syncCatalog` — Scheduled (Weekly Cron)

- **Schedule:** Every Sunday 3:00 AM UTC
- **Process:**
  1. Query all docs in `shows/` collection (TV only, skip movies)
  2. For each show: fetch latest data from TMDB API
  3. Compare seasons/episodes — detect new content
  4. Update `shows/{tmdbId}` doc with fresh data + `lastSyncedAt`
  5. If new season/episodes found:
     - Find all users in `trackedBy` (+ overflow chunks)
     - For users with `status: "completed"`: set `status: "watching"`, `nextEpisode` to first new episode
     - Update `priorityDate` to new episode's `airDate` if user was caught up
- **Config:** max instances = 5, timeout = 540s, memory = 256MB
- **Large catalog handling:** If `shows/` collection exceeds ~200 docs, process in batches of 50 with Cloud Tasks to avoid timeout. Each batch fetches TMDB data, updates docs, then enqueues next batch.

### 2. `addShow` — HTTPS Callable

- **Input:** `{ tmdbId: number, mediaType: "tv" | "movie" }`
- **Process:**
  1. Check if `shows/{tmdbId}` exists
  2. If not: fetch full TMDB data (show details + all seasons/episodes), create doc
  3. If yes: add user to `trackedBy` array (or overflow if > 1000)
  4. Increment `trackedByCount`
- **Returns:** Show data for client to use immediately

### 3. `removeShow` — HTTPS Callable

- **Input:** `{ tmdbId: number }`
- **Process:**
  1. Remove user UID from `trackedBy` array (or overflow)
  2. Decrement `trackedByCount`
  3. If `trackedByCount` drops to 0: delete `shows/{tmdbId}` doc
- **Returns:** Success/failure

### 4. `importMatches` — HTTPS Callable

- **Input:** `{ matches: [{ tmdbId, mediaType, watchedEpisodes, status }] }`
- **Process:**
  1. For each match: create/update `shows/` doc (fetch TMDB data if needed)
  2. Add user to `trackedBy` arrays
  3. Create `tracking/` docs per user
  4. Create `watchedEpisodes/` and `watchedMovies/` docs
  5. Update user stats
  6. Send FCM push notification when complete
- **Returns:** Import stats (shows imported, episodes imported, etc.)

---

## App-Level Configuration

### TMDB API Key

**Two locations:**

1. **Firebase Functions Secret Manager** (for Cloud Functions):
```bash
firebase functions:secrets:set TMDB_API_KEY
```
Accessed in functions via `process.env.TMDB_API_KEY`.

2. **Firestore `config/app` doc** (for client-side search/browse):
```
config/app
  tmdbApiKey: "your_key_here"
```
Client reads once on auth → caches in memory (Zustand store) → uses for all direct TMDB calls (search, trending, show browse). Key rotatable anytime by updating one Firestore doc. Set manually by project owner, not writable by users.

### FCM Setup

- Client registers for push notifications on app launch
- Stores FCM token in `users/{uid}.fcmToken`
- Cloud Functions use Firebase Admin SDK to send notifications

### Budget Protection (Firebase Blaze)

- Budget alerts at $5, $10, $25
- Cloud Function limits: max instances = 5, timeout = 300s, memory = 256MB
- Budget notification emails to project owner

---

## UX Flow Changes

### Onboarding (New)

```
Google Sign-In
  → hasCompletedImport == false?
    → Import Screen
      ├─ "Import from TV Time" → client disambiguation flow → send to CF → blocking loader → FCM push → done
      └─ "Skip" → sets hasCompletedImport: true → main app
  → hasCompletedImport == true?
    → Main app
```

- No more TMDB API key setup step
- Import screen only on first login (or until skipped)
- Settings page has "Import from TV Time" for users who skipped

### Import Flow (Revised)

1. **Client-side:** User picks GDPR zip → parse CSVs → TMDB search (direct, using cached API key) → disambiguation UI
2. **Client sends final matches** to `importMatches` CF
3. **App shows blocking loader** while CF processes
4. **FCM push notification** when done (handles backgrounded app)
5. **Done screen** with import stats

### Watchlist Tab

- "Currently Watching" filtered by visibility rules (see above)
- Sorted by `priorityDate` descending with Firestore pagination
- Show metadata (title, poster) read from `shows/` catalog
- Completed/caught-up shows hidden — reappear when new ep airs or sync finds new season

### Calendar Tab

**Before:** Client fetched show details + season episodes directly from TMDB API using per-user key, cached in per-user `episodeCache/` (24h TTL).

**After:** Reads directly from shared `shows/{tmdbId}` catalog (already kept fresh by weekly `syncCatalog` cron).

- **Data source:** User's `tracking/` docs (status: watching/rewatching) → read corresponding `shows/` docs → extract episodes from inline `seasons` array
- **No more:** Per-user TMDB API calls, per-user `episodeCache/`, API key dependency
- **Filtering:** Episodes filtered by `airDate` matching viewed month
- **UI unchanged:** Calendar dots on air dates, tap date → episode list, year picker modal, swipe navigation
- **Performance:** Faster — single Firestore read per show instead of TMDB API call + cache layer

### Search

**Before:** Client called TMDB `/search/multi` directly with per-user API key.

**After:** Client calls TMDB directly using app-level key from Firestore `config/app.tmdbApiKey` (cached in memory on auth). No Cloud Function needed — avoids cold start latency.

- **Search flow:** User types query → client calls TMDB `/search/multi` directly → instant results
- **Add show flow:** User taps "+" on search result → call `addShow` CF → CF fetches full TMDB data, populates `shows/` catalog, adds user to `trackedBy` → client creates `tracking/` doc
- **Show detail from search:** If show exists in `shows/` catalog → read from Firestore. If not yet tracked → call `addShow` CF on track action
- **UI unchanged:** Same search tiles, translucent name banners, +/checkmark watchlist badge

---

## Firestore Security Rules

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // App config — read-only for authenticated users (TMDB key, etc.)
    match /config/{doc} {
      allow read: if request.auth != null;
      allow write: if false; // set manually by project owner
    }

    // Shared catalog — read-only for authenticated users
    match /shows/{showId} {
      allow read: if request.auth != null;
      allow write: if false; // only Cloud Functions write

      match /trackedByOverflow/{chunk} {
        allow read: if request.auth != null;
        allow write: if false;
      }
    }

    // Per-user data — scoped to own UID
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

---

## Migration

No migration needed — user data will be cleared. Fresh start with new data model.

---

## Technical Notes

- Firebase Functions v2 (2nd gen) for better cold start performance
- Node.js/TypeScript for Cloud Functions
- TMDB API concurrency: maintain pooled() pattern (5 parallel) in CF
- React Query still used client-side for in-memory caching of `shows/` reads
- `onSnapshot` listeners on `tracking/` for real-time watchlist updates
- Firestore composite index needed: `tracking` collection — `status` (ASC) + `priorityDate` (DESC)
- Watchlist visibility ("has unwatched aired eps") computed client-side by comparing user's `watchedEpisodes` count against aired episodes from `shows/` catalog at render time — not stored as a field
