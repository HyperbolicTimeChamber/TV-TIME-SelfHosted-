# Remove Blaze Dependency — Design Spec

## Goal

Eliminate Firebase Blaze (pay-as-you-go) plan requirement by removing all Cloud Functions. Users store their own TMDB API key in Firestore and the app queries TMDB directly. Stats updates move client-side. Entire app runs on Firebase Spark (free) plan.

## Architecture Change

### Before

```
App -> Cloud Functions (auth check -> cache check -> TMDB API)
Firestore Triggers -> stats updates
```

### After

```
App -> TMDB API directly (key from user profile doc)
App -> Firestore writes include stats updates inline (batch writes)
```

No server-side code. No Cloud Functions. Spark plan only.

## Data Model Changes

### Modified: `users/{userId}`

Add field:

```typescript
tmdbApiKey: string // user's personal TMDB API key
```

### Removed Collections

- `cache_shows` — React Query handles caching in-memory
- `cache_trending` — React Query handles caching in-memory
- `cache_seasons` — React Query handles caching in-memory

## TMDB Client (Client-Side)

Replace `app/src/services/functions.ts` with `app/src/services/tmdb.ts`.

New client-side TMDB service with same 5 operations:

| Function | TMDB Endpoint | Notes |
|----------|---------------|-------|
| `searchMulti` | `/search/multi` | Query + page params |
| `getTrending` | `/trending/{mediaType}/{timeWindow}` | Default: tv/week |
| `getShowDetails` | `/tv/{id}` or `/movie/{id}` | append_to_response for credits/similar |
| `getSeasonDetails` | `/tv/{id}/season/{num}` | Episode list |
| `getUpcomingEpisodes` | Multiple `/tv/{id}` calls | Batch fetch for watchlist items |

Implementation:

- Axios instance with base URL `https://api.themoviedb.org/3`
- API key passed as `api_key` query parameter
- Key sourced from auth store (loaded on app init from user profile)
- React Query hooks updated to call new service instead of Cloud Function wrappers

## Onboarding Flow

1. Google Sign-In -> Firebase Auth
2. `onAuthStateChanged` fires -> fetch `users/{userId}` doc
3. Check `tmdbApiKey` field exists and is non-empty
4. If missing -> **API Key Setup Screen** (gate, blocks app access)
   - Text input for TMDB API key
   - Instructions/link to https://www.themoviedb.org/settings/api for key generation
   - **Validation:** test call to TMDB `/configuration` endpoint with entered key
   - On success: save key to `users/{userId}.tmdbApiKey` in Firestore
   - On failure: show error, prompt retry
5. If present -> main app (existing flow)
6. Profile screen -> section to view/update API key anytime

### Auth Gate Flow (App.tsx)

```
Loading -> Check Auth -> No Auth -> LoginScreen
                      -> Auth -> Check tmdbApiKey -> Missing -> ApiKeySetupScreen
                                                  -> Present -> AppNavigator
```

## Stats Updates (Client-Side)

Move Firestore trigger logic into existing service functions as batch writes.

### Episode Watched

Current trigger: `onEpisodeCreated` increments `stats.episodesWatched` and `stats.totalMinutes`.

New: batch write in `markEpisodeWatched()`:

```typescript
const batch = firestore().batch();
batch.set(episodeRef, episodeData);
batch.update(userRef, {
  'stats.episodesWatched': firestore.FieldValue.increment(1),
  'stats.totalMinutes': firestore.FieldValue.increment(runtime),
});
await batch.commit();
```

### Episode Unmarked

Current trigger: `onEpisodeDeleted` decrements stats.

New: batch write in `unmarkEpisodeWatched()`:

```typescript
const batch = firestore().batch();
batch.delete(episodeRef);
batch.update(userRef, {
  'stats.episodesWatched': firestore.FieldValue.increment(-1),
  'stats.totalMinutes': firestore.FieldValue.increment(-runtime),
});
await batch.commit();
```

### Episode Rewatch

Current trigger: `onEpisodeUpdated` checks if `watchCount` increased.

New: batch write in rewatch handler:

```typescript
const batch = firestore().batch();
batch.update(episodeRef, {
  watchCount: firestore.FieldValue.increment(1),
  lastWatchedAt: firestore.FieldValue.serverTimestamp(),
});
batch.update(userRef, {
  'stats.episodesWatched': firestore.FieldValue.increment(1),
  'stats.totalMinutes': firestore.FieldValue.increment(runtime),
});
await batch.commit();
```

### Watchlist Add/Remove

Current triggers: `onWatchlistAdded`/`onWatchlistRemoved` adjust `stats.showsTracking`.

New: include in existing watchlist write operations:

```typescript
// Add
const batch = firestore().batch();
batch.set(watchlistRef, showData);
batch.update(userRef, {
  'stats.showsTracking': firestore.FieldValue.increment(1),
});
await batch.commit();

// Remove
const batch = firestore().batch();
batch.delete(watchlistRef);
batch.update(userRef, {
  'stats.showsTracking': firestore.FieldValue.increment(-1),
});
await batch.commit();
```

All batch writes are atomic — same consistency guarantee as triggers.

## Firestore Security Rules

### Remove

- `cache_shows` rules
- `cache_trending` rules
- `cache_seasons` rules

### Keep

- `users/{userId}` — existing rules already restrict read/write to owner
- `users/{userId}/watchlist/{docId}` — unchanged
- `users/{userId}/watchedEpisodes/{docId}` — unchanged

`tmdbApiKey` field is protected by existing user-doc rules (only owner can read/write).

## Deletions

| Item | Action |
|------|--------|
| `functions/` directory | Delete entirely |
| `functions` in `firebase.json` | Remove functions config block |
| Cache collection rules in `firestore.rules` | Remove |
| `cache_*` indexes in `firestore.indexes.json` | Remove if any |
| Budget alert / billing code | Delete (in functions/) |
| `app/src/services/functions.ts` | Replace with `tmdb.ts` |

## Files Modified

| File | Change |
|------|--------|
| `app/App.tsx` | Add API key gate check, new auth flow |
| `app/src/stores/authStore.ts` | Add `tmdbApiKey` state, load on auth |
| `app/src/services/tmdb.ts` | New — client-side TMDB API service |
| `app/src/services/functions.ts` | Delete |
| `app/src/services/firestore.ts` | Add batch writes with stats updates |
| `app/src/hooks/useSearch.ts` | Point to tmdb service |
| `app/src/hooks/useTrending.ts` | Point to tmdb service |
| `app/src/hooks/useShowDetails.ts` | Point to tmdb service |
| `app/src/hooks/useSeasonDetails.ts` | Point to tmdb service |
| `app/src/hooks/useUpcomingEpisodes.ts` | Point to tmdb service |
| `app/src/screens/ApiKeySetupScreen.tsx` | New — onboarding gate screen |
| `app/src/screens/ProfileScreen.tsx` | Add API key edit section |
| `app/src/screens/LoginScreen.tsx` | May need navigation update |
| `app/src/navigation/AppNavigator.tsx` | Add ApiKeySetup to nav stack |
| `app/src/types/index.ts` | Add tmdbApiKey to user type |
| `firebase.json` | Remove functions config |
| `firestore.rules` | Remove cache rules |
| `firestore.indexes.json` | Remove cache indexes if any |

## Non-Goals

- Persistent client-side caching (AsyncStorage/IndexedDB) — React Query in-memory is sufficient
- Server-side TMDB proxy — eliminated entirely
- Shared cache across users/devices — not needed for self-hosted
