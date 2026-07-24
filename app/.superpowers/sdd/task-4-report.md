### Task 4 Report: Update App.tsx Gate and Hook Up Onboarding Flow

**Status:** DONE

**What was done:**

- Replaced `app/App.tsx` with the version specified in the brief.
- Key changes from the prior version:
  - Added import for `ApiKeySetupScreen` from `./src/screens/ApiKeySetupScreen`.
  - Destructured `tmdbApiKey`, `tmdbApiKeyLoading`, `loadTmdbApiKey` from `useAuthStore()`.
  - Updated `onAuthStateChanged` handler to call `loadTmdbApiKey(firebaseUser.uid)` when a user is present.
  - Added `loadTmdbApiKey` to the `useEffect` dependency array.
  - Added a loading spinner gate while `tmdbApiKeyLoading` is true (after user auth check).
  - Added `ApiKeySetupScreen` gate when `tmdbApiKey` is falsy (after API key loading completes).
  - Main app (`AppNavigator` + `OfflineOverlay`) only renders when both user and tmdbApiKey are present.

**TypeScript check:**

`cd app && npx tsc --noEmit 2>&1 | grep "App.tsx"` — no output, meaning zero errors from App.tsx.

**Commit:**

`a72ff35` — `feat: add API key gate to app entry point`

**Self-review / Concerns:**

- None. The logic flow is correct: auth loading → user gate → API key loading → API key gate → main app.
- No pre-existing errors introduced; TSC check passed cleanly for App.tsx.
