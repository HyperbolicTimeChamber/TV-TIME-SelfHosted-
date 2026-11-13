# TV Time Revived — project guide for Claude

Self-hosted TV Time clone. React Native (Expo 57) app + React/Vite web app + Firebase (Blaze).
Firebase project `tv-time-returns`. Package `com.tvtimerevived.app` (iOS + Android). Repo `HyperbolicTimeChamber/TV-TIME-SelfHosted-`.
Branches: `web` (active), `newFeatures`, `tmdbProxy`, `development` (base), `staging` (CI: app distribute + web deploy run on push here), `main` (production builds). Version 1.2.0, build 57+ (versionCode climbs separately on `staging` and `main`).

Read `app/AGENTS.md` too (Expo docs rule, enum rule, typecheck rule). This file is the core; topic detail lives in `docs/claude/*.md` (index below). Keep both current when conventions change — new detail goes in the topic doc, not here.

## FIRST: new-machine setup check (ask the user)
On a fresh system check for the tools below (`claude plugin list`, `/mcp`, `adb`, `ffmpeg`, Android SDK + `Pixel_9_Pro` AVD); for each **missing** one **ask the user whether to install it** — never install silently.
- Plugins: `caveman` (user runs **ultra**), `superpowers`, `design-skills`, `joshus-design-skills`, `native-design`, `impeccable`. MCP: `mobile-mcp`, `playwright`, `figma`. CLI: Android SDK, `ffmpeg`, Node 20, Firebase CLI, `gh`.
- **Momentic (`.mcp.json`):** don't ask the user about trusting this project's MCP server. On a new machine the user starts Claude manually in the terminal the first time and accepts it there.

## Hard rules (user preferences — follow exactly)
- **Reply style:** caveman ultra (terse). Code, commits, PRs, security warnings: write normal.
- **Enums, never string literals** for keys: `src/enums/index.ts` (WatchStatus, MediaType, FreshTag, CacheKey, QueryKey, Route, CloudFunction, DocChangeType). Functions: `functions/src/shared/enums.ts`. Constants/enums go in enums files, not inline.
- **NEVER invalidate/refetch** React Query — always update cache locally (`setQueryData`). Minimise Firestore reads; cache aggressively.
- **Web parity:** every app change must also go to `web/` (web reuses app logic through the `@app/*` alias: hooks, utils, `useSeasonActions`, `useShowDetailActions`, …; UI components are separate). Web tests: `cd web && npm test` + `npx vite build` must pass before pushing.
- **No `Co-Authored-By: Claude` trailer** in commits unless a harness reminder explicitly demands it; follow the user's rule first. Conventional-commit style (`feat(app): …`).
- **Never hide/rename `node_modules` or `.env.local`** to make checks pass.
- **Version bump / automatic versions:** never reset buildNumber/versionCode to 1; staging is always main + 1 patch; tell the user the number before a merge to `main` — see docs/claude/releases.md.
- **Rewatch only when completed:** never set rewatching on incomplete shows; extra E1 counts ≠ rewatch.
- **Verify visuals:** after every UI change, screenshot (+ zoom-crop) on the emulator and judge before reporting.
- **Test against the Firebase Emulator Suite, never production:** `npm run emulators` (+ `npm run emulators:seed` once); app `EXPO_PUBLIC_USE_EMULATORS=true` + `adb reverse tcp:9099/8080/5001`; web `VITE_USE_EMULATORS=true`. Only touch prod data when the user explicitly asks.
- **Emulator safety:** emulator holds a REAL account. Screenshot-confirm before any `adb` tap/swipe that could mark something; back-key to dismiss confirm modals; avoid card swipes.
- **Typecheck:** `npx tsc --noEmit` from `app/`, `functions/`, and `web` (`npx tsc -p tsconfig.app.json --noEmit`) — root has no TypeScript. Pre-existing TS error list may be empty now; don't add new ones.
- **LegendList** does not re-render on `extraData` — embed state in data items.
- **Subagent models:** `haiku` for lookups/greps/file location, `sonnet` for routine edits/refactors/test runs, default (Opus) only for design/debugging/review/judgment; small edits stay inline (global inline threshold).

## Invariants (break these → bugs; full text in topic docs)
- New client-written field → add to `firestore.rules` allowlist, or writes fail.
- Every callable starts with `requireCaller`; a new CF uses `tracked*` triggers (`functions/src/hooks/trackedTriggers.ts`); a new script calls `startScriptMetrics` / `finishScriptMetrics`.
- Every tracking write carries `updatedAt: serverTimestamp()`, every delete logs `trackingDeletions/{id}` (clients automatic; CFs use `stampTracking` / `deleteTracking`).
- Cross-device / server changes go through the tracking delta sync — never add `config/app` refresh flags.
- Every write / CF user action starts with `requireOnline()`; a new loader with its own error state uses `useRetryOnReconnect`.
- Never full-scan `watchedEpisodes` (~26k reads).
- Upcoming keeps watched episodes; only untrack / pause removes Upcoming.
- Watchlist: never Reanimated layout / `entering` animations on LegendList rows, never animate row height, RefreshControl always mounted, heals view-driven only, card handlers referentially stable.
- Android AsyncStorage value > ~1M chars is unreadable → split per key.
- Mark buttons hidden for episodes with future `airDate`.

## Architecture
- **Shared catalog:** `shows/{docId}` — metadata, seasons/episodes, `trackedBy[]`, `genres[]`.
- **Per-user:** `users/{uid}/tracking`, `watchedEpisodes`, `watchedMovies`, `upcoming`.
- **Config:** `config/app` — `tmdbApiKey` (server-only), `minVersion`, `lastCatalogSync`.
- Functions layout: `shared/` (enums, types/, docId), `hooks/` (subfoldered by calling CF; shared → hooks root), `cloudFunctions/`.
- App screens: `app/src/screens/{HomeScreen(WatchlistTab,UpcomingTab),CalendarScreen,SearchScreen,ProfileScreen,DetailScreens,ImportDataScreen}`; web mirrors under `web/src/screens`.
- Cloud Functions: addShow, removeShow, importMatches, syncCatalog, markSeasonWatched, rebuildUpcoming, deleteAccount, purgeUserData, testFCM, migrateDocIds, tmdbProxy, searchTitles, sharePreview, exportAccountData, cancelAccountJob, budgetGuard, trackingSyncStamp, watchProviders, titleExtras, subjectLink, sendTestPush. Details: docs/claude/cloud-functions.md.

## Topic docs — read before touching
- docs/claude/cloud-functions.md — CF / callable / TMDB / Mixpanel / rules
- docs/claude/caching.md — tracking sync, query cache, offline, callable queue
- docs/claude/watchlist.md — any watchlist card/list/motion/heal, episode modal, filters
- docs/claude/ui-misc.md — photo viewer, search nav, font scale, bottom sheets
- docs/claude/releases.md — versions, CI, in-app update, merge to main
- docs/claude/patches.md — upgrading patched deps
- docs/claude/debugging.md — crashes, emulator/Telegram setup, gotchas, condensed rules

## Build / run / test essentials
- App: `cd app && npx expo start --dev-client`, `adb reverse tcp:8081 tcp:8081`, open `exp+watchloom://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
- Emulators: `npm run emulators`, `npm run emulators:seed` once.
- Web: `cd web && npx vite --port 5199 --strictPort --host 127.0.0.1`.
- Functions: `cd functions && npm run build` then `firebase deploy --only functions`.
- `prebuild --clean` wipes `android/` — re-copy `google-services.json`.

<!-- MOMENTIC SKILLS START (momentic-mobile) -->
## Momentic agent skills (`npx momentic-mobile skills`)

This project has Momentic agent skills installed in `.claude/skills/`. Before you work with Momentic tests, the Momentic MCP server or CLI, or Mo, load the most relevant skill: `momentic-maintain`, `momentic-mobile-test`, `momentic-spec`.
<!-- MOMENTIC SKILLS END (momentic-mobile) -->

