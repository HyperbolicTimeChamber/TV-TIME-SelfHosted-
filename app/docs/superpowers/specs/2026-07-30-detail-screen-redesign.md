# ShowDetailScreen Redesign

## Summary

Redesign ShowDetailScreen with immersive backdrop, parallax scrolling, translucent title island, pill-styled action buttons, floating back button, and movie credits section. Applies to both TV and movie detail views.

## Layout Structure

```
[Absolute: Backdrop image — full width, ~350px, parallax at 0.5x scroll speed]
[Absolute: Floating back chevron — top-left over image]
[Absolute: Share button — top-right, commented out for later]

[Animated.ScrollView — transparent, scrolls over backdrop]
  [Spacer — ~250px, pushes content below visible image area]
  [Translucent Island — semi-transparent dark overlay with blur]
    - Title (large, bold, white)
    - Meta line: year . seasons/runtime . rating
  [Gradient fade — LinearGradient from transparent to colors.background]
  [Action Pills — full-width row, rounded pill buttons]
  [Overview text]
  [Movie: Credits — Director, Screenplay, Production]
  [TV: Seasons — existing SeasonDropdown components]
```

## Scrolling Behavior

- Backdrop: `position: "absolute"`, full width, stays behind ScrollView
- Parallax: `Animated.event` with `useNativeDriver: true`, image `translateY: scrollY * 0.5`
- Content scrolls up over the image naturally via z-order
- Translucent island overlaps bottom of backdrop image

## Components

### Floating Back Button
- Absolute positioned, top-left (respects safe area inset)
- White chevron `<` on semi-transparent dark circle
- `onPress -> navigation.goBack()`

### Translucent Island
- `backgroundColor: rgba(0,0,0,0.5)` with `borderRadius` (no blur dep — just rgba overlay)
- Contains title + meta line (year, seasons/runtime, star rating)
- Positioned to overlap bottom portion of backdrop image
- Share button (commented out) would go top-right of this island

### Action Pills
- Full-width row, styled like ShowCard MOVIE/RECENT RELEASE tag pills
- Rounded, colored backgrounds, bold white text
- Colors:
  - Add to Watchlist: `colors.primary` (red)
  - Watched / Mark as Watched: `colors.watchedGreen`
  - Rewatch / Resume: `colors.accent` (blue)
  - Remove: `colors.destructiveRed` border, transparent bg
- `flexWrap: "wrap"` for overflow, `gap` between pills
- Same logic as current buttons, just restyled

### Gradient Fade
- `expo-linear-gradient` from `transparent` to `colors.background`
- Sits between translucent island and content area
- Creates smooth visual transition from image to content

### Credits Section (Movies Only)
- Section headers: "Director", "Screenplay", "Production"
- Names listed below each header
- Styled similar to reference image (accent-colored headers, white text names)

## Data Changes

### CatalogShow Type (app + functions)
Add to catalog type:
```ts
credits?: {
  directors: string[];
  writers: string[];
  producers: string[];
}
```

### TMDB Credits Extraction
Helper function to extract credits from TMDB crew array:
- Directors: `crew.filter(c => c.job === "Director")`
- Writers: `crew.filter(c => c.department === "Writing")`
- Producers: `crew.filter(c => c.job === "Producer")` (limit to 3)

### Cloud Functions
- **addShow**: When fetching show from TMDB for movies, extract credits from `credits.crew` and store in catalog doc
- **syncCatalog**: Same extraction on catalog updates for movies

### useShowDetails Hook
- `catalogShowToResult`: Map `catalog.credits` to show result so UI can access it
- Add `credits` field to `TMDBShow` type for direct TMDB responses (already returned via `append_to_response: "credits"`)

### TMDBShow Type
Add:
```ts
credits?: {
  crew: Array<{ job: string; department: string; name: string }>;
  cast?: Array<{ name: string; character: string }>;
}
```

## Navigation Changes

All 4 stack navigators (Home, Search, Calendar, Profile):
- Set `headerShown: false` on ShowDetail screen
- ShowDetailScreen handles its own back navigation via floating button

## Files Modified

### App
- `src/screens/DetailScreens/ShowDetailScreen.tsx` — full redesign
- `src/types/tmdb.ts` — add credits to TMDBShow
- `src/types/catalog.ts` — add credits to CatalogShow
- `src/hooks/useShowDetails.ts` — map credits from catalog
- `src/navigation/HomeStackScreen.tsx` — headerShown: false
- `src/navigation/SearchStackScreen.tsx` — headerShown: false
- `src/navigation/CalendarStackScreen.tsx` — headerShown: false
- `src/navigation/ProfileStackScreen.tsx` — headerShown: false

### Functions
- `functions/src/shared/types/catalog.ts` — add credits to CatalogShow
- `functions/src/hooks/tmdb.ts` — add credits extraction helper
- `functions/src/cloudFunctions/addShow/index.ts` — store credits for movies
- `functions/src/hooks/syncCatalog/fetchCatalogUpdates.ts` — store credits on sync

## Dependencies
- `expo-linear-gradient` — for gradient fade (check if already installed)
- No other new dependencies

## Testing
- Verify parallax scroll on iOS + Android
- Verify credits display for movies
- Verify TV shows still show seasons correctly
- Verify back button works from all 4 navigation stacks
- Verify no header bar visible
- Typecheck: `npx tsc --noEmit` in both `app/` and `functions/`
