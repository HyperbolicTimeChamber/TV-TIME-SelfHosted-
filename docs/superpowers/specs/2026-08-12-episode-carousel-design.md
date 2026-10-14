# Episode Detail Carousel

## Summary

Convert the single-episode detail modal into a horizontal carousel that lets users browse through all released episodes, mark future episodes as watched (with backfill confirmation), and unwatch/rewatch already-watched episodes.

## Data Model

### Episode List

Built when modal opens from `catalogShow.seasons`. Flatten all episodes across all seasons where `airDate <= today`. Each item:

```ts
interface CarouselEpisode {
  season: number;
  episode: number;
  title: string | null;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  overview: string | null;
}
```

Starting index = the tapped episode (current `nextEpisode`). FlatList `initialScrollIndex` set to this.

### Detail Loading

`Map<string, EpisodeDetail | null>` keyed by `"S01E01"`:
- Key absent = not loaded → skeleton
- Value present = loaded (from catalog or TMDB)

Load window: on mount load current + next 2. On scroll, load next unloaded ep ahead of visible.

### Watched State

`Set<string>` of `"S01E01"` keys, initialized from `useWatchedEpisodes`. Updated optimistically on mark/unmark. Determines button rendering per card.

## Component Architecture

### Structure

```
EpisodeDetailModal (wrapper)
├── AnimatedModal (existing)
├── FlatList (horizontal, pagingEnabled)
│   └── EpisodeCard (renderItem)
│       ├── Image / Skeleton (still)
│       ├── Title pill, ep title, label, meta, overview
│       └── Button row:
│           - Unwatched: "Mark as Watched"
│           - Watched: "Unwatch" + "Rewatch" (side by side)
└── ConfirmModal (backfill prompt)
```

### Props

```ts
interface EpisodeCarouselProps {
  visible: boolean;
  tmdbId: number;
  showTitle: string;
  showPosterPath: string | null;
  showBackdropPath: string | null;
  episodes: CarouselEpisode[];
  initialIndex: number;
  watchedKeys: Set<string>;
  currentNextEpisode: { season: number; episode: number } | null;
  onMarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
  onMarkWatchedThrough: (tmdbId: number, season: number, episode: number) => Promise<void>;
  onUnmarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
  onShowPress?: () => void;
  onClose: () => void;
}
```

### Callers

`WatchlistTab.handleCardPress`, `SeasonDropdown`, and `UpcomingTab` build the episode list from catalog, compute `initialIndex`, pass `watchedKeys` from `useWatchedEpisodes`.

## Mark-Watched Flow

### Unwatched Episode

1. If ep is ahead of `currentNextEpisode` (gaps exist) → show ConfirmModal: "Mark episodes E02–E05 as watched?"
   - **Yes:** `onMarkWatchedThrough(tmdbId, season, ep)` — batch marks all from current next through this ep. Advances the watchlist pointer.
   - **No:** `onMarkWatched(tmdbId, season, ep)` — marks only this ep. Pointer unchanged.
2. If ep IS the next episode → `onMarkWatched` directly, no confirm.
3. After mark: update local `watchedKeys` optimistically → card shows unwatch/rewatch buttons.
4. Watchlist card "next episode" pointer only advances when all previous eps are marked.

### Watched Episode

- **Unwatch:** `onUnmarkWatched(tmdbId, season, ep)` → remove from local `watchedKeys` → card shows "Mark as Watched".
- **Rewatch:** `onMarkWatched(tmdbId, season, ep)` (increments watchCount) → stays on card with watched buttons.

## Scroll Behavior

### Lazy Loading Gate

- `onViewableItemsChanged` tracks active index.
- On index change: check if active card's detail is loaded.
- If not loaded → `scrollEnabled = false`, fetch detail, on load → `scrollEnabled = true`.
- Prevents scrolling past skeletons. Free scrolling within loaded window.

### Skeleton Card

When detail not loaded, render the card layout with shared shimmer:
- Image area: full shimmer block
- Title/meta: shimmer lines (reuse existing `useSharedShimmer`)
- Button: disabled shimmer

## TMDB Fetching Strategy

### Season-Level Caching

`Map<number, TMDBEpisode[]>` keyed by season number. One `getSeasonDetails` call per season, returns all episodes. Cache survives for modal lifetime.

### Fetch Order

1. Check catalog for `overview` + `stillPath`. If present, use directly — no TMDB call.
2. If missing, fetch via `getSeasonDetails` for that season. Populate all eps from response.
3. On TMDB error: fall back to Firestore catalog doc (`shows/{docId}`) for bare-bone data (title, airDate, runtime — no overview/still). Show card with available fields, no skeleton forever. Re-enable scroll.

### Load Trigger

- On mount: fetch season for initial episode.
- On scroll into ep from new season: fetch that season.
- Typical usage: 1-2 TMDB calls total.

## Files Changed

- `app/src/components/modals/EpisodeDetailModal.tsx` — refactor into carousel + card
- `app/src/screens/HomeScreen/WatchlistTab/index.tsx` — update `handleCardPress` to build episode list, add `onMarkWatchedThrough` and `onUnmarkWatched` handlers
- `app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts` — add `handleMarkWatchedThrough` (batch mark)
- `app/src/components/SeasonDropdown.tsx` — update modal invocation
- `app/src/screens/HomeScreen/UpcomingTab/index.tsx` — update modal invocation
- `app/src/services/firestore.ts` — add `markEpisodesWatchedThrough` batch function
