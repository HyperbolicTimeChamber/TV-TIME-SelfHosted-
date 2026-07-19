# Watchlist Enhancements Design

**Date:** 2026-07-19
**Status:** Approved

## Overview

Six improvements to the watchlist: rename section, fix priority sorting for newly-aired episodes, apply movie visibility/sorting parity with TV shows, add direct-add flow for unreleased movies with info modal, and yellow freshness tags.

## 1. Rename "Watch Next" → "What's Up Next"

Single string change in `app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts` line 162.

## 2. Priority Sort — New Episodes Rise to Top

### Problem

When a new episode airs and it's the user's next-to-watch, the show doesn't move to the top because `priorityDate` only updates on user actions (mark watched, unwatch, etc.).

### Solution

**Write-side (Firestore):**

In `markEpisodeWatched()` — after computing the new `nextEpisode`:
- If `nextEpisode.airDate > now` → set `priorityDate = Timestamp.fromDate(nextEpisode.airDate)`
- Otherwise → set `priorityDate = serverTimestamp()` (existing behavior)

In `addToTracking()` for movies:
- If catalog show `releaseDate > today` → set `priorityDate = Timestamp.fromDate(releaseDate)`

**Read-side (client sort guard):**

In `sortByPriority()` within `useVisibleTracking.ts`:
- Compute effective sort key: `max(item.priorityDate, nextEpisodeAirDate || releaseDate)`
- This catches stale Firestore values (e.g. syncCatalog hasn't run, or edge timing)

### Why This Doesn't Break Anything

- Future-dated priorityDate items sort high in Firestore query but are hidden by `isShowVisible()` filter
- `useWatchlistData` already auto-loads more pages if < 10 visible items
- Real-time listener still fires correctly
- User-action writes (unwatch, pause, resume) still use `Timestamp.now()` — correct behavior

## 3. Movie Visibility — Same Rules as TV Shows

### Current Behavior

Movies with active status (WATCHING/REWATCHING/PLAN_TO_WATCH) are always visible regardless of release date or watched state.

### New Behavior

In `isShowVisible()`:
- Movie with `releaseDate > today` → **hidden** (unreleased, like future episode)
- Movie with `releaseDate <= today` AND status active AND NOT marked watched → **visible**
- Movie with status COMPLETED → **hidden** (already the case via status check)

### Data Source

`releaseDate` available from `EnrichedTrackingItem.catalogShow.releaseDate` (already fetched from catalog).

## 4. Unreleased Movie — Direct Add + Info Modal

### Flow

When user adds a movie whose `releaseDate > today`:

1. **Skip** the "add and mark as watched" prompt entirely
2. Call `addToTracking(userId, tmdbId, MOVIE)` with `priorityDate = Timestamp.fromDate(releaseDate)`
3. **Check** `hideUnreleasedMovieModal` preference (AsyncStorage first, Firestore fallback)
4. If not suppressed → show info modal
5. Movie hidden on watchlist until release day

### Info Modal Content

- Title: "Added to Watchlist"
- Body: "This movie hasn't released yet. It will appear on your watchlist when it airs. Check the Upcoming or Calendar tab to confirm."
- Checkbox: "Don't show this again"
- Button: "OK"

### Preference Storage

- **Source of truth:** Firestore `users/{uid}` document field `hideUnreleasedMovieModal: boolean`
- **Cache:** AsyncStorage key `hideUnreleasedMovieModal` — never expires
- **Read flow:** Check AsyncStorage → if miss, fetch from Firestore → cache result
- **Write flow:** On checkbox toggle → write to both AsyncStorage and Firestore

### New Component

`src/components/UnreleasedMovieModal.tsx` — reusable modal with checkbox state.

## 5. Yellow "NEW" Tag — TV Episodes

### Condition

`nextEpisode.airDate` equals today (same calendar day).

### Placement

Inline after the episode label in ShowCard. Example: `S02E05` **NEW**

### Style

- Yellow background pill (`#F5A623` or similar warm yellow)
- Dark text
- Small font, rounded corners
- Positioned immediately after episode label text

## 6. Yellow "JUST AIRED" Tag — Movies

### Condition

`releaseDate` is within the last 7 days: `today - 7 days <= releaseDate <= today`

(Only AFTER release, not before.)

### Placement

Inline after the "MOVIE" badge in ShowCard.

### Style

Same yellow pill as the "NEW" tag. Text: "JUST AIRED"

## Files Touched

| File | Changes |
|------|---------|
| `src/hooks/useVisibleTracking.ts` | Sort logic (effective key with max), movie visibility rules |
| `src/services/firestore.ts` | priorityDate write logic in markEpisodeWatched + addToTracking |
| `src/components/ShowCard.tsx` | NEW + JUST AIRED tag rendering |
| `src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts` | Rename "Watch Next" → "What's Up Next" |
| `src/components/UnreleasedMovieModal.tsx` | New modal component |
| Movie add trigger location (search/detail screen) | Skip watched prompt for unreleased, show modal |
| `src/stores/authStore.ts` or dedicated pref hook | hideUnreleasedMovieModal read/write |

## Data Dependencies

- `nextEpisode.airDate` — available from catalog show's season/episode data (already enriched)
- `releaseDate` — available from `catalogShow.releaseDate` (TMDB field, stored in shared catalog)
- `hideUnreleasedMovieModal` — new field on user doc + AsyncStorage

## Edge Cases

- **Multiple shows air same day:** All get airDate as effective priority → tied, appear near top. Fine.
- **App not opened for days:** Shows that aired days ago still sort by their airDate, below anything user watched since. Correct.
- **Movie with no releaseDate in catalog:** Treat as released (visible). Don't hide what we can't verify.
- **syncCatalog updates airDate:** Client sort guard uses latest catalog data regardless of stale priorityDate in Firestore.
