# Task 10 Report: Update Screens

## Status: COMPLETE

## Commit
- `dd12e63` — refactor: update all screens for shared catalog model

## Build Result
- `tsc --noEmit` exit code: **0** (zero errors)
- Previous error count: 23 errors across 12 files
- All 23 errors resolved

## Changes Made

### Screens Modified
1. **WatchlistTab.tsx** — Removed `tmdbApiKey`; uses `EnrichedTrackingItem` (with `title`, `posterPath`, `totalEpisodes`); `handleMarkWatched` reads catalog seasons instead of TMDB API; applies `isShowVisible()` + `sortByPriority()` for "Currently Watching" filtering
2. **ShowDetailScreen.tsx** — `addToWatchlist` → `addToTracking`, `removeFromWatchlist` → `removeFromTracking`; `addToTracking` signature simplified (no title/poster args, CF handles it)
3. **CalendarScreen.tsx** — No changes needed (hook already updated in Task 8)
4. **SearchScreen.tsx** — `addToWatchlist` → `addToTracking` with simplified args
5. **UpcomingTab.tsx** — Removed `loadNewerEpisodes`/`loadingNewer` destructuring (hook no longer returns them); `WatchlistItem` → `TrackingItem`
6. **ProfileScreen.tsx** — Removed entire TMDB API Key section (editing/saving UI + related state); added `moviesWatched` stat; removed `tmdbApiKey`/`saveTmdbApiKey` store refs
7. **SeasonDetailScreen.tsx** — `tmdbApiKey` → `appTmdbApiKey`
8. **ImportDataScreen/index.tsx** — `tmdbApiKey` → `appTmdbApiKey`

### Components Modified
1. **SeasonDropdown.tsx** — `tmdbApiKey` → `appTmdbApiKey`
2. **ShowCard.tsx** — Props interface changed from `WatchlistItem` (which is `TrackingItem` without `title`/`posterPath`) to a `ShowCardItem` interface that includes those display fields

### Other Files
- **App.tsx** — Removed `ApiKeySetupScreen` import/gate; updated auth store destructuring to new property names (`appTmdbApiKey`, `appTmdbApiKeyLoading`, `hasCompletedImport`); removed `loadTmdbApiKey` call
- **tmdb.ts** — Removed `getCachedSeason`/`setCachedSeason` dynamic imports (functions no longer exist in firestore.ts)

### Deleted
- `app/src/screens/ApiKeySetupScreen.tsx` — no longer needed (shared app-level TMDB key)

## Concerns
- **App.tsx onboarding flow** is simplified here but Task 11 will fully rework the navigation/onboarding gate. The current `!hasCompletedImport` gate shows ImportDataScreen, which may not be the final desired flow.
- The `superpowers/` directory exists as untracked but was not committed (not part of task scope).
