# Airing notifications

Loaded on demand. Android only; web shows a notice in Settings → Notifications.

## Design
- On-device alarms are primary: the planner reads the saved tracking pages and the cached catalog (no network), 30-day horizon, at most 60 scheduled notifications, stable ids so a re-plan is idempotent.
- Episode alerts only for titles the user is caught up on: status watching / rewatching, tracking `nextEpisode` not yet aired, episodes from `nextEpisode` onward. Movies: release alert + 7-day reminder for tracked, unwatched movies.
- Quiet hours 22:00-08:00: overnight alerts wait for 09:00 and several titles are grouped into one alert ("4 Episodes to Watch Today", body = the show names, expanded = one row per episode).
- Rich Android styles come from the expo-notifications patch (docs/claude/patches.md). Data `bigPicture` + `bigPictureLogo` + `bigPictureCaption` (TMDB URLs downloaded at fire time, caption rows `\n`-joined) → BigPictureStyle: the picture cropped to 2:1, the logo centred, caption rows on a dark fade along the bottom. Picture alerts use custom views in `DecoratedCustomViewStyle` (collapsed: texts left, circular thumbnail right, app icon in the system header; expanded: the title row shows `bigPictureHeading` ("Airing today" for episodes / premieres) or is hidden (the logo names it), the body row only when the picture has no caption, then the picture). Single-title episode alerts: still + "S01E04 · Name" on the picture; premieres: backdrop + "Season 2 Premiere"; several episodes add an "N more episodes" row; movie "Out today": backdrop + logo, no caption. Data `lines` (JSON array, max 6 rows incl. "+N more") → InboxStyle: the morning group, and the fallback when the picture can't be downloaded. No art cached and no lines → plain text.
- Movie, reminder, digest and untimed-episode alerts fire at 09:00 local. Weekly digest on Sunday 09:00. 25-day reopen nudge after the last app open.
- A daily `expo-background-task` re-plans with the app closed. Re-plans also run after launch, tracking changes, catalog cache writes, switch changes and on return to the app.
- Per-title FCM topics `title-{docId}` plus the `notifyAirings` function (00:30 UTC) send a day-ahead correction push (changed air times, newly announced episodes); `airDates14` is stamped on catalog docs by addShow / syncCatalog / refreshShow / `backfillAirDates`.

## Settings (Settings → Notifications, per device)
All settings are one JSON object (`NotifyPrefs`, `app/src/utils/notifyConfig.ts`, `CacheKey.NOTIFY_PREFS`); the planner and scheduler read it, the screens edit a copy and save the whole object (then a re-plan is requested). The old five-boolean save migrates on parse.
- **Pause:** snooze (1 day / 3 days / 1 week) or off until turned back on; vacation = a local date range. A snooze or vacation drops the alerts that fall inside it; "off for good" plans nothing.
- **Presets:** Essential / Balanced (defaults) / Everything / Custom. A preset only sets the alert-type switches; `presetOf` detects which one the switches match, so it is never stored.
- **Alert types:** new episodes (scope: caught up / watching / all tracked, skip specials, lead time 0–60 min for timed episodes), season premieres (+ day-before heads-up), season / series finales (the last episode of a season in the cached catalog; series finale when TMDB status is Ended / Canceled), show ended, new season announced, air date changed, movie releases, movie reminders (any of 1 / 3 / 7 / 14 days before), weekly digest (weekday, hour, window), daily digest, catch-up (weekly count of aired unwatched episodes), reopen nudge (days).
- **One-off alerts** (`notifyEvents.ts`): "ended" and "new season" come from diffing the cached catalog against the last snapshot (`CacheKey.NOTIFY_SEEN`; a first run only records); "air date changed" compares a pushed correction with what the device knew. They post now, or at the quiet-hours morning (`oneOffTime`). Ids `evt-…` are outside `OUR_PREFIXES`, so a re-plan leaves them alone.
- **Quiet hours:** start / end / morning hour, active weekdays, mode (hold till morning / let premieres, finales and movie releases through / skip).
- **Timing & grouping:** default hour for date-only alerts, look-ahead (7–60 days), max alerts per day (extras fold into one `overflow-` alert), overnight grouping, combine or split episodes of one show, rows per expanded alert.
- **Look & sound:** picture on / off, spoiler-safe (no episode name, no still), importance, lock-screen visibility, sound, vibration. Android freezes a channel's settings once created, so each combination is its own channel `airings-{priority}-{sound}{vibrate}-{visibility}`; old variants are deleted and alerts store `data.channel`, so a change re-schedules them onto the new one.
- **Number settings use a slider plus a typed box** (`NumberSlider`, `sliderMath.ts`, limits in `LIMITS` of `notifyConfig.ts`): snooze / vacation / reminder / digest-window days 1–14, reopen nudge and look-ahead 1–30, alerts per day 0–10 (0 = no limit), rows 2–10. The box takes digits only (never negative) up to `custom` (365 days, 60 for the window and look-ahead, 50 alerts, 20 rows); past the slider's end the thumb sits at the end. The parser clamps saved values to the same `min`–`custom`. Movie reminders are one or two "days before" values. Selected chips, switches and the slider use `colors.primary` (the brand red), not the accent.
- **Titles:** mute a title for a week / month / for good, or "only chosen titles" (`muted`, `solo`; the Choose titles screen).
- Not built: action buttons on alerts (need background response handling), a time-zone override, movie release types.

## Files
- `app/src/utils/notifyConfig.ts` settings shape, defaults, presets, parsing; `notifyEvents.ts` one-off alert diffing
- `app/src/utils/airingPlan.ts` pure planner (tests in `app/tests/airingPlan.test.ts`, `notifySettings.test.ts`, `notifyEvents.test.ts`), `airingPush.ts`, `airingReplanSignal.ts`
- `app/src/screens/ProfileScreen/NotificationsScreen.tsx`, `NotificationTitlesScreen.tsx`, `NotificationControls.tsx`
- `app/src/services/airingScheduler.ts`, `airingTask.ts`, `titleTopics.ts`, `notifyPrefs.ts`
- `app/src/hooks/useAiringReplan.ts`, `app/index.ts` (background handler)
- `functions/src/cloudFunctions/notifyAirings.ts`, `functions/src/shared/airDates.ts`

## Known limits
- Force-stopped app or aggressive OEM task killers: no alarms or pushes until the app is reopened.
- Switches are per device. Old builds get nothing. iOS is not covered.
- Alerts use titles in the saved tracking pages and the cached catalog; nothing is fetched. Android groups notifications automatically, no explicit summary.

## Testing
- Settings → Updates (test) → "Send Sample Alerts" posts one alert of every kind at once (from the saved titles) to check the styles.
- Settings → Updates (test) → "Schedule Fake Airing In 2 Min", swipe the app away, the alert fires. Reboot the emulator: it still fires. `adb shell am force-stop` means no delivery by design.
