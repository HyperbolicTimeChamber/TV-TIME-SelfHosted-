# Watch History — design

Profile → "Watch History" pill button (red, white text, arrow circle) under Watch Statistics →
full-screen page (no tab bar): back + title, sliding tabs **TV Shows** (default) | **Movies**,
list of started titles, most recently watched first.

## Data (approach A: fields on tracking docs)

`users/{uid}/tracking/{docId}` gains, written alongside the writes the app already makes (0 extra writes):

| Field | Meaning | Written on |
|---|---|---|
| `historyAt` | last watch; list sort key. Missing → not in history | every mark (ep / season / movie / import) |
| `historyUpdatedAt` | any history-relevant change; delta-sync cursor | mark, unmark, stop, resume, rewatch start, restart, skip, server reactivation |
| `minutesWatched` | total minutes incl. rewatches | ± runtime per mark / unmark |
| `plays` | marks − unmarks; ≤ 0 → hidden | ± per mark / unmark |

`shows/{id}.logoPath`: TMDB title logo (English → language-neutral → null). Filled by `addShow`,
weekly `syncCatalog` (same TMDB request, `append_to_response=images`) and the backfill. Clients
read it from Firestore only.

Indexes: tracking (`mediaType`, `historyAt` desc), (`mediaType`, `historyUpdatedAt` asc).

Backfill: local admin script `functions/src/scripts/backfillHistory.ts`
(`npm run backfill:history -- [--dry-run] [--only=history|logos]`). Recomputes history totals from
watchedEpisodes + watchedMovies (Σ runtime × watchCount; safe to rerun, unchanged docs not written);
logos only where the field is missing. BulkWriter for writes, pooled TMDB calls.

Old app builds don't write the new fields → release ships with `[force-update]`; backfill rerun after.

## Fetching + cache (SWR)

Per tab: query `mediaType == X`, `orderBy historyAt desc`, 20 per page, cursor paging; missing
catalogs in one `documentId() in […]` query. Pages persisted (AsyncStorage / localStorage); open →
render cache, then delta query `historyUpdatedAt > lastChecked`, merge + re-sort quietly. Local
watch actions patch the cache (move to top / insert / update / remove when `plays` ≤ 0).

## Card (16:9; mobile 1 column, web grid 1 / 2 / 3 cols, phone width identical to Android)

- Backdrop + Profile stat-card blur/overlay. All text white except inside the yellow pill.
- Top-left: logo (hidden if none); title; status pill — green Currently Watching, blue Rewatching,
  red Completed, purple Paused (existing colours, white text).
- Bottom-left: time spent (`formatTime`); "Watched N×" (full watch-throughs) on Rewatching / Completed.
- Bottom-right: watching/rewatching → yellow pill ring + %; up to date → green pill tick + "Up to date";
  paused → purple pill pause icon + "Paused"; completed / movies → none.
  Tag below: Ongoing / Ended (TV), release year (movies).
- Tap → show page. Skeletons share one shimmer. Web list: react-infinite-scroll-component.
