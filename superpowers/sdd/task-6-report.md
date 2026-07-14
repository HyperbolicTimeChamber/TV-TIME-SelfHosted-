# Task 6 Report: Update TypeScript Types + Auth Store

## Status: COMPLETE

## Commit
`2f5fae5` — feat: update types and auth store for shared catalog model

## What Was Done

### app/src/types/index.ts
- Added `CatalogEpisode`, `CatalogSeason`, `CatalogShow` interfaces for shared show data from the `shows/` Firestore collection
- Added `TrackingItem` interface (replaces the old `WatchlistItem` shape — no longer carries `title`, `posterPath`, `totalEpisodes` since those live in the catalog doc)
- Added `export type WatchlistItem = TrackingItem` alias for backward compatibility during migration
- Added `WatchedMovie` interface
- Updated `UserProfile`: removed `tmdbApiKey`, added `hasCompletedImport: boolean` and optional `fcmToken?: string`
- Updated `UserStats`: added `moviesWatched: number`
- Updated `RootStackParamList`: removed `ApiKeySetup`, added `ImportData`
- All other types (`WatchedEpisode`, `TMDBShow`, `TMDBSeason`, `TMDBEpisode`, `UpcomingEpisode`, nav param types) preserved unchanged

### app/src/stores/authStore.ts
- Removed: `tmdbApiKey`, `tmdbApiKeyLoading`, `hasSeenImport`, `setTmdbApiKey`, `setHasSeenImport`, `loadTmdbApiKey()`, `saveTmdbApiKey()`
- Added: `appTmdbApiKey: string | null`, `appTmdbApiKeyLoading: boolean`, `hasCompletedImport: boolean`
- Added `loadAppConfig()`: reads `config/app` Firestore doc, extracts `tmdbApiKey` field into `appTmdbApiKey`
- Added `loadUserFlags(userId)`: reads user doc, extracts `hasCompletedImport` flag
- Updated `setUser()`: calls both `loadAppConfig()` and `loadUserFlags(uid)` when a user signs in
- Updated `signOut()`: resets `appTmdbApiKey`, `appTmdbApiKeyLoading`, and `hasCompletedImport`
- All Google sign-in, email sign-in, email sign-up, sign-out logic preserved intact
- Uses RNFirebase v25 modular API throughout (`getFirestore`, `doc`, `getDoc`)

## Build Result

TypeScript check (`npx tsc --noEmit --skipLibCheck`) shows 27 errors, all in downstream files (hooks, screens, App.tsx) that still reference the old `tmdbApiKey`, `saveTmdbApiKey`, `hasSeenImport`, and the old `WatchlistItem` shape fields (`posterPath`, `title`, `totalEpisodes`). Zero errors originate from `types/index.ts` or `authStore.ts` themselves.

Affected downstream files (to be fixed in Tasks 7–11):
- `App.tsx` — references old auth store fields
- `src/screens/ApiKeySetupScreen.tsx` — references `saveTmdbApiKey`
- `src/screens/ProfileScreen.tsx` — references `tmdbApiKey`, `saveTmdbApiKey`, `posterPath`
- `src/screens/WatchlistTab.tsx` — references `tmdbApiKey`, `posterPath`, `title`, `totalEpisodes`
- `src/screens/ImportDataScreen/index.tsx` — references `tmdbApiKey`
- `src/screens/SeasonDetailScreen.tsx` — references `tmdbApiKey`
- `src/components/SeasonDropdown.tsx` — references `tmdbApiKey`
- `src/components/ShowCard.tsx` — references `posterPath`, `title` on TrackingItem
- `src/hooks/useCalendarEpisodes.ts`, `useSearch.ts`, `useSeasonDetails.ts`, `useShowDetails.ts`, `useTrending.ts`, `useUpcomingEpisodes.ts` — reference `tmdbApiKey`
- `src/hooks/useUserStats.ts` — constructs `UserStats` without `moviesWatched`

## Concerns

1. **TrackingItem shape change is breaking** — the old `WatchlistItem` carried `title`, `posterPath`, and `totalEpisodes` denormalized on the user doc. The new `TrackingItem` does not. Screens/components that render lists (WatchlistTab, ShowCard, ProfileScreen) will need to join against the catalog to get display data. This is intentional per the architecture but requires careful handling in Task 7/8/10.

2. **`setDoc` import retained but unused** — `authStore.ts` imports `setDoc` which is no longer called (was used by `saveTmdbApiKey`). Should be removed in a follow-up or when Task 7 adds any new Firestore writes from the store.

3. **`useUserStats.ts` constructs a literal `UserStats` object** missing `moviesWatched` — this will be a compile error until Task 8 fixes it. Not a runtime crash risk since Firestore data will supply the field, but the type annotation is now stricter.
