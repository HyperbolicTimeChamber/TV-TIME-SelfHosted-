# TV Time Clone — Design Spec

## Overview

Self-hosted TV Time clone built with React Native (Expo), Firebase, and TMDB API. Multi-user app for tracking TV shows and movies with episode-level progress, calendar view, and discovery/search. Dark mode only.

## Monorepo Structure

```
TV-TIME-SelfHosted-/
├── app/                    # Expo React Native app
│   ├── src/
│   │   ├── components/     # Shared UI components
│   │   ├── screens/        # Screen components
│   │   ├── navigation/     # React Navigation config
│   │   ├── hooks/          # Custom hooks (useAuth, useWatchlist, etc)
│   │   ├── stores/         # Zustand stores
│   │   ├── services/       # Firebase + API call wrappers
│   │   ├── types/          # TypeScript types
│   │   └── theme/          # Dark theme constants
│   ├── app.json
│   ├── App.tsx
│   ├── package.json
│   └── tsconfig.json
├── functions/              # Firebase Cloud Functions
│   ├── src/
│   │   ├── tmdb/           # TMDB proxy endpoints
│   │   ├── triggers/       # Auth/Firestore triggers
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── firebase.json           # Firebase project config
├── firestore.rules         # Security rules
├── firestore.indexes.json
└── package.json            # Root
```

Two separate `package.json` files — app and functions have independent dependencies.

## Authentication

- Firebase Auth with Google Sign-In
- All Firebase Functions auth-gated (verify Firebase auth token before processing)
- TMDB API key stored in Firebase environment config (never on client)

## Firebase Data Model

### users/{userId}

| Field | Type | Description |
|-------|------|-------------|
| displayName | string | From Google account |
| email | string | From Google account |
| photoURL | string | From Google account |
| createdAt | timestamp | Account creation |
| stats | object | `{ episodesWatched, showsTracking, totalMinutes }` |

### users/{userId}/watchlist/{tmdbShowId}

| Field | Type | Description |
|-------|------|-------------|
| tmdbId | number | TMDB ID |
| mediaType | "tv" \| "movie" | Content type |
| title | string | Denormalized for fast list rendering |
| posterPath | string | Denormalized for fast list rendering |
| addedAt | timestamp | When added to watchlist |
| lastWatchedAt | timestamp \| null | Last episode watch time |
| status | string | `"watching" \| "plan_to_watch" \| "completed" \| "rewatching" \| "paused_rewatch"` |
| nextEpisode | object \| null | `{ season: number, episode: number }` |
| rewatchCount | number | 0 = first watch, 1 = first rewatch, etc. |

### users/{userId}/watchedEpisodes/{tmdbShowId_SxxExx}

| Field | Type | Description |
|-------|------|-------------|
| tmdbShowId | number | TMDB show ID |
| season | number | Season number |
| episode | number | Episode number |
| episodeTitle | string | Episode name |
| watchedAt | timestamp | First watch time |
| lastWatchedAt | timestamp | Updates on each rewatch |
| runtime | number | Minutes |
| watchCount | number | Incremented each rewatch |

### cache/shows/{tmdbShowId}

| Field | Type | Description |
|-------|------|-------------|
| details | object | Full TMDB show data |
| seasons | object | `{ [seasonNum]: { episodes: [...] } }` |
| lastUpdated | timestamp | Last cache refresh |
| ttl | timestamp | 24hr cache |

### cache/trending/{mediaType_timeWindow}

| Field | Type | Description |
|-------|------|-------------|
| results | array | Trending results |
| lastUpdated | timestamp | Last cache refresh |

## Navigation

```
Bottom Tabs:
├── Home (icon: home)
│   ├── Material Top Tabs:
│   │   ├── Watchlist
│   │   └── Upcoming
│   └── Stack:
│       ├── ShowDetail
│       └── SeasonDetail
│
├── Search (icon: search)
│   ├── Trending (default)
│   └── Search results
│   └── Stack:
│       └── ShowDetail (shared)
│
├── Calendar (icon: calendar)
│   └── Monthly view, dots on days with episodes
│   └── Tap day → episode list
│   └── Stack:
│       └── ShowDetail (shared)
│
└── Profile (icon: user)
    ├── Avatar + display name
    ├── Stats (eps watched, shows tracking, time spent)
    ├── Completed shows list
    └── Sign out
```

## Home Tab — Watchlist Sub-Tab

- One card per show displaying the next unwatched episode
- Sort order:
  1. Shows just watched (by `lastWatchedAt` desc)
  2. Shows with new episodes that are the user's next-to-watch
  3. Everything else by `lastWatchedAt` desc
- A show only moves to the top if:
  - User just watched an episode of it, OR
  - A new episode released AND it is the user's very next episode to watch
- FlatList with pagination
- Swipe left → mark episode watched (green background, "Watched" + checkmark)
- Tap checkmark icon on right → same as swipe left
- Swipe right → stop watching (blue background, "Stop Watching")

## Home Tab — Upcoming Sub-Tab

- All episodes of watchlisted shows grouped by air date, starting from today going forward
- Every single episode of each show displayed on its air date
- FlatList with pagination (infinite scroll by date)
- Same swipe gestures as Watchlist tab

## Swipe & Animation UX

### Mark Watched (swipe left or tap checkmark):
1. Card slides right → green background revealed with "Watched" text + checkmark icon
2. Card fully exits screen
3. Green card stays visible with spinner while API writes
4. On success → green card fades out
5. Remaining cards animate upward smoothly to fill the gap (LayoutAnimation / Reanimated layout transitions)
6. On failure → card slides back in, toast error

### Stop Watching (swipe right):
1. Card slides left → blue background revealed with "Stop Watching" text
2. Same spinner/fade/reorder pattern as mark watched
3. Removes show from watchlist (or sets status to "paused_rewatch" during rewatches)

## Rewatch Flow

1. Show with status "completed" → user taps "Rewatch" on ShowDetail screen
2. Status flips to "rewatching", `rewatchCount` incremented, `nextEpisode` resets to S01E01
3. Show appears in Watchlist tab from beginning
4. Each episode mark-watched → `watchCount++` on existing watchedEpisode doc (no duplicate docs)
5. Show completes again → back to "completed"

### Stop Watching During Rewatch:
- Status → "paused_rewatch"
- Hidden from watchlist
- `nextEpisode` preserved (resume where left off)
- Can resume from ShowDetail screen → status back to "rewatching"

## Calendar

- Shows upcoming episodes for all watchlisted shows (auto-populated from watchlist)
- Monthly calendar view with dots on days that have episodes
- Tap a day → list of episodes airing that day

## Search & Discovery

- Default view: trending shows and movies
- Search bar → queries TMDB via Firebase Functions
- Results show poster, title, year, type
- Tap → ShowDetail screen

## Profile

- Avatar + display name (from Google)
- Stats: episodes watched, shows tracking, total time spent watching
- Completed shows list
- Sign out button

## Offline Handling

- `@react-native-community/netinfo` listener in app root
- When offline → full-screen overlay: "No internet connection" with retry button
- All touch interactions disabled beneath overlay
- Auto-dismiss when connectivity restored
- No optimistic writes — wait for confirmed connection

## Firebase Cloud Functions

### TMDB Proxy Endpoints (HTTPS Callable)

| Function | Params | Description |
|----------|--------|-------------|
| searchMulti | query, page | Search shows + movies |
| getTrending | mediaType, timeWindow | Trending TV/movies |
| getShowDetails | tmdbId | Full show info |
| getSeasonDetails | tmdbId, seasonNumber | Episodes for a season |
| getUpcomingEpisodes | tmdbIds[] | Batch air dates for watchlisted shows |

All endpoints check Firestore cache first (show details: 24hr TTL, trending: 1hr TTL). If stale, fetch from TMDB, update cache, return.

### Firestore Triggers

| Trigger | Action |
|---------|--------|
| onUserCreate | Init user doc with empty stats |
| onEpisodeWatched | Update user stats (eps count, minutes) |
| onEpisodeUnwatched | Decrement user stats |
| onWatchlistChange | Update showsTracking count |

## Client State Management

### Zustand Stores

| Store | Purpose |
|-------|---------|
| authStore | User object, loading state, sign in/out actions |
| uiStore | Active tab, filters, swipe state |

### React Query (TanStack)

| Hook | Description |
|------|-------------|
| useSearch(query) | Paginated TMDB search via Functions |
| useTrending(type) | Trending with auto-refetch |
| useShowDetails(id) | Show info, cached |
| useSeasonDetails(id, season) | Season episodes, cached |
| useUpcomingEpisodes(ids) | Batch upcoming for calendar |

### Firestore Listeners (Custom Hooks)

| Hook | Description |
|------|-------------|
| useWatchlist(userId) | Real-time watchlist sub-collection |
| useWatchedEpisodes(userId, showId) | Real-time watched episodes |
| useUserStats(userId) | Real-time stats on profile |

## Tech Stack

### App
- Expo SDK (managed workflow)
- TypeScript
- React Navigation (bottom tabs + material top tabs + stacks)
- React Native Gesture Handler + Reanimated 3
- Zustand (client state)
- TanStack React Query (server state)
- @react-native-firebase/* (auth, firestore)
- @react-native-community/netinfo (connectivity)
- expo-image (fast image loading, TMDB posters)

### Functions
- Firebase Cloud Functions (Node.js, TypeScript)
- firebase-admin
- axios (TMDB API calls)

### Services
- Firebase Auth (Google Sign-In)
- Cloud Firestore
- Cloud Functions
- TMDB API v3

## Theme

- Dark mode only
- Color palette TBD during implementation (dark backgrounds, accent colors for actions)
- Green for "Watched" swipe action
- Blue for "Stop Watching" swipe action
- Red for destructive actions
