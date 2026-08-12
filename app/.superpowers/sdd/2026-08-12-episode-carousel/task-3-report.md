# Task 3 Report: Update SeasonDropdown Caller

## Status
COMPLETE

## Commit
8d2fb19 — feat(season): wire SeasonDropdown to carousel modal

## Changes Made
- `/app/src/components/SeasonDropdown.tsx`
  - Added `import type { CarouselEpisode }` from EpisodeDetailModal
  - Updated `epInfoData` state type to carousel shape (`tmdbId`, `showTitle`, `showPosterPath`, `showBackdropPath`, `episodes`, `initialIndex`, `watchedKeys`, `currentNextEpisode`)
  - Rewrote `handleEpisodePress` to build `CarouselEpisode[]` (released-only filter, `watchedKeys` Set from `watchedMap`, `initialIndex` via `findIndex`)
  - Added `handleCarouselMark`, `handleCarouselMarkThrough`, `handleCarouselUnmark` callbacks
  - Updated `<EpisodeDetailModal>` JSX to pass all new carousel props

## Typecheck
`npx tsc --noEmit` from `app/` passes with only the pre-existing UpcomingTab error (`UpcomingTab/index.tsx(230,6)` — Task 4 scope). No new errors introduced.

## Concerns
None. `currentNextEpisode` is passed as `null` from SeasonDropdown — EpisodeDetailModal handles this by skipping the backfill-gap check and marking directly, which is the correct behavior when opening from a season view (no tracked next-episode pointer available at this call site).
