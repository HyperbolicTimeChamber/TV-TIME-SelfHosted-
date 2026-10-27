# TV Time Revived — project guide for Claude

Self-hosted TV Time clone. React Native (Expo 57) app + React/Vite web app + Firebase (Blaze).
Firebase project `tv-time-returns`. Package `com.tvtimerevived.app` (iOS + Android). Repo `HyperbolicTimeChamber/TV-TIME-SelfHosted-`.
Branches: `web` (active), `newFeatures`, `tmdbProxy`, `development` (base), `main`. Version 1.1.0, build 44+.

Read `app/AGENTS.md` too (Expo docs rule, enum rule, typecheck rule). This file is the full context; keep it current when conventions change.

## FIRST: new-machine setup check (ask the user)
On a fresh system, before real work, check whether the tools below exist (`claude plugin list`, `/mcp`, `adb`, `ffmpeg`, Android SDK + `Pixel_9_Pro` AVD). For each **missing** one, **ask the user whether they want it installed** — never install silently.
- **Plugins / skills** used here: `caveman` (terse reply mode — user runs **ultra**), `superpowers` (brainstorming, systematic-debugging, TDD, verification-before-completion, writing-plans, code review…), `design-skills` + `joshus-design-skills` + `native-design` (UI/UX, HIG, Material, RN best practices), `impeccable` (UI design/polish), plus built-ins `commit`, `merge-to-dev`, `code-review`, `simplify`, `run`.
- **MCP servers**: `mobile-mcp` (drive the Android emulator via accessibility tree — preferred over screencap), `playwright` (web testing), `figma` (design↔code), optionally claude.ai Google Drive/Sheets/Docs connectors.
- **CLI**: Android SDK (`adb`, `emulator`, AVD `Pixel_9_Pro`), `ffmpeg` (frame-sheets from user videos), Node 20, Firebase CLI (`firebase deploy`), `gh`.

## Hard rules (user preferences — follow exactly)
- **Reply style:** caveman ultra (terse). Code, commits, PRs, security warnings: write normal.
- **Enums, never string literals** for keys: `src/enums/index.ts` (WatchStatus, MediaType, FreshTag, CacheKey, QueryKey, Route, CloudFunction, DocChangeType). Functions: `functions/src/shared/enums.ts`. Constants/enums go in enums files, not inline.
- **NEVER invalidate/refetch** React Query — always update cache locally (`setQueryData`). Minimise Firestore reads; cache aggressively.
- **Web parity:** every app change must also go to `web/` (web reuses app logic through the `@app/*` alias: hooks, utils, `useSeasonActions`, `useShowDetailActions`, …; UI components are separate). Web tests: `cd web && npm test` + `npx vite build` must pass before pushing.
- **No `Co-Authored-By: Claude` trailer** in commits unless a harness reminder explicitly demands it; follow the user's rule first. Conventional-commit style (`feat(app): …`).
- **Never hide/rename `node_modules` or `.env.local`** to make checks pass.
- **Version bump:** change version only; keep buildNumber/versionCode climbing, never reset to 1 (CI `bump-build.yml` adds +1 per build).
- **Rewatch only when completed:** never set rewatching on incomplete shows; extra E1 counts ≠ rewatch.
- **Verify visuals:** after every UI change, screenshot (+ zoom-crop) on the emulator and judge before reporting.
- **Emulator safety:** the emulator is signed into a REAL account with real data. Screenshot-confirm the screen before any `adb` swipe/tap that could mark something; use back-key to dismiss confirm modals instead of confirming; avoid card swipes (a fast swipe can become a tap → opens carousel with Mark buttons).
- **Typecheck:** `npx tsc --noEmit` from `app/`, `functions/`, and `web` (`npx tsc -p tsconfig.app.json --noEmit`) — root has no TypeScript. Pre-existing TS error list may be empty now; don't add new ones.
- **LegendList** does not re-render on `extraData` — embed state in data items.

## Architecture
- **Shared catalog:** `shows/{docId}` — metadata, seasons/episodes, `trackedBy[]`, `genres[]`.
- **Per-user:** `users/{uid}/tracking`, `watchedEpisodes`, `watchedMovies`, `upcoming`.
- **Config:** `config/app` — `tmdbApiKey` (server-only), `minVersion`, `lastCatalogSync`.
- **Cloud Functions v2** (`functions/src`, `npm run build` then `firebase deploy --only functions`): addShow, removeShow, importMatches, syncCatalog, markSeasonWatched, rebuildUpcoming, deleteAccount, testFCM, migrateDocIds, tmdbProxy (guest web HTTP), sharePreview (OG tags). Layout: `shared/` (enums, types/, docId), `hooks/` (subfoldered by calling CF; shared across several → hooks root), `cloudFunctions/`.
- RNFirebase v25 **modular** API (`DocumentSnapshot.exists()` is a method; `GoogleAuthProvider.credential(idToken, idToken)`), React Query, FCM, Crashlytics, Analytics, App Check (enforcement OFF).
- TMDB key: signed-in clients read `config/app.tmdbApiKey`; logged-out web uses `tmdbProxy`.
- App screens: `app/src/screens/{HomeScreen(WatchlistTab,UpcomingTab),CalendarScreen,SearchScreen,ProfileScreen,DetailScreens,ImportDataScreen}`; web mirrors under `web/src/screens`.
- Episode info modal: `components/modals/EpisodeDetailModal` (app) / `web/src/components/EpisodeDetailModal`. Marking logic lives in `useSeasonActions` (tracking advance, rewatch, "Whoa there Speedster!" backfill via the modal's BackfillModal). Calendar aired episodes open `CalendarScreen/TrackedEpisodeInfo` (drives `useSeasonActions` for one episode); unaired ones open read-only. The modal hides mark buttons for any episode whose `airDate` is in the future.

## Caching
- Watchlist display list `WATCHLIST_ACTIVE` (daily reorder). `WATCHLIST_EXHAUSTED` = confirmed all tracking pages loaded → footer shows the "all caught up" image at once; otherwise footer is **skeletons, never blank**, until confirmed.
- Catalog: AsyncStorage per show (`CATALOG_SHOW`+docId, index `CATALOG_INDEX`) — Android can't read one AsyncStorage value > ~1M chars ("Row too big for CursorWindow") so split big caches per key. AsyncStorage v3: `getMany/setMany/removeMany`.
- Upcoming invalidates on `lastCatalogSync` change; trending weekly; profile images/weekly activity/completed sections cached.
- Optimistic UI: cancelQueries only if the query already has data; `insertWatched*Cache` create the first page if empty; movie mark keeps `updatingShows` until the listener confirms.

## Crashlytics
`App.tsx` enables collection, hooks `ErrorUtils` (JS errors), plugin + gradle plugin present for native crashes (sent on NEXT launch). It does **not** capture Android low-memory-killer SIGKILLs (RAM pressure) — those leave no report. Calendar mode changes leave `crashlytics().log` breadcrumbs. Measured: release build on emulator = ~500 MB total PSS on Home (flat while scrolling the watchlist), calendar resize cycles add ~80 MB over the first ~4 cycles then plateau (~580 MB) — no leak. The earlier 800 MB+ native / 1.2 GB figures were dev-build inflation. A kill under heavy background apps is Android's LMK, not an app bug; it can't be reported. Emulator `/data` was enlarged to 16G (AVD config) because the release APK would not install at 6G.

## Build / run / test
- App dev: `cd app && npx expo start --dev-client`, `adb reverse tcp:8081 tcp:8081`, open `exp+watchloom://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` (scheme `watchloom`; first cold launch may crash once — relaunch). Editing a file can trigger a full reload back to Home.
- `prebuild --clean` wipes `android/` — re-copy `google-services.json`. Node 20 CF runtime deprecated (deadline Oct 2026).
- Web: `cd web && npx vite --port 5199 --strictPort --host 127.0.0.1`; on emulator Chrome use `adb reverse tcp:5199 tcp:5199`. Web taps can lag ~10s — never re-tap Mark. Use the checkmark, not swipe.
- Emulator: AVD `Pixel_9_Pro`; screens at 1280x2856. Prefer mobile-mcp element listing over screenshots; `adb exec-out screencap -p > file.png` otherwise.
- User-provided videos: `ffmpeg -i video.mp4 -vf "fps=1,scale=240:-1,tile=7x2" -frames:v 1 sheet.png` to read them.

## Misc gotchas
- ESLint config uses `tseslint.config()` (v8 API). App icon foreground scaled to 66% safe zone.
- `.claude/settings.local.json` holds local permissions; per-user memory lives outside the repo.
