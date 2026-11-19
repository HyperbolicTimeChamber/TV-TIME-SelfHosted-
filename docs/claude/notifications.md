# Airing notifications

Loaded on demand. Android only; web shows a notice in Settings → Notifications.

## Design
- On-device alarms are primary: the planner reads the saved tracking pages and the cached catalog (no network), 30-day horizon, at most 60 scheduled notifications, stable ids so a re-plan is idempotent.
- Episode alerts only for titles the user is caught up on: status watching / rewatching, tracking `nextEpisode` not yet aired, episodes from `nextEpisode` onward. Movies: release alert + 7-day reminder for tracked, unwatched movies.
- Quiet hours 22:00-08:00: overnight alerts wait for 09:00 and several titles are grouped into one alert. Movie, reminder, digest and untimed-episode alerts fire at 09:00 local. Weekly digest on Sunday 09:00. 25-day reopen nudge after the last app open.
- A daily `expo-background-task` re-plans with the app closed. Re-plans also run after launch, tracking changes, catalog cache writes, switch changes and on return to the app.
- Per-title FCM topics `title-{docId}` plus the `notifyAirings` function (00:30 UTC) send a day-ahead correction push (changed air times, newly announced episodes); `airDates14` is stamped on catalog docs by addShow / syncCatalog / refreshShow / `backfillAirDates`.

## Files
- `app/src/utils/airingPlan.ts` pure planner (tests in `app/tests/airingPlan.test.ts`), `airingPush.ts`, `airingReplanSignal.ts`
- `app/src/services/airingScheduler.ts`, `airingTask.ts`, `titleTopics.ts`, `notifyPrefs.ts`
- `app/src/hooks/useAiringReplan.ts`, `app/index.ts` (background handler)
- `functions/src/cloudFunctions/notifyAirings.ts`, `functions/src/shared/airDates.ts`

## Known limits
- Force-stopped app or aggressive OEM task killers: no alarms or pushes until the app is reopened.
- Switches are per device. Old builds get nothing. iOS is not covered.
- Alerts use titles in the saved tracking pages and the cached catalog; nothing is fetched. Android groups notifications automatically, no explicit summary.

## Testing
- Settings → Updates (test) → "Schedule Fake Airing In 2 Min", swipe the app away, the alert fires. Reboot the emulator: it still fires. `adb shell am force-stop` means no delivery by design.
