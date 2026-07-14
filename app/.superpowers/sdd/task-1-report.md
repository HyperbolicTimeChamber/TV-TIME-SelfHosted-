# Task 1 Report: Update Types and Auth Store for TMDB API Key

## Status: DONE

## Changes Made

### app/src/types/index.ts
- Added `tmdbApiKey: string` to `UserProfile` interface (line 25)
- Added `ApiKeySetup: undefined` to `RootStackParamList` (between Login and Main)

### app/src/stores/authStore.ts
- Full rewrite: added `tmdbApiKey: string | null`, `tmdbApiKeyLoading: boolean` state
- Added `setTmdbApiKey`, `loadTmdbApiKey`, `saveTmdbApiKey` methods
- `signOut` now resets `tmdbApiKey: null, tmdbApiKeyLoading: true`
- Added `firestore` import from `@react-native-firebase/firestore`

## Verification
- `npx tsc --noEmit` produced zero errors (clean output)

## Commit
- f96c372 feat: add tmdbApiKey to UserProfile and auth store
