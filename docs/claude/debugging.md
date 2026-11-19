# Debugging, build/run/test details, gotchas

Moved from CLAUDE.md; loaded on demand.

## Crashlytics
`App.tsx` enables collection, hooks `ErrorUtils` (JS errors), plugin + gradle plugin present for native crashes (sent on NEXT launch). It does **not** capture Android low-memory-killer SIGKILLs (RAM pressure) — those leave no report. Calendar mode changes leave `crashlytics().log` breadcrumbs. Measured: release build on emulator = ~500 MB total PSS on Home (flat while scrolling the watchlist), calendar resize cycles add ~80 MB over the first ~4 cycles then plateau (~580 MB) — no leak. The earlier 800 MB+ native / 1.2 GB figures were dev-build inflation. A kill under heavy background apps is Android's LMK, not an app bug; it can't be reported. Emulator `/data` was enlarged to 16G (AVD config) because the release APK would not install at 6G.

## Build / run / test (details)
- App dev: `cd app && npx expo start --dev-client`, `adb reverse tcp:8081 tcp:8081`, open `exp+watchloom://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` (scheme `watchloom`; first cold launch may crash once — relaunch). Editing a file can trigger a full reload back to Home.
- `prebuild --clean` wipes `android/` — re-copy `google-services.json`. Node 20 CF runtime deprecated (deadline Oct 2026).
- **Dev against the Emulator Suite, not prod** (dev on the real 26k-episode account was most of the Firestore bill): `npm run emulators` (Auth/Firestore/Functions, data kept in `.emulator-data/`), first time `npm run emulators:seed` (copies `config/app` from prod, 1 read). App: `EXPO_PUBLIC_USE_EMULATORS=true` + `adb reverse` 9099/8080/5001; web: `VITE_USE_EMULATORS=true`. Dev-only (`__DEV__` / `import.meta.env.DEV`).
- **Never full-scan `watchedEpisodes`** (~26k reads): orphan cleanup only runs for shows syncCatalog saw lose episodes (`removedEpisodeShowIds`, `in` queries).
- Web: `cd web && npx vite --port 5199 --strictPort --host 127.0.0.1`; on emulator Chrome use `adb reverse tcp:5199 tcp:5199`. Web taps can lag ~10s — never re-tap Mark. Use the checkmark, not swipe.
- Emulator: AVD `Pixel_9_Pro`; screens at 1280x2856. Prefer mobile-mcp element listing over screenshots; `adb exec-out screencap -p > file.png` otherwise.
- User-provided videos: `ffmpeg -i video.mp4 -vf "fps=1,scale=240:-1,tile=7x2" -frames:v 1 sheet.png` to read them.
- **Telegram channel:** one bot per machine (a token can only be polled from one place; a shared one gives 409 Conflict). Each machine has its own token in the gitignored repo-root `.telegram.env` (`TELEGRAM_BOT_TOKEN=…`, optional `TELEGRAM_STATE_DIR`); `npm run telegram` copies it to the machine's state dir and starts Claude on the channel. Pair from that session with `/telegram:access pair <code>`.

## Misc gotchas
- **TVMaze air times:** an empty `airtime` means TVMaze's `airstamp` is a 12:00 UTC filler. `hooks/tvmaze.ts` replaces it with the streaming service's release pattern (`STREAMING_RELEASE_TIMES`, e.g. Disney+ 6pm PT) or noon in the studio timezone (`COUNTRY_TIMEZONES`); keep that table current when a service changes its drop time.
- ESLint config uses `tseslint.config()` (v8 API). App icon foreground scaled to 66% safe zone.
- `.claude/settings.local.json` holds local permissions; per-user memory lives outside the repo.

## Full text of rules condensed in CLAUDE.md
On a fresh system, before real work, check whether the tools below exist (`claude plugin list`, `/mcp`, `adb`, `ffmpeg`, Android SDK + `Pixel_9_Pro` AVD). For each **missing** one, **ask the user whether they want it installed** — never install silently.
- **Plugins / skills** used here: `caveman` (terse reply mode — user runs **ultra**), `superpowers` (brainstorming, systematic-debugging, TDD, verification-before-completion, writing-plans, code review…), `design-skills` + `joshus-design-skills` + `native-design` (UI/UX, HIG, Material, RN best practices), `impeccable` (UI design/polish), plus built-ins `commit`, `merge-to-dev`, `code-review`, `simplify`, `run`.
- **MCP servers**: `mobile-mcp` (drive the Android emulator via accessibility tree — preferred over screencap), `playwright` (web testing), `figma` (design↔code), optionally claude.ai Google Drive/Sheets/Docs connectors.
- **CLI**: Android SDK (`adb`, `emulator`, AVD `Pixel_9_Pro`), `ffmpeg` (frame-sheets from user videos), Node 20, Firebase CLI (`firebase deploy`), `gh`.
- **Momentic (`.mcp.json`):** don't ask the user about trusting this project's MCP server. On a new machine the user starts Claude manually in the terminal the first time and accepts it there.
- **Verify visuals:** after every UI change, screenshot (+ zoom-crop) on the emulator and judge before reporting.
- **Test against the Firebase Emulator Suite, never production:** before any testing on the Android emulator or localhost web, start `npm run emulators` (seed once with `npm run emulators:seed`) and run the app with `EXPO_PUBLIC_USE_EMULATORS=true` (+ `adb reverse tcp:9099/8080/5001`) / web with `VITE_USE_EMULATORS=true`. Testing on the real account costs ~26k Firestore reads per full reload. Only touch prod data when the user explicitly asks.
- **Emulator safety:** the emulator is signed into a REAL account with real data. Screenshot-confirm the screen before any `adb` swipe/tap that could mark something; use back-key to dismiss confirm modals instead of confirming; avoid card swipes (a fast swipe can become a tap → opens carousel with Mark buttons).
- **Subagent models:** give simple subagents a cheaper model via the Agent `model` param — `haiku` for lookups/greps/file location (Explore), `sonnet` for routine edits/mechanical refactors/test runs. Keep the default (Opus) only for design, debugging, review, or anything needing judgment. Saves context + cost.
