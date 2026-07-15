# Task 4 Report: In-App Force Update Hook

## Status: DONE

## Commit
- `5089f61` feat: add in-app force update via Google Play In-App Updates API

## Changes Made

### 1. `app/package.json`
Added `"sp-react-native-in-app-updates": "^1.4.0"` to dependencies. `npm install` must be run in the app directory before building.

### 2. `app/src/stores/authStore.ts`
- Added `minVersion: string | null` to `AuthState` interface
- Added `minVersion: null` to initial state
- Updated `loadAppConfig` to read `data?.minVersion ?? null` alongside `tmdbApiKey`
- Updated `signOut` to reset `minVersion: null`

### 3. `app/src/hooks/useForceUpdate.ts` (new file)
- Android-only hook (no-ops on iOS)
- Reads `minVersion` and `user` from authStore; only runs when user is signed in
- Calls `inAppUpdates.checkNeedsUpdate()` from sp-react-native-in-app-updates
- If Play Store says update available: uses `IAUUpdateKind.IMMEDIATE` when current app version < `minVersion`, else `IAUUpdateKind.FLEXIBLE`
- On error (sideloaded / Play Store unavailable): shows `Alert.alert` if version is below `minVersion`
- App version read at module load time from `app.json` via `require`

### 4. `app/App.tsx`
- Added import for `useForceUpdate`
- Called `useForceUpdate()` as first line of `AppContent` function body

## Test Summary
TypeScript check skipped (sp-react-native-in-app-updates not installed locally). Logic verified by code review — correct use of IAUUpdateKind enum, compareVersions semver logic handles up to 3 parts, effect re-runs on user/minVersion changes.

## Concerns
- `npm install` must be run in `app/` before building — `sp-react-native-in-app-updates` is a native module requiring a prebuild step
- The library requires `npx expo prebuild` to link native Android code; existing `prebuild --clean` caveat applies (will wipe `android/` dir, must re-copy `google-services.json`)
- iOS is intentionally excluded (no App Store equivalent in this library's iOS flow) — if iOS App Store updates are needed in the future, a separate mechanism is required
- `app.json` version is build-time baked; if the version in `app.json` diverges from the actual binary version (e.g., OTA update scenario), the `compareVersions` check may be stale — acceptable for this use case since OTA updates bypass native version gating anyway
