# ShowDetailScreen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign ShowDetailScreen with immersive parallax backdrop, translucent title island, pill action buttons, floating back button, and movie credits section.

**Architecture:** Fixed backdrop image with parallax scrolling (0.5x), ScrollView content overlays image. Translucent island at image bottom shows title/meta. Credits stored in CatalogShow for zero-read repeat access. LinearGradient fades image to content.

**Tech Stack:** React Native Animated API (native driver), expo-linear-gradient, expo-image, react-native-safe-area-context

## Global Constraints

- Use enum values from `src/enums/index.ts` — never raw string literals
- `npx tsc --noEmit` must pass from both `app/` and `functions/` directories
- Never invalidate/refetch — always update cache locally via setQueryData
- Minimize Firestore reads — cache aggressively
- Functions types in `functions/src/shared/types.ts` (single barrel file)
- App catalog types in `app/src/types/catalog.ts`

---

### Task 1: Install expo-linear-gradient

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Install the package**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app
npx expo install expo-linear-gradient
```

- [ ] **Step 2: Verify installation**

```bash
grep "expo-linear-gradient" package.json
```

Expected: dependency listed in package.json

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add expo-linear-gradient dependency"
```

---

### Task 2: Add credits to CatalogShow types and TMDB extraction

**Files:**
- Modify: `functions/src/shared/types.ts` — add credits to TMDBShowDetail and CatalogShow
- Modify: `app/src/types/catalog.ts` — add credits to app-side CatalogShow
- Modify: `app/src/types/tmdb.ts` — add credits to TMDBShow
- Modify: `functions/src/hooks/tmdb.ts` — extract credits in fetchShowFromTMDB
- Modify: `app/src/hooks/useShowDetails.ts` — map credits from catalog

**Interfaces:**
- Produces: `CatalogShow.credits?: { directors: string[]; writers: string[]; producers: string[] }`
- Produces: `TMDBShow.credits?: { crew: Array<{ job: string; department: string; name: string }> }`

- [ ] **Step 1: Add credits to functions TMDBShowDetail type**

In `functions/src/shared/types.ts`, add to `TMDBShowDetail` interface:

```typescript
credits?: {
    crew: Array<{ job: string; department: string; name: string }>;
};
```

- [ ] **Step 2: Add credits to functions CatalogShow type**

In `functions/src/shared/types.ts`, add to `CatalogShow` interface:

```typescript
credits?: {
    directors: string[];
    writers: string[];
    producers: string[];
};
```

- [ ] **Step 3: Add credits to app-side CatalogShow type**

In `app/src/types/catalog.ts`, add to `CatalogShow` interface:

```typescript
credits?: {
    directors: string[];
    writers: string[];
    producers: string[];
};
```

- [ ] **Step 4: Add credits to app-side TMDBShow type**

In `app/src/types/tmdb.ts`, add to `TMDBShow` interface:

```typescript
credits?: {
    crew: Array<{ job: string; department: string; name: string }>;
};
```

- [ ] **Step 5: Update fetchShowFromTMDB to request and extract credits for movies**

In `functions/src/hooks/tmdb.ts`, modify `fetchShowFromTMDB`:

Change the axios.get call to append credits for movies:

```typescript
const { data } = await axios.get<TMDBShowDetail>(endpoint, {
    params: {
        api_key: apiKey,
        ...(mediaType === MediaType.MOVIE && { append_to_response: "credits" }),
    },
});
```

After the `genres` line in the return object, add credits extraction:

```typescript
...(mediaType === MediaType.MOVIE && data.credits?.crew
    ? {
            credits: {
                directors: data.credits.crew
                    .filter((c) => c.job === "Director")
                    .map((c) => c.name),
                writers: data.credits.crew
                    .filter((c) => c.department === "Writing")
                    .map((c) => c.name),
                producers: data.credits.crew
                    .filter((c) => c.job === "Producer")
                    .map((c) => c.name)
                    .slice(0, 3),
            },
        }
    : {}),
```

- [ ] **Step 6: Update useShowDetails to map credits from catalog**

In `app/src/hooks/useShowDetails.ts`, in the `catalogShowToResult` function, after the `runtime` line in the `show` object:

```typescript
credits: catalog.credits
    ? {
            crew: [
                ...catalog.credits.directors.map((name) => ({
                    job: "Director",
                    department: "Directing",
                    name,
                })),
                ...catalog.credits.writers.map((name) => ({
                    job: "Writer",
                    department: "Writing",
                    name,
                })),
                ...catalog.credits.producers.map((name) => ({
                    job: "Producer",
                    department: "Production",
                    name,
                })),
            ],
        }
    : undefined,
```

- [ ] **Step 7: Typecheck both projects**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(data): add credits to CatalogShow types and TMDB extraction"
```

---

### Task 3: Update syncCatalog to persist credits on sync

**Files:**
- Modify: `functions/src/hooks/syncCatalog/fetchCatalogUpdates.ts` — add credits to pendingWrites for movies

**Interfaces:**
- Consumes: `fetchShowFromTMDB` now returns `credits` for movies
- Produces: credits stored in catalog doc on sync

- [ ] **Step 1: Add credits to pendingWrites data**

In `functions/src/hooks/syncCatalog/fetchCatalogUpdates.ts`, in the `pendingWrites.push` block, add after the `genres` line:

```typescript
...(freshData.credits ? { credits: freshData.credits } : {}),
```

Note: `fetchShowFromTMDB` is only called for TV shows in syncCatalog (movies don't get synced). But adding this defensively ensures if movies ever get synced, credits propagate. The credits field will only be populated when `fetchShowFromTMDB` is called with `MediaType.MOVIE`.

- [ ] **Step 2: Typecheck functions**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(sync): propagate credits field in syncCatalog writes"
```

---

### Task 4: Hide navigation header on ShowDetail in all stacks

**Files:**
- Modify: `app/src/navigation/HomeStackScreen.tsx:21` — add headerShown: false
- Modify: `app/src/navigation/SearchStackScreen.tsx:57` — add headerShown: false
- Modify: `app/src/navigation/CalendarStackScreen.tsx:20` — add headerShown: false
- Modify: `app/src/navigation/ProfileStackScreen.tsx:32` — add headerShown: false

**Interfaces:**
- Produces: ShowDetail screen renders without native header bar

- [ ] **Step 1: Update HomeStackScreen**

Change:
```typescript
options={{ headerTitle: "" }}
```
To:
```typescript
options={{ headerShown: false }}
```

- [ ] **Step 2: Update SearchStackScreen**

Same change on the ShowDetail screen options:
```typescript
options={{ headerShown: false }}
```

- [ ] **Step 3: Update CalendarStackScreen**

Same change:
```typescript
options={{ headerShown: false }}
```

- [ ] **Step 4: Update ProfileStackScreen**

Same change:
```typescript
options={{ headerShown: false }}
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "style(nav): hide header on ShowDetail screen in all stacks"
```

---

### Task 5: Redesign ShowDetailScreen UI

This is the main UI task. Complete rewrite of the render section and styles in `ShowDetailScreen.tsx`.

**Files:**
- Modify: `app/src/screens/DetailScreens/ShowDetailScreen.tsx` — full UI redesign

**Interfaces:**
- Consumes: `headerShown: false` (Task 4), `expo-linear-gradient` (Task 1), `TMDBShow.credits` (Task 2)
- Consumes: `useSafeAreaInsets` from `react-native-safe-area-context`
- Consumes: `useNavigation` from `@react-navigation/native`

- [ ] **Step 1: Add new imports**

Add these imports to the top of ShowDetailScreen.tsx:

```typescript
import { Animated, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
```

Remove `ScrollView` and `RefreshControl` from the `react-native` import (replace with `Animated` usage). Keep all other existing imports.

Update the react-native import to:
```typescript
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Animated,
    Dimensions,
} from "react-native";
```

- [ ] **Step 2: Add constants and refs**

Inside the component function, after the existing state declarations, add:

```typescript
const navigation = useNavigation();
const insets = useSafeAreaInsets();
const scrollY = React.useRef(new Animated.Value(0)).current;
const { width: screenWidth } = Dimensions.get("window");
const BACKDROP_HEIGHT = 350;
```

- [ ] **Step 3: Extract credits data for movies**

After the `year` variable, add credits extraction:

```typescript
const directors = show?.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) ?? [];
const writers = show?.credits?.crew?.filter((c) => c.department === "Writing").map((c) => c.name) ?? [];
const producers = show?.credits?.crew?.filter((c) => c.job === "Producer").map((c) => c.name) ?? [];
```

- [ ] **Step 4: Replace the entire return JSX (main render)**

Replace the `return (<ScrollView ...>` block (lines ~442-625) with:

```tsx
return (
    <View style={styles.container}>
        {/* Fixed parallax backdrop */}
        <Animated.View
            style={[
                styles.backdrop,
                {
                    height: BACKDROP_HEIGHT,
                    transform: [
                        {
                            translateY: scrollY.interpolate({
                                inputRange: [0, BACKDROP_HEIGHT],
                                outputRange: [0, BACKDROP_HEIGHT * 0.5],
                                extrapolate: "clamp",
                            }),
                        },
                    ],
                },
            ]}
        >
            <View style={[StyleSheet.absoluteFill, styles.backdropSkeleton]} />
            <Image
                source={{
                    uri: `${posterSize.large}${show.backdrop_path || show.poster_path}`,
                }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
            />
        </Animated.View>

        {/* Floating back button */}
        <TouchableOpacity
            style={[styles.backButton, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* Share button - commented out for later */}
        {/* <TouchableOpacity
            style={[styles.shareButton, { top: insets.top + 8 }]}
            onPress={() => {}}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
            <Ionicons name="share-outline" size={22} color={colors.text} />
        </TouchableOpacity> */}

        {/* Scrollable content */}
        <Animated.ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{ paddingBottom: spacing.xxl }}
            onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true },
            )}
            scrollEventThrottle={16}
        >
            {/* Spacer to push content below backdrop */}
            <View style={{ height: BACKDROP_HEIGHT - 100 }} />

            {/* Translucent island */}
            <View style={styles.island}>
                <Text style={styles.islandTitle}>{title}</Text>
                <Text style={styles.islandMeta}>
                    {year}
                    {mediaType === MediaType.TV && show.number_of_seasons
                        ? ` · ${show.number_of_seasons} Season${show.number_of_seasons > 1 ? "s" : ""}`
                        : ""}
                    {mediaType === MediaType.MOVIE && show.runtime
                        ? ` · ${Math.floor(show.runtime / 60)}h ${show.runtime % 60}m`
                        : ""}
                    {show.vote_average ? ` · ★ ${show.vote_average.toFixed(1)}` : ""}
                </Text>
            </View>

            {/* Gradient fade from image to content */}
            <LinearGradient
                colors={["transparent", colors.background]}
                style={styles.gradientFade}
            />

            {/* Content area */}
            <View style={styles.content}>
                {/* Action pills */}
                <View style={styles.pillRow}>
                    {!watchlistItem ? (
                        <>
                            <TouchableOpacity
                                style={[styles.pill, styles.pillPrimary, adding && styles.pillDisabled]}
                                onPress={handleAddToWatchlist}
                                disabled={adding}
                            >
                                {adding ? (
                                    <ActivityIndicator size="small" color={colors.text} />
                                ) : (
                                    <Text style={styles.pillText}>+ Add to Watchlist</Text>
                                )}
                            </TouchableOpacity>
                            {mediaType === MediaType.MOVIE && (
                                <TouchableOpacity
                                    style={[styles.pill, styles.pillWatched, adding && styles.pillDisabled]}
                                    onPress={handleMarkMovieWatched}
                                    disabled={adding}
                                >
                                    {adding ? (
                                        <ActivityIndicator size="small" color={colors.text} />
                                    ) : (
                                        <Text style={styles.pillText}>Watched</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        </>
                    ) : (
                        <>
                            {mediaType === MediaType.MOVIE && watchlistItem.status !== WatchStatus.COMPLETED && (
                                <TouchableOpacity
                                    style={[styles.pill, styles.pillWatched, adding && styles.pillDisabled]}
                                    onPress={handleMarkMovieWatched}
                                    disabled={adding}
                                >
                                    {adding ? (
                                        <ActivityIndicator size="small" color={colors.text} />
                                    ) : (
                                        <Text style={styles.pillText}>Mark as Watched</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                            {mediaType === MediaType.MOVIE && watchlistItem.status === WatchStatus.COMPLETED && (
                                <View style={[styles.pill, styles.pillWatched, { opacity: 0.7 }]}>
                                    <Text style={styles.pillText}>
                                        Watched{movieWatchCount > 0 ? ` ${movieWatchCount}x` : ""} ✓
                                    </Text>
                                </View>
                            )}
                            {(watchlistItem.status === WatchStatus.COMPLETED ||
                                watchlistItem.status === WatchStatus.PAUSED ||
                                watchlistItem.status === WatchStatus.PAUSED_REWATCH ||
                                (watchlistItem.status === WatchStatus.WATCHING &&
                                    mediaType === MediaType.TV &&
                                    !watchlistItem.nextEpisode)) && (
                                <TouchableOpacity
                                    style={[styles.pill, styles.pillAccent]}
                                    onPress={handleResumeOrRewatch}
                                    onLongPress={
                                        mediaType === MediaType.MOVIE && movieWatchCount > 0
                                            ? () => setMovieSheetVisible(true)
                                            : undefined
                                    }
                                >
                                    <Text style={styles.pillText}>
                                        {watchlistItem.status === WatchStatus.PAUSED
                                            ? "Resume"
                                            : watchlistItem.status === WatchStatus.PAUSED_REWATCH
                                                ? "Resume Rewatch"
                                                : "Rewatch"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[styles.pill, styles.pillRemove, removing && styles.pillDisabled]}
                                onPress={handleRemove}
                                disabled={removing}
                            >
                                {removing ? (
                                    <ActivityIndicator size="small" color={colors.destructiveRed} />
                                ) : (
                                    <Text style={styles.pillRemoveText}>Remove</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                {/* Overview */}
                <Text style={styles.overview}>{show.overview}</Text>

                {/* Credits — movies only */}
                {mediaType === MediaType.MOVIE && (directors.length > 0 || writers.length > 0 || producers.length > 0) && (
                    <View style={styles.creditsSection}>
                        {directors.length > 0 && (
                            <View style={styles.creditBlock}>
                                <Text style={styles.creditLabel}>Director</Text>
                                <Text style={styles.creditNames}>{directors.join(", ")}</Text>
                            </View>
                        )}
                        {writers.length > 0 && (
                            <View style={styles.creditBlock}>
                                <Text style={styles.creditLabel}>Screenplay</Text>
                                <Text style={styles.creditNames}>{writers.join(", ")}</Text>
                            </View>
                        )}
                        {producers.length > 0 && (
                            <View style={styles.creditBlock}>
                                <Text style={styles.creditLabel}>Production</Text>
                                <Text style={styles.creditNames}>{producers.join(", ")}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Seasons — TV only */}
                {mediaType === MediaType.TV && show.seasons && (
                    <View style={styles.seasonsSection}>
                        <Text style={styles.sectionTitle}>Seasons</Text>
                        {show.seasons
                            .filter((s) => s.season_number > 0)
                            ?.map((season) => (
                                <SeasonDropdown
                                    key={season.season_number}
                                    tmdbId={tmdbId}
                                    season={season}
                                    showTitle={title}
                                    showPosterPath={show.poster_path}
                                    showBackdropPath={show.backdrop_path || null}
                                    isTracked={!!watchlistItem}
                                    preloadedEpisodes={episodesBySeason.get(season.season_number)}
                                    refreshKey={refreshKey}
                                />
                            ))}
                    </View>
                )}
            </View>
        </Animated.ScrollView>

        <ConfirmModal
            visible={removeModalVisible}
            title={`Remove "${title}"?`}
            hint="This will remove it from your watchlist. Your watch history will be kept."
            error={removeError}
            confirmLabel="Remove"
            loading={removing}
            onConfirm={handleConfirmRemove}
            onClose={() => {
                setRemoveModalVisible(false);
                setRemoveError(null);
            }}
        />

        <UnreleasedMovieModal
            visible={!!unreleasedModal}
            onClose={() => setUnreleasedModal(null)}
            movieTitle={unreleasedModal?.title ?? ""}
        />

        <WatchActionSheet
            visible={movieSheetVisible}
            label={show?.title || show?.name || "Movie"}
            watchCount={movieWatchCount}
            onSelect={handleMovieSheetAction}
            onClose={() => setMovieSheetVisible(false)}
        />
    </View>
);
```

- [ ] **Step 5: Replace the entire styles object**

Replace `const styles = StyleSheet.create({...})` with:

```typescript
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    center: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
    },
    errorText: {
        ...typography.body,
        color: colors.textSecondary,
    },
    backdrop: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        overflow: "hidden",
    },
    backdropSkeleton: {
        backgroundColor: colors.surfaceLight,
    },
    backButton: {
        position: "absolute",
        left: 16,
        zIndex: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.badgeOverlay,
        alignItems: "center",
        justifyContent: "center",
    },
    shareButton: {
        position: "absolute",
        right: 16,
        zIndex: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.badgeOverlay,
        alignItems: "center",
        justifyContent: "center",
    },
    island: {
        marginHorizontal: spacing.lg,
        backgroundColor: "rgba(0,0,0,0.55)",
        borderRadius: 12,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    islandTitle: {
        ...typography.title,
        fontSize: 24,
    },
    islandMeta: {
        ...typography.caption,
        marginTop: spacing.xs,
    },
    gradientFade: {
        height: 60,
        marginTop: -1,
    },
    content: {
        backgroundColor: colors.background,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
    },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    pill: {
        flex: 1,
        minWidth: 100,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    pillPrimary: {
        backgroundColor: colors.primary,
    },
    pillWatched: {
        backgroundColor: colors.watchedGreen,
    },
    pillAccent: {
        backgroundColor: colors.accent,
    },
    pillRemove: {
        backgroundColor: "transparent",
        borderWidth: 1.5,
        borderColor: colors.destructiveRed,
    },
    pillDisabled: {
        opacity: 0.6,
    },
    pillText: {
        ...typography.subtitle,
        fontSize: 13,
        color: colors.text,
    },
    pillRemoveText: {
        ...typography.subtitle,
        fontSize: 13,
        color: colors.destructiveRed,
    },
    overview: {
        ...typography.body,
        color: colors.textSecondary,
        lineHeight: 22,
    },
    creditsSection: {
        marginTop: spacing.xl,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.lg,
    },
    creditBlock: {
        minWidth: 100,
    },
    creditLabel: {
        ...typography.subtitle,
        fontSize: 14,
        color: colors.accent,
        marginBottom: spacing.xs,
    },
    creditNames: {
        ...typography.body,
        color: colors.text,
    },
    seasonsSection: {
        marginTop: spacing.xl,
    },
    sectionTitle: {
        ...typography.title,
        fontSize: 18,
        marginBottom: spacing.md,
    },
});
```

- [ ] **Step 6: Remove unused imports**

Remove `RefreshControl` and `ScrollView` from react-native import (now using `Animated.ScrollView`). Also remove the `refreshing`/`refreshKey`/`handleRefresh` state and callback since pull-to-refresh is removed (backdrop covers the pull area). Keep `refreshKey` if it's used by `SeasonDropdown`.

Actually, keep `refreshKey` — it's passed to `SeasonDropdown`. Remove `refreshing` state and `handleRefresh` callback, and the `RefreshControl` import.

- [ ] **Step 7: Typecheck**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): redesign ShowDetailScreen with parallax backdrop and pills"
```

---

### Task 6: Build and deploy Cloud Functions

**Files:**
- Modified in Task 2-3: `functions/src/shared/types.ts`, `functions/src/hooks/tmdb.ts`, `functions/src/hooks/syncCatalog/fetchCatalogUpdates.ts`

- [ ] **Step 1: Build functions**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions && npm run build
```

- [ ] **Step 2: Deploy**

```bash
firebase deploy --only functions
```

- [ ] **Step 3: Commit (if any build artifacts changed)**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: build functions for credits support"
```

---

### Task 7: Final typecheck, push, and verify

- [ ] **Step 1: Typecheck both projects**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions && npx tsc --noEmit
```

- [ ] **Step 2: Push all commits**

```bash
git push
```

- [ ] **Step 3: Manual verification checklist**

- Open app, navigate to a movie detail → verify parallax backdrop, translucent island, pill buttons, credits section
- Navigate to a TV show detail → verify parallax backdrop, translucent island, pill buttons, seasons section (no credits)
- Verify back chevron works from all 4 stacks (Home, Search, Calendar, Profile)
- Verify no native header bar visible
- Verify adding/removing from watchlist still works
- Verify movie watched/rewatch/remove flows
- Add a new movie → verify credits populate in catalog doc
