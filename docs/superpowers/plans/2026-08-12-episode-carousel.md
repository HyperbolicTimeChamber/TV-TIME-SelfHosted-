# Episode Detail Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-episode detail modal into a horizontal FlatList carousel with lazy-loaded episode details, batch mark-watched with backfill confirmation, and unwatch/rewatch support.

**Architecture:** Refactor `EpisodeDetailModal` into a carousel wrapper containing a paging `FlatList`. Each card renders the existing episode layout. Detail data is fetched per-season (one TMDB call covers all episodes in a season) with catalog-first resolution. Watched state is tracked locally via a `Set<string>` with optimistic updates. A `ConfirmModal` handles backfill prompts when marking future episodes.

**Tech Stack:** React Native FlatList (pagingEnabled), existing AnimatedModal, existing ConfirmModal, Firestore batch writes via `markSeasonWatchedCF`, `useWatchedEpisodes` hook, TMDB `getSeasonDetails` API.

## Global Constraints

- Enums from `src/enums/index.ts` — no string literals
- Never invalidate/refetch queries — always `setQueryData`
- Minimize Firestore reads — catalog cache first, TMDB second, Firestore fallback third
- Typecheck: `npx tsc --noEmit` from `app/` must pass
- All existing callers (WatchlistTab, SeasonDropdown, UpcomingTab) must continue working

---

### Task 1: Refactor EpisodeDetailModal into Carousel

**Files:**
- Rewrite: `app/src/components/modals/EpisodeDetailModal.tsx`

**Interfaces:**
- Consumes: `AnimatedModal` (existing), `ConfirmModal` (existing), `useSharedShimmer` (existing)
- Produces: `EpisodeDetailModal` component with new carousel props interface used by Tasks 2-4

This task builds the full carousel UI. Mark-watched handlers are passed as props — the callers implement them in Tasks 2-4.

- [ ] **Step 1: Define types and new props interface**

At top of `EpisodeDetailModal.tsx`, add:

```tsx
export interface CarouselEpisode {
  season: number;
  episode: number;
  title: string | null;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  overview: string | null;
}

interface Props {
  visible: boolean;
  tmdbId: number;
  showTitle: string;
  showPosterPath: string | null;
  showBackdropPath: string | null;
  episodes: CarouselEpisode[];
  initialIndex: number;
  watchedKeys: Set<string>;
  currentNextEpisode: { season: number; episode: number } | null;
  onMarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
  onMarkWatchedThrough: (tmdbId: number, season: number, episode: number) => Promise<void>;
  onUnmarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
  onShowPress?: () => void;
  onClose: () => void;
  onLoadEpisodeDetails?: (season: number) => Promise<CarouselEpisode[] | null>;
}
```

- [ ] **Step 2: Build EpisodeCard renderItem component**

Inside the same file, create a `memo`-ized `EpisodeCard` component. Reuse the exact existing card layout (image with gradient, title pill, ep title, label, meta row, overview). Add watched-state button logic:

```tsx
const EpisodeCard = memo(function EpisodeCard({
  ep, showTitle, showPosterPath, showBackdropPath,
  isWatched, isLoaded, isMarking,
  onMarkWatched, onUnwatch, onRewatch, onShowPress,
}: {
  ep: CarouselEpisode;
  showTitle: string;
  showPosterPath: string | null;
  showBackdropPath: string | null;
  isWatched: boolean;
  isLoaded: boolean;
  isMarking: boolean;
  onMarkWatched: () => void;
  onUnwatch: () => void;
  onRewatch: () => void;
  onShowPress?: () => void;
}) {
  const shimmer = useSharedShimmer();
  const [imageLoaded, setImageLoaded] = useState(false);
  const label = `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`;

  // If not loaded, render skeleton card
  if (!isLoaded) {
    return (
      <View style={styles.cardContent}>
        <Animated.View style={[styles.still, { opacity: shimmer, backgroundColor: colors.border }]} />
        <View style={styles.scroll}>
          <Animated.View style={[styles.skeletonTitle, { opacity: shimmer }]} />
          <Animated.View style={[styles.skeletonLine, { opacity: shimmer }]} />
          <Animated.View style={[styles.skeletonLineShort, { opacity: shimmer }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cardContent}>
      {/* Image section — same as existing */}
      <View style={styles.imageContainer}>
        {!imageLoaded && <Animated.View style={[styles.imageSkeleton, { opacity: shimmer }]} />}
        {ep.stillPath ? (
          <Image source={{ uri: tmdbStillUri(ep.stillPath, CARD_WIDTH) }}
            style={styles.still} contentFit="cover" transition={300}
            onLoad={() => setImageLoaded(true)} />
        ) : showBackdropPath ? (
          <Image source={{ uri: tmdbBackdropUri(showBackdropPath, CARD_WIDTH) }}
            style={styles.still} contentFit="cover" transition={300}
            onLoad={() => setImageLoaded(true)} />
        ) : showPosterPath ? (
          <Image source={{ uri: tmdbPosterUri(showPosterPath, CARD_WIDTH) }}
            style={styles.still} contentFit="cover" transition={300}
            onLoad={() => setImageLoaded(true)} />
        ) : (
          <View style={styles.stillPlaceholder}>
            <Text style={styles.stillPlaceholderText}>E{String(ep.episode).padStart(2, "0")}</Text>
          </View>
        )}
        <LinearGradient colors={["transparent", colors.surface]} style={styles.imageGradient} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.titlePill} onPress={onShowPress} disabled={!onShowPress}>
          <Text style={styles.titlePillText} numberOfLines={1}>{showTitle.toUpperCase()}</Text>
          {onShowPress && <Text style={styles.titlePillArrowText}>›</Text>}
        </TouchableOpacity>
        {ep.title ? <Text style={styles.episodeTitle}>{ep.title}</Text> : null}
        <Text style={styles.label}>{label}</Text>
        <View style={styles.metaRow}>
          {ep.airDate ? <Text style={styles.meta}>{formatDate(ep.airDate)}</Text> : null}
          {ep.runtime ? <Text style={styles.meta}>{ep.airDate ? " · " : ""}{ep.runtime} min</Text> : null}
        </View>
        {ep.overview ? <Text style={styles.overview}>{ep.overview}</Text> : null}
      </ScrollView>

      {/* Button row */}
      {isWatched ? (
        <View style={styles.watchedButtonRow}>
          <TouchableOpacity style={styles.unwatchButton} onPress={onUnwatch} disabled={isMarking}>
            <Text style={styles.unwatchButtonText}>Unwatch</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rewatchButton} onPress={onRewatch} disabled={isMarking}>
            {isMarking ? <ActivityIndicator size="small" color={colors.text} /> :
              <Text style={styles.rewatchButtonText}>Rewatch</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[styles.watchButton, isMarking && { opacity: 0.6 }]}
          onPress={onMarkWatched} disabled={isMarking}>
          {isMarking ? <ActivityIndicator size="small" color={colors.text} /> :
            <Text style={styles.watchButtonText}>Mark as Watched</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
});
```

- [ ] **Step 3: Build the carousel wrapper**

Replace the existing `EpisodeDetailModal` default export with the carousel version:

```tsx
export default function EpisodeDetailModal({
  visible, tmdbId, showTitle, showPosterPath, showBackdropPath,
  episodes, initialIndex, watchedKeys, currentNextEpisode,
  onMarkWatched, onMarkWatchedThrough, onUnmarkWatched,
  onShowPress, onClose, onLoadEpisodeDetails,
}: Readonly<Props>) {
  const flatListRef = useRef<FlatList>(null);
  const [localWatched, setLocalWatched] = useState(watchedKeys);
  const [loadedEps, setLoadedEps] = useState<Map<string, CarouselEpisode>>(new Map());
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [markingKey, setMarkingKey] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Backfill confirm modal
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ season: number; episode: number } | null>(null);

  // Sync watched keys from parent
  useEffect(() => { setLocalWatched(watchedKeys); }, [watchedKeys]);

  // Key helper
  const epKey = (s: number, e: number) =>
    `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;

  // Initialize loaded episodes from the episodes array (catalog data)
  useEffect(() => {
    if (!visible) return;
    const map = new Map<string, CarouselEpisode>();
    const start = Math.max(0, initialIndex);
    const end = Math.min(episodes.length, start + 3);
    for (let i = start; i < end; i++) {
      const ep = episodes[i];
      if (ep.overview || ep.stillPath) {
        map.set(epKey(ep.season, ep.episode), ep);
      }
    }
    setLoadedEps(map);
    setActiveIndex(initialIndex);
  }, [visible]);

  // Load details for episodes near the active index
  const loadAround = useCallback(async (index: number) => {
    const toLoad: number[] = [];
    for (let i = index; i <= Math.min(index + 2, episodes.length - 1); i++) {
      const ep = episodes[i];
      const key = epKey(ep.season, ep.episode);
      if (!loadedEps.has(key) && !(ep.overview && ep.stillPath)) {
        toLoad.push(i);
      }
    }
    if (toLoad.length === 0) return;

    // Group by season — one fetch per season
    const seasonNums = new Set(toLoad.map((i) => episodes[i].season));
    for (const sn of seasonNums) {
      let seasonEps: CarouselEpisode[] | null = null;
      if (onLoadEpisodeDetails) {
        seasonEps = await onLoadEpisodeDetails(sn);
      }
      if (seasonEps) {
        setLoadedEps((prev) => {
          const next = new Map(prev);
          for (const ep of seasonEps!) {
            next.set(epKey(ep.season, ep.episode), ep);
          }
          return next;
        });
      } else {
        // Fallback: mark catalog-only eps as loaded (no overview/still)
        setLoadedEps((prev) => {
          const next = new Map(prev);
          for (const i of toLoad) {
            const ep = episodes[i];
            if (ep.season === sn) {
              next.set(epKey(ep.season, ep.episode), ep);
            }
          }
          return next;
        });
      }
    }
  }, [episodes, loadedEps, onLoadEpisodeDetails]);

  // On viewable change
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const idx = viewableItems[0].index;
      setActiveIndex(idx);
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // Load when active index changes
  useEffect(() => {
    const ep = episodes[activeIndex];
    if (!ep) return;
    const key = epKey(ep.season, ep.episode);
    if (!loadedEps.has(key)) {
      setScrollEnabled(false);
      loadAround(activeIndex).then(() => setScrollEnabled(true));
    } else {
      loadAround(activeIndex);
    }
  }, [activeIndex]);

  // Handle mark watched with backfill check
  const handleMark = useCallback((ep: CarouselEpisode) => {
    const key = epKey(ep.season, ep.episode);
    if (!currentNextEpisode) {
      // No pointer — just mark
      setMarkingKey(key);
      onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
        setLocalWatched((prev) => new Set(prev).add(key));
        setMarkingKey(null);
      });
      return;
    }

    // Check if this ep is ahead of currentNextEpisode with gaps
    const isAhead =
      ep.season > currentNextEpisode.season ||
      (ep.season === currentNextEpisode.season && ep.episode > currentNextEpisode.episode);
    const isNext =
      ep.season === currentNextEpisode.season && ep.episode === currentNextEpisode.episode;

    if (isNext || !isAhead) {
      // Current next or behind — mark directly
      setMarkingKey(key);
      onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
        setLocalWatched((prev) => new Set(prev).add(key));
        setMarkingKey(null);
      });
    } else {
      // Ahead — check for unwatched gaps
      const hasGaps = episodes.some((e) => {
        const eKey = epKey(e.season, e.episode);
        const isBetween =
          (e.season > currentNextEpisode.season ||
            (e.season === currentNextEpisode.season && e.episode >= currentNextEpisode.episode)) &&
          (e.season < ep.season || (e.season === ep.season && e.episode < ep.episode));
        return isBetween && !localWatched.has(eKey);
      });

      if (hasGaps) {
        setConfirmTarget({ season: ep.season, episode: ep.episode });
        setConfirmVisible(true);
      } else {
        setMarkingKey(key);
        onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
          setLocalWatched((prev) => new Set(prev).add(key));
          setMarkingKey(null);
        });
      }
    }
  }, [currentNextEpisode, episodes, localWatched, tmdbId, onMarkWatched]);

  // Confirm backfill — mark all through target
  const handleConfirmBackfill = useCallback(async () => {
    if (!confirmTarget) return;
    setConfirmVisible(false);
    const key = epKey(confirmTarget.season, confirmTarget.episode);
    setMarkingKey(key);

    await onMarkWatchedThrough(tmdbId, confirmTarget.season, confirmTarget.episode);

    // Optimistically mark all eps up through target as watched
    setLocalWatched((prev) => {
      const next = new Set(prev);
      for (const ep of episodes) {
        if (
          ep.season < confirmTarget.season ||
          (ep.season === confirmTarget.season && ep.episode <= confirmTarget.episode)
        ) {
          next.add(epKey(ep.season, ep.episode));
        }
      }
      return next;
    });
    setMarkingKey(null);
    setConfirmTarget(null);
  }, [confirmTarget, tmdbId, episodes, onMarkWatchedThrough]);

  // Decline backfill — mark only target
  const handleDeclineBackfill = useCallback(async () => {
    if (!confirmTarget) return;
    setConfirmVisible(false);
    const key = epKey(confirmTarget.season, confirmTarget.episode);
    setMarkingKey(key);

    await onMarkWatched(tmdbId, confirmTarget.season, confirmTarget.episode);
    setLocalWatched((prev) => new Set(prev).add(key));
    setMarkingKey(null);
    setConfirmTarget(null);
  }, [confirmTarget, tmdbId, onMarkWatched]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: CARD_WIDTH, offset: CARD_WIDTH * index, index,
  }), []);

  const renderItem = useCallback(({ item, index }: { item: CarouselEpisode; index: number }) => {
    const key = epKey(item.season, item.episode);
    const isWatched = localWatched.has(key);
    const isLoaded = loadedEps.has(key);
    const resolvedEp = loadedEps.get(key) ?? item;

    return (
      <View style={{ width: CARD_WIDTH }}>
        <EpisodeCard
          ep={resolvedEp}
          showTitle={showTitle}
          showPosterPath={showPosterPath}
          showBackdropPath={showBackdropPath}
          isWatched={isWatched}
          isLoaded={isLoaded}
          isMarking={markingKey === key}
          onMarkWatched={() => handleMark(resolvedEp)}
          onUnwatch={() => {
            setMarkingKey(key);
            onUnmarkWatched(tmdbId, item.season, item.episode).finally(() => {
              setLocalWatched((prev) => { const n = new Set(prev); n.delete(key); return n; });
              setMarkingKey(null);
            });
          }}
          onRewatch={() => {
            setMarkingKey(key);
            onMarkWatched(tmdbId, item.season, item.episode).finally(() => setMarkingKey(null));
          }}
          onShowPress={onShowPress}
        />
      </View>
    );
  }, [localWatched, loadedEps, markingKey, handleMark, showTitle, showPosterPath, showBackdropPath, tmdbId, onUnmarkWatched, onMarkWatched, onShowPress]);

  const confirmLabel = confirmTarget
    ? `E${String(currentNextEpisode?.episode ?? 1).padStart(2, "0")}–E${String(confirmTarget.episode).padStart(2, "0")}`
    : "";

  return (
    <AnimatedModal visible={visible} onClose={onClose}>
      <View style={styles.carouselContainer}>
        <FlatList
          ref={flatListRef}
          data={episodes}
          renderItem={renderItem}
          keyExtractor={(item) => epKey(item.season, item.episode)}
          horizontal
          pagingEnabled
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />
      </View>
      <ConfirmModal
        visible={confirmVisible}
        title="Mark Previous Episodes?"
        hint={`Mark episodes ${confirmLabel} as watched?`}
        confirmLabel="Mark All"
        confirmColor={colors.watchedGreen}
        onConfirm={handleConfirmBackfill}
        onClose={() => {
          handleDeclineBackfill();
        }}
      />
    </AnimatedModal>
  );
}
```

- [ ] **Step 4: Add styles**

Add these styles to the existing `StyleSheet.create` (keep all existing styles, add new ones):

```tsx
const CARD_WIDTH = Math.min(Dimensions.get("window").width * 0.8, 320);

// Add to styles:
carouselContainer: {
  width: CARD_WIDTH,
  backgroundColor: colors.surface,
  borderRadius: 12,
  overflow: "hidden",
  maxHeight: Dimensions.get("window").height * 0.8,
},
cardContent: {
  width: CARD_WIDTH,
  backgroundColor: colors.surface,
},
watchedButtonRow: {
  flexDirection: "row",
  gap: spacing.sm,
  marginHorizontal: spacing.lg,
  marginBottom: spacing.lg,
},
unwatchButton: {
  flex: 1,
  backgroundColor: colors.destructiveRed,
  paddingVertical: spacing.md,
  borderRadius: 8,
  alignItems: "center",
},
unwatchButtonText: {
  ...typography.subtitle,
  fontSize: 14,
  color: colors.text,
},
rewatchButton: {
  flex: 1,
  backgroundColor: colors.primary,
  paddingVertical: spacing.md,
  borderRadius: 8,
  alignItems: "center",
},
rewatchButtonText: {
  ...typography.subtitle,
  fontSize: 14,
  color: colors.text,
},
skeletonTitle: {
  height: 16,
  width: "60%",
  borderRadius: 4,
  backgroundColor: colors.border,
  marginBottom: spacing.sm,
},
skeletonLine: {
  height: 12,
  borderRadius: 4,
  backgroundColor: colors.border,
  marginBottom: spacing.sm,
},
skeletonLineShort: {
  height: 12,
  width: "70%",
  borderRadius: 4,
  backgroundColor: colors.border,
},
```

- [ ] **Step 5: Typecheck and commit**

```bash
cd app && npx tsc --noEmit
git add src/components/modals/EpisodeDetailModal.tsx
git commit -m "feat(modal): refactor EpisodeDetailModal into carousel"
```

---

### Task 2: Update WatchlistTab Caller

**Files:**
- Modify: `app/src/screens/HomeScreen/WatchlistTab/index.tsx`
- Modify: `app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts`

**Interfaces:**
- Consumes: `EpisodeDetailModal` new props from Task 1, existing `useWatchedEpisodes`, `markEpisodeWatched`, `markSeasonWatchedCF`, `unmarkEpisodeWatched` from services
- Produces: Working carousel from watchlist card press

- [ ] **Step 1: Add `handleMarkWatchedThrough` to `useWatchlistData.ts`**

Add a new exported handler that batch-marks all episodes from current `nextEpisode` through a target episode. Uses `markSeasonWatchedCF` for the batch write (same as `SeasonDropdown.doMarkEpisodeRange`). Add after `handleMarkWatched`:

```tsx
const handleMarkWatchedThrough = useCallback(
  async (tmdbId: number, targetSeason: number, targetEpisode: number) => {
    if (!userId) return;
    const item = items.find((i) => i.tmdbId === tmdbId);
    if (!item || !item.catalogShow) return;

    const currentNext = item.nextEpisode ?? { season: 1, episode: 1 };
    const catalog = item.catalogShow;

    // Collect all episodes from currentNext through target
    const epsToMark: Array<{ season: number; episodeNumber: number; name: string; runtime: number }> = [];
    for (const s of catalog.seasons ?? []) {
      for (const e of s.episodes) {
        const isAfterStart =
          s.seasonNumber > currentNext.season ||
          (s.seasonNumber === currentNext.season && e.episodeNumber >= currentNext.episode);
        const isBeforeEnd =
          s.seasonNumber < targetSeason ||
          (s.seasonNumber === targetSeason && e.episodeNumber <= targetEpisode);
        if (isAfterStart && isBeforeEnd) {
          epsToMark.push({
            season: s.seasonNumber,
            episodeNumber: e.episodeNumber,
            name: e.title || "",
            runtime: e.runtime || 0,
          });
        }
      }
    }

    if (epsToMark.length === 0) return;

    // Find what comes after the target episode
    const card = buildCardItem(item, todayStr());
    // Use findNextEpisodeInCatalog to get what's after the target
    const nextAfterTarget = findNextEpisodeInCatalog(catalog, targetSeason, targetEpisode);
    const nextEpisode = nextAfterTarget ? { season: nextAfterTarget.season, episode: nextAfterTarget.episode } : null;
    const isComplete = !nextAfterTarget;

    // Group by season for markSeasonWatchedCF
    const bySeason = new Map<number, typeof epsToMark>();
    for (const ep of epsToMark) {
      const list = bySeason.get(ep.season) ?? [];
      list.push(ep);
      bySeason.set(ep.season, list);
    }

    // Mark each season batch — only last batch updates tracking doc
    const seasonEntries = [...bySeason.entries()];
    for (let i = 0; i < seasonEntries.length; i++) {
      const [sn, eps] = seasonEntries[i];
      const isLast = i === seasonEntries.length - 1;
      await markSeasonWatchedCF(
        tmdbId, sn,
        eps.map((e) => ({ episodeNumber: e.episodeNumber, name: e.name, runtime: e.runtime })),
        isLast ? nextEpisode : null,
        isLast ? isComplete : false,
        isLast ? (nextAfterTarget?.title ?? null) : null,
        isLast ? (nextAfterTarget?.airDate ?? null) : null,
      );
    }

    // Insert all into watched cache
    const now = Timestamp.now();
    for (const ep of epsToMark) {
      insertWatchedEpisodeCache(queryClient, userId, {
        id: `${tmdbId}_S${String(ep.season).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`,
        tmdbShowId: tmdbId,
        season: ep.season,
        episode: ep.episodeNumber,
        episodeTitle: ep.name,
        runtime: ep.runtime,
        lastWatchedAt: now,
        watchedAt: now,
        watchCount: 1,
      });
    }
  },
  [userId, items, queryClient],
);
```

Export it from the hook's return value alongside `handleMarkWatched`.

- [ ] **Step 2: Add `handleUnmarkEpisode` to `useWatchlistData.ts`**

```tsx
const handleUnmarkEpisode = useCallback(
  async (tmdbId: number, season: number, episode: number) => {
    if (!userId) return;
    const item = items.find((i) => i.tmdbId === tmdbId);
    const catalog = item?.catalogShow;
    const catalogSeason = catalog?.seasons?.find((s) => s.seasonNumber === season);
    const catalogEp = catalogSeason?.episodes?.find((e) => e.episodeNumber === episode);

    await unmarkEpisodeWatched(
      userId, tmdbId, season, episode,
      catalogEp?.runtime || 0,
      catalogEp?.title || null,
      catalogEp?.airDate || null,
    );
    removeWatchedEpisodeCache(queryClient, userId, tmdbId, season, episode);
    decrementDailyWatch("episode");
  },
  [userId, items, queryClient],
);
```

Export it from the hook's return value.

- [ ] **Step 3: Add `handleCarouselMarkWatched` to `useWatchlistData.ts`**

A simpler mark handler for the carousel that marks a single episode without the card optimistic UI (the carousel handles its own optimistic state):

```tsx
const handleCarouselMarkWatched = useCallback(
  async (tmdbId: number, season: number, episode: number) => {
    if (!userId) return;
    const item = items.find((i) => i.tmdbId === tmdbId);
    if (!item) return;
    const catalog = item.catalogShow;
    const catalogSeason = catalog?.seasons?.find((s) => s.seasonNumber === season);
    const catalogEp = catalogSeason?.episodes?.find((e) => e.episodeNumber === episode);
    const currentNext = item.nextEpisode ?? { season: 1, episode: 1 };

    // Only advance pointer if this is the current next episode
    const isCurrentNext = currentNext.season === season && currentNext.episode === episode;
    const skipTracking = !isCurrentNext;

    const nextInCatalog = isCurrentNext && catalog
      ? findNextEpisodeInCatalog(catalog, season, episode) : null;

    await markEpisodeWatched(
      userId, tmdbId, season, episode,
      catalogEp?.title || "", catalogEp?.runtime || 0,
      isCurrentNext ? (nextInCatalog ? { season: nextInCatalog.season, episode: nextInCatalog.episode } : null) : currentNext,
      isCurrentNext && !nextInCatalog,
      skipTracking,
      nextInCatalog?.title ?? null,
      nextInCatalog?.airDate ?? null,
    );

    const now = Timestamp.now();
    insertWatchedEpisodeCache(queryClient, userId, {
      id: `${tmdbId}_S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`,
      tmdbShowId: tmdbId,
      season, episode,
      episodeTitle: catalogEp?.title || "",
      runtime: catalogEp?.runtime || 0,
      lastWatchedAt: now, watchedAt: now, watchCount: 1,
    });
    incrementDailyWatch("episode");
  },
  [userId, items, queryClient],
);
```

Export it from the hook's return value.

- [ ] **Step 4: Update `handleCardPress` in WatchlistTab `index.tsx`**

Replace the current single-episode modal setup with carousel data:

```tsx
const handleCardPress = useCallback(
  async (tmdbId: number, _mediaType: MediaType) => {
    const listItem = listData.find((li) => li.type === "show" && li.item.tmdbId === tmdbId);
    if (!listItem || listItem.type !== "show") return;
    const item = listItem.item;
    const ep = item.nextEpisode;
    if (!ep) return;

    const catalog = item.catalogShow;
    const today = new Date().toISOString().split("T")[0];

    // Build flat episode list from catalog — all released episodes
    const allEps: CarouselEpisode[] = [];
    if (catalog?.seasons) {
      for (const s of catalog.seasons) {
        if (s.seasonNumber === 0) continue;
        for (const e of s.episodes) {
          if (!e.airDate || e.airDate <= today) {
            allEps.push({
              season: s.seasonNumber,
              episode: e.episodeNumber,
              title: e.title || null,
              airDate: e.airDate || null,
              runtime: e.runtime || null,
              stillPath: e.stillPath || null,
              overview: e.overview || null,
            });
          }
        }
      }
    }

    if (allEps.length === 0) return;

    // Find initial index
    const initialIdx = allEps.findIndex(
      (e) => e.season === ep.season && e.episode === ep.episode,
    );

    // Build watched keys from watchedEps
    const wKeys = new Set<string>();
    // watchedEps from useWatchedEpisodes is available via the hook
    // We need to get it — add to useWatchlistData return or use directly
    // For now, use the watched episodes query cache
    const cachedWatched = queryClient.getQueryData<any>([QueryKey.WATCHED_EPISODES, user?.uid, undefined]);
    if (cachedWatched?.pages) {
      for (const page of cachedWatched.pages) {
        for (const we of page.episodes ?? []) {
          if (we.tmdbShowId === tmdbId) {
            wKeys.add(`S${String(we.season).padStart(2, "0")}E${String(we.episode).padStart(2, "0")}`);
          }
        }
      }
    }

    setEpModalData({
      tmdbId,
      showTitle: item.title,
      showPosterPath: item.posterPath ?? null,
      showBackdropPath: catalog?.backdropPath ?? null,
      episodes: allEps,
      initialIndex: Math.max(0, initialIdx),
      watchedKeys: wKeys,
      currentNextEpisode: ep,
    });
    setEpModalVisible(true);
  },
  [listData, user?.uid, queryClient],
);
```

- [ ] **Step 5: Add `onLoadEpisodeDetails` callback**

```tsx
const handleLoadEpisodeDetails = useCallback(async (season: number): Promise<CarouselEpisode[] | null> => {
  const apiKey = useAuthStore.getState().appTmdbApiKey;
  if (!apiKey || !epModalData) return null;
  try {
    const seasonData = await getSeasonDetails(apiKey, epModalData.tmdbId, season);
    return seasonData.episodes.map((e) => ({
      season: e.season_number ?? season,
      episode: e.episode_number,
      title: e.name || null,
      airDate: e.air_date || null,
      runtime: e.runtime || null,
      stillPath: e.still_path || null,
      overview: e.overview || null,
    }));
  } catch {
    // Firestore fallback
    const catalog = await getCatalogShow(epModalData.tmdbId, MediaType.TV);
    const catSeason = catalog?.seasons?.find((s) => s.seasonNumber === season);
    if (catSeason) {
      return catSeason.episodes.map((e) => ({
        season: catSeason.seasonNumber,
        episode: e.episodeNumber,
        title: e.title || null,
        airDate: e.airDate || null,
        runtime: e.runtime || null,
        stillPath: e.stillPath || null,
        overview: e.overview || null,
      }));
    }
    return null;
  }
}, [epModalData]);
```

- [ ] **Step 6: Update JSX to use new EpisodeDetailModal props**

Replace the existing `<EpisodeDetailModal>` JSX in the return with:

```tsx
{epModalData && (
  <EpisodeDetailModal
    visible={epModalVisible}
    tmdbId={epModalData.tmdbId}
    showTitle={epModalData.showTitle}
    showPosterPath={epModalData.showPosterPath}
    showBackdropPath={epModalData.showBackdropPath}
    episodes={epModalData.episodes}
    initialIndex={epModalData.initialIndex}
    watchedKeys={epModalData.watchedKeys}
    currentNextEpisode={epModalData.currentNextEpisode}
    onMarkWatched={handleCarouselMarkWatched}
    onMarkWatchedThrough={handleMarkWatchedThrough}
    onUnmarkWatched={handleUnmarkEpisode}
    onShowPress={handleEpModalShowPress}
    onClose={() => { setEpModalVisible(false); setEpModalData(null); }}
    onLoadEpisodeDetails={handleLoadEpisodeDetails}
  />
)}
```

Update `epModalData` state type to match the new shape.

- [ ] **Step 7: Typecheck and commit**

```bash
cd app && npx tsc --noEmit
git add src/screens/HomeScreen/WatchlistTab/
git commit -m "feat(watchlist): wire carousel modal with batch mark and unmark"
```

---

### Task 3: Update SeasonDropdown Caller

**Files:**
- Modify: `app/src/components/SeasonDropdown.tsx`

**Interfaces:**
- Consumes: `EpisodeDetailModal` new props from Task 1
- Produces: Working carousel from season dropdown episode press

- [ ] **Step 1: Update `handleEpisodePress` to build carousel data**

Replace the current single-episode `setEpInfoData` call with carousel-compatible data. The `SeasonDropdown` already has `episodes` (the season's episodes), `watchedMap`, and mark handlers. Build the carousel list from the current season's episodes only (released ones), compute `initialIndex`, build `watchedKeys` from `watchedMap`:

```tsx
const handleEpisodePress = useCallback(
  (ep: TMDBEpisode) => {
    const today = new Date().toISOString().split("T")[0];
    const carouselEps: CarouselEpisode[] = episodes
      .filter((e: TMDBEpisode) => !e.air_date || e.air_date <= today)
      .map((e: TMDBEpisode) => ({
        season: season.season_number,
        episode: e.episode_number,
        title: e.name || null,
        airDate: e.air_date || null,
        runtime: e.runtime || null,
        stillPath: e.still_path || null,
        overview: e.overview || null,
      }));

    const idx = carouselEps.findIndex((e) => e.episode === ep.episode_number);
    const wKeys = new Set<string>();
    for (const [epNum] of watchedMap) {
      wKeys.add(`S${String(season.season_number).padStart(2, "0")}E${String(epNum).padStart(2, "0")}`);
    }

    setEpInfoData({
      tmdbId,
      showTitle,
      showPosterPath,
      showBackdropPath: showBackdropPath ?? null,
      episodes: carouselEps,
      initialIndex: Math.max(0, idx),
      watchedKeys: wKeys,
      currentNextEpisode: null, // SeasonDropdown doesn't track next pointer
    });
    setEpInfoVisible(true);
  },
  [showTitle, season.season_number, episodes, watchedMap, tmdbId, showPosterPath, showBackdropPath],
);
```

- [ ] **Step 2: Add mark/unmark handlers for carousel**

```tsx
const handleCarouselMark = useCallback(async (_tmdbId: number, _season: number, episode: number) => {
  const ep = episodes.find((e: TMDBEpisode) => e.episode_number === episode);
  if (ep) await doMarkEpisodeWatched(ep);
}, [episodes, doMarkEpisodeWatched]);

const handleCarouselMarkThrough = useCallback(async (_tmdbId: number, _season: number, episode: number) => {
  // Find first unwatched and mark range
  const firstUnwatched = episodes.find((e: TMDBEpisode) => !watchedMap.has(e.episode_number));
  if (firstUnwatched) {
    await doMarkEpisodeRange(firstUnwatched.episode_number, episode);
  }
}, [episodes, watchedMap, doMarkEpisodeRange]);

const handleCarouselUnmark = useCallback(async (_tmdbId: number, _season: number, episode: number) => {
  if (!user?.uid) return;
  const watched = watchedMap.get(episode);
  const ep = episodes.find((e: TMDBEpisode) => e.episode_number === episode);
  await unmarkEpisodeWatched(
    user.uid, tmdbId, season.season_number, episode,
    watched?.runtime || ep?.runtime || 0, ep?.name || null,
  );
  removeWatchedEpisodeCache(queryClient, user.uid, tmdbId, season.season_number, episode);
  decrementDailyWatch("episode");
}, [user?.uid, tmdbId, season.season_number, watchedMap, episodes, queryClient]);
```

- [ ] **Step 3: Update EpisodeDetailModal JSX**

Replace existing `<EpisodeDetailModal>` usage with new props:

```tsx
{epInfoData && (
  <EpisodeDetailModal
    visible={epInfoVisible}
    tmdbId={epInfoData.tmdbId}
    showTitle={epInfoData.showTitle}
    showPosterPath={epInfoData.showPosterPath}
    showBackdropPath={epInfoData.showBackdropPath}
    episodes={epInfoData.episodes}
    initialIndex={epInfoData.initialIndex}
    watchedKeys={epInfoData.watchedKeys}
    currentNextEpisode={epInfoData.currentNextEpisode}
    onMarkWatched={handleCarouselMark}
    onMarkWatchedThrough={handleCarouselMarkThrough}
    onUnmarkWatched={handleCarouselUnmark}
    onClose={() => { setEpInfoVisible(false); setEpInfoData(null); }}
  />
)}
```

Update `epInfoData` state type to match new shape.

- [ ] **Step 4: Typecheck and commit**

```bash
cd app && npx tsc --noEmit
git add src/components/SeasonDropdown.tsx
git commit -m "feat(season): wire SeasonDropdown to carousel modal"
```

---

### Task 4: Update UpcomingTab Caller

**Files:**
- Modify: `app/src/screens/HomeScreen/UpcomingTab/index.tsx`

**Interfaces:**
- Consumes: `EpisodeDetailModal` new props from Task 1
- Produces: Working carousel from upcoming episode press (read-only — no mark-watched since upcoming eps haven't aired)

- [ ] **Step 1: Update `handleEpisodePress` for carousel props**

The UpcomingTab shows future episodes that haven't aired yet. The carousel shows a single-episode view (no mark-watched). Build a single-item carousel:

```tsx
const handleEpisodePress = useCallback(async (ep: UpcomingEpisode) => {
  const catalog = getCachedCatalogShow(
    ep.tmdbShowId,
    ep.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV,
  );

  const carouselEp: CarouselEpisode = {
    season: ep.season,
    episode: ep.episode,
    title: ep.episodeTitle,
    airDate: ep.airDate,
    runtime: ep.runtime,
    stillPath: null,
    overview: null,
  };

  setEpModalData({
    tmdbId: ep.tmdbShowId,
    showTitle: ep.showTitle,
    showPosterPath: ep.posterPath ?? null,
    showBackdropPath: catalog?.backdropPath ?? null,
    episodes: [carouselEp],
    initialIndex: 0,
    watchedKeys: new Set(),
    currentNextEpisode: null,
  });
  setEpModalLoading(true);
  setEpModalVisible(true);

  // Fetch details
  const apiKey = useAuthStore.getState().appTmdbApiKey;
  if (apiKey) {
    try {
      const seasonData = await getSeasonDetails(apiKey, ep.tmdbShowId, ep.season);
      const tmdbEp = seasonData.episodes?.find((e) => e.episode_number === ep.episode);
      if (tmdbEp) {
        setEpModalData((prev) => prev ? {
          ...prev,
          episodes: [{
            ...prev.episodes[0],
            overview: tmdbEp.overview || null,
            stillPath: tmdbEp.still_path || null,
            title: tmdbEp.name || prev.episodes[0].title,
          }],
        } : null);
      }
    } catch {}
  }
  setEpModalLoading(false);
}, []);
```

- [ ] **Step 2: Update JSX — no-op handlers for mark/unmark**

```tsx
const noopMark = useCallback(async () => {}, []);

// In JSX:
{epModalData && (
  <EpisodeDetailModal
    visible={epModalVisible}
    tmdbId={epModalData.tmdbId}
    showTitle={epModalData.showTitle}
    showPosterPath={epModalData.showPosterPath}
    showBackdropPath={epModalData.showBackdropPath}
    episodes={epModalData.episodes}
    initialIndex={epModalData.initialIndex}
    watchedKeys={epModalData.watchedKeys}
    currentNextEpisode={epModalData.currentNextEpisode}
    onMarkWatched={noopMark}
    onMarkWatchedThrough={noopMark}
    onUnmarkWatched={noopMark}
    onShowPress={handleEpModalShowPress}
    onClose={() => { setEpModalVisible(false); setEpModalData(null); }}
  />
)}
```

Update `epModalData` state type to match new shape.

- [ ] **Step 3: Typecheck and commit**

```bash
cd app && npx tsc --noEmit
git add src/screens/HomeScreen/UpcomingTab/
git commit -m "feat(upcoming): wire UpcomingTab to carousel modal"
```

---

### Task 5: Final Integration Test & Cleanup

**Files:**
- Verify: all modified files typecheck
- Modify: `app/src/components/modals/index.ts` and `app/src/components/index.ts` — export `CarouselEpisode` type

- [ ] **Step 1: Export CarouselEpisode type**

In `app/src/components/modals/index.ts`, add:
```tsx
export type { CarouselEpisode } from "./EpisodeDetailModal";
```

In `app/src/components/index.ts`, add:
```tsx
export type { CarouselEpisode } from "./modals";
```

- [ ] **Step 2: Full typecheck**

```bash
cd app && npx tsc --noEmit
```

Fix any remaining type errors.

- [ ] **Step 3: Remove unused imports**

Check all modified files for unused imports (`epModalLoading`, old `epModalData` shape fields, etc.) and remove them.

- [ ] **Step 4: Final commit**

```bash
cd app && npx tsc --noEmit
git add -A
git commit -m "feat(carousel): episode detail carousel with lazy loading and batch mark"
```
