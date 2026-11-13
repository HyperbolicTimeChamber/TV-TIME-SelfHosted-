# UI misc and sheet checks

Moved from CLAUDE.md; loaded on demand.

- **Photo viewer:** `components/PhotoViewer` (app + web; `PhotoTrigger` wraps a thumbnail; people are a circle). The View All cast sheet has no viewer, just an IMDb link per row (`useResolveSubjectLink`, on tap). Pill link from `hooks/useSubjectLink`: a person's IMDb page, a studio's own website else its TMDB page. Links are stored with the person / studio on the title (`imdbId`, `studioType` + `homepage`); missing ones come from the `subjectLink` CF (public, single instance + queueing TMDB limit + in-flight dedupe, serves only subjects of that title), which stores them; syncTitleExtras keeps them (`carryLinks`). Stored studios mix TMDB networks and companies whose ids collide, so the CF picks the record with the studio's logo.
- **Search back navigation:** the suggestions page opens over whatever it came from (`push`), so back / right swipe returns there with its results untouched. A new search `reset`s the stack (`SearchInputScreen`) to one results page above Trending; web steps back in history, then replaces.
- **System font size:** the fixed-height cards and calendar cells cap their text at `CARD_MAX_FONT_SCALE` (`components/CardInfo`); at Android's 2× the lines no longer fit. Check with `adb shell settings put system font_scale 2.0`.

## Sheet checks (any bottom sheet with a search / text field — e.g. the cast sheet)
Run on the Android emulator with the **full on-screen keyboard** (AVD `hw.keyboard = no` in `~/.android/avd/Pixel_9_Pro.avd/config.ini`; with a hardware keyboard Gboard only shows a floating toolbar and hides every keyboard bug) and on web in the emulator's Chrome:
- **Results never resize the sheet:** open at half, search something with one match ("gandalf"), then nonsense, then clear — the sheet's height must not change (no "dance"). Web: the list has a fixed height.
- **Keyboard avoiding:** with the keyboard up the sheet sits on top of it (only shortened when it wouldn't fit), its list ends at the keyboard (no blank band, nothing under it); hiding the keyboard (back key) returns it to the snap it had before (half stays half). App: a Gorhom sheet in a RN `Modal` — `keyboardBehavior="interactive"` + default `adjustPan`, own restore to the pre-keyboard snap (Gorhom re-indexes the lifted sheet as full). Web: `BottomSheet` lifts itself by `useKeyboardInset` (visualViewport) and passes `--sheet-room`.
- **No double tap:** with the keyboard up, one tap on clear / a row / a button must act (not just close the keyboard) — lists use `keyboardShouldPersistTaps="handled"`.
- **Empty state:** Zoro's legs touch the visible bottom edge (screen, or the keyboard's top) at every snap, the message just above his head.
