# TV Time GDPR Data Import

## Overview

Import watch history from a TV Time GDPR data export zip into the app's Firestore database. Supports TV shows (watchlist + watched episodes) and movies.

## Data Sources

Two CSV files from the GDPR export zip:

### `tracking-prod-records-v2.csv` (TV Shows)

**`user-series` rows (~825)** — followed shows:
| Field | Use |
|-------|-----|
| `s_id` | TV Time show ID (mapped to TMDB ID via search) |
| `series_name` | Show title (used for TMDB search) |
| `is_archived` | `true` → status `completed` |
| `is_for_later` | `true` → status `plan_to_watch` |
| `followed_at` | → `addedAt` timestamp |
| `rewatch_count` | → `rewatchCount` |
| `ep_watch_count` | Total episodes watched (informational) |

Status logic: `is_archived` → `completed`, `is_for_later` → `plan_to_watch`, else → `watching`.

**`watch-episode` rows (~26,768)** — individual episode watches:
| Field | Use |
|-------|-----|
| `s_id` | TV Time show ID |
| `series_name` | Show title |
| `season_number` | Season number |
| `episode_number` | Episode number |
| `created_at` | → `watchedAt` timestamp |

**`rewatch-episode` rows (~1,829)** — rewatch records:
Same fields as `watch-episode`. Each row increments `watchCount` on the matching episode doc.

### `tracking-prod-records.csv` (Movies)

**`type=="watch"` + `entity_type=="movie"` rows (~1,093)**:
| Field | Use |
|-------|-----|
| `movie_name` | Movie title (used for TMDB search) |
| `created_at` | → `addedAt` / `lastWatchedAt` |
| `runtime` | In seconds → convert to minutes |
| `release_date` | Informational, helps disambiguation |

## Dependencies

| Package | Purpose |
|---------|---------|
| `expo-document-picker` | Pick zip file from device |
| `jszip` | Extract CSVs from zip |
| `papaparse` | Parse CSV content |

## Architecture

### New Files

- `app/src/services/tvtimeImport.ts` — CSV parsing, TMDB matching, Firestore batch writes
- `app/src/screens/ImportDataScreen.tsx` — multi-phase import UI

### Modified Files

- `app/src/navigation/AppNavigator.tsx` — add ImportData screen to root stack + onboarding flow
- `app/src/screens/ProfileScreen.tsx` — add "Import TV Time Data" button
- `app/src/types/index.ts` — add ImportData to navigation param types

## Import Flow (4 Phases + Disambiguation)

### Phase 1: File Selection
- Button: "Select TV Time Export (.zip)"
- User picks zip via `expo-document-picker`
- Extract `tracking-prod-records-v2.csv` and `tracking-prod-records.csv` from zip using JSZip
- Parse both CSVs with PapaParse
- Extract unique show names (~625) and movie names (~1,093 deduplicated)
- Brief spinner: "Extracting..."

### Phase 2: TMDB Matching
- Progress bar: "Matching shows... 42/625"
- Batch 50 names at a time, 1 second pause between batches
- Shows → TMDB `/search/tv`
- Movies → TMDB `/search/movie`
- Rate limit handling: on 429, pause and wait `Retry-After` (default 10s), max 3 retries then mark unmatched
- Banner: "Do not close the app during import"
- Results categorized: single match, multiple matches, no match

### Phase 2.5: Disambiguation
- Shows/movies with multiple TMDB results presented one at a time
- Card displays: TV Time name + list of TMDB candidates (poster, year, overview snippet)
- User picks correct match or taps "Skip" (uses first result)
- Counter: "Resolve 3/17 ambiguous matches"

### Phase 3: Review & Select
- All matched items pre-selected (checkboxes checked)
- Two sections: "Shows" and "Movies"
- Each row: poster thumbnail, TV Time name → TMDB matched name, episode count
- User can deselect items they don't want imported
- Unmatched items shown at bottom (greyed out, not selectable)
- Button: "Import X shows, Y movies, Z episodes"

### Phase 4: Firestore Upload
- Progress bar: "Importing... 1,204/26,768 episodes"
- Banner: "Do not close the app"
- Batched Firestore writes (max 500 ops per batch)
- On complete → success screen with stats summary, navigate to watchlist

## Firestore Data Mapping

### Watchlist Items (shows)

Written to `users/{uid}/watchlist/{tmdbId}`:

```typescript
{
  tmdbId: number,          // from TMDB search
  mediaType: "tv",
  title: string,           // TMDB name
  posterPath: string,       // from TMDB search result
  addedAt: Timestamp,       // from followed_at
  lastWatchedAt: Timestamp | null,  // latest watch-episode created_at for this show
  status: WatchStatus,      // derived from is_archived / is_for_later
  nextEpisode: null,        // not computable from export
  rewatchCount: number,     // from rewatch_count field
  totalEpisodes: number | null,  // from TMDB search result
}
```

### Watchlist Items (movies)

Written to `users/{uid}/watchlist/{tmdbId}`:

```typescript
{
  tmdbId: number,
  mediaType: "movie",
  title: string,
  posterPath: string,
  addedAt: Timestamp,        // from created_at
  lastWatchedAt: Timestamp,  // same as addedAt
  status: "completed",
  nextEpisode: null,
  rewatchCount: 0,
  totalEpisodes: null,
}
```

### Watched Episodes

Written to `users/{uid}/watchedEpisodes/{tmdbId}_S{ss}E{ee}`:

```typescript
{
  tmdbShowId: number,
  season: number,
  episode: number,
  episodeTitle: "",          // not available in export
  watchedAt: Timestamp,      // from created_at (earliest)
  lastWatchedAt: Timestamp,  // from created_at (latest if rewatched)
  runtime: 0,                // not available in export
  watchCount: number,        // 1 + count of rewatch-episode rows for same S/E
}
```

### Stats Update

```typescript
{
  "stats.episodesWatched": increment(totalImportedEpisodes),
  "stats.showsTracking": increment(showsWithStatusWatching),
  "stats.totalMinutes": increment(totalMovieMinutes),
  // totalMinutes only from movies (have runtime), episodes have 0
}
```

### Conflict Handling

If a watchlist item or watched episode doc already exists in Firestore → **skip** (do not overwrite existing data).

## Navigation Integration

### Onboarding Flow

After API key setup completes successfully, show optional prompt:
> "Have a TV Time export? Import your watch history now."
> [Import Data] [Skip]

"Import Data" → navigates to ImportDataScreen.
"Skip" → navigates to Main.

### Profile Screen

New button in settings section: "Import TV Time Data" → navigates to ImportDataScreen.

## TMDB Matching Strategy

```
For each unique name:
  1. Search TMDB (tv or movie)
  2. If 0 results → mark unmatched
  3. If 1 result → auto-select
  4. If 2+ results → add to disambiguation queue
```

Batching: 50 concurrent requests, 1 second pause between batches. TMDB rate limit is 40 requests per 10 seconds — this stays well under.

## Error Handling

- Invalid/missing CSV in zip → show error, return to file selection
- TMDB rate limit (429) → pause, wait Retry-After, retry up to 3 times
- Firestore batch failure → retry failed batch once, skip on second failure, report skipped items
- App backgrounded during import → import continues (no special handling needed, Firestore writes are fire-and-forget per batch)
