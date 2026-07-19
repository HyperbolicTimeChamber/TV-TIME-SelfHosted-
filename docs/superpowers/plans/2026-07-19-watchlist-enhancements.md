# Watchlist Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix watchlist priority sorting, add movie visibility parity, unreleased movie flow, and freshness tags.

**Architecture:** Client-side sort uses `max(priorityDate, airDate/releaseDate)` as effective sort key. Write-side sets `priorityDate` to future airDate when next episode hasn't aired. Movies follow same visibility rules as TV shows using `releaseDate`. Yellow inline tags indicate fresh content.

**Tech Stack:** React Native, Expo, Firebase/Firestore, React Query, AsyncStorage

## Global Constraints

- Expo 57 / RNFirebase v25 modular API
- `warningAmber: "#F59E0B"` from theme for yellow tags
- `CatalogShow.releaseDate` is `string | null` (ISO date "YYYY-MM-DD")
- `CatalogEpisode.airDate` is `string | null` (ISO date "YYYY-MM-DD")
- Today comparison: `new Date().toISOString().split("T")[0]`

---

### Task 1: Rename "Watch Next" → "What's Up Next"

**Files:**
- Modify: `app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts:162`

- [ ] **Step 1: Change section header string**

In `app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts` line 162, change:
```typescript
result.push({ type: "sectionHeader", title: "Watch Next" });
```
to:
```typescript
result.push({ type: "sectionHeader", title: "What's Up Next" });
```

- [ ] **Step 2: Commit**

```bash
git add app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts
git commit -m "feat(ui): rename Watch Next section to What's Up Next"
```

---

### Task 2: Fix Priority Sort — airDate/releaseDate as Effective Sort Key

**Files:**
- Modify: `app/src/hooks/useVisibleTracking.ts`
- Modify: `app/src/hooks/useWatchlist.ts` (EnrichedTrackingItem already has `catalogShow`)

**Interfaces:**
- Consumes: `EnrichedTrackingItem.catalogShow.seasons[].episodes[].airDate`, `EnrichedTrackingItem.catalogShow.releaseDate`, `EnrichedTrackingItem.nextEpisode`, `EnrichedTrackingItem.priorityDate`
- Produces: Updated `sortByPriority(items: EnrichedTrackingItem[]): EnrichedTrackingItem[]`

- [ ] **Step 1: Add helper to get next episode air date from catalog**

In `app/src/hooks/useVisibleTracking.ts`, add after the imports:

```typescript
/**
 * Get the air date of the next episode from the catalog data.
 * Returns ISO date string or null.
 */
function getNextEpisodeAirDate(item: EnrichedTrackingItem): string | null {
  if (!item.nextEpisode || !item.catalogShow) return null;
  const season = item.catalogShow.seasons?.find(
    (s) => s.seasonNumber === item.nextEpisode!.season,
  );
  if (!season) return null;
  const episode = season.episodes?.find(
    (e) => e.episodeNumber === item.nextEpisode!.episode,
  );
  return episode?.airDate ?? null;
}

/**
 * Get the effective sort timestamp for an item.
 * Uses max(priorityDate, nextEpisodeAirDate or releaseDate).
 */
function getEffectivePriority(item: EnrichedTrackingItem): number {
  const priorityMs = item.priorityDate?.toMillis?.() ?? 0;

  let contentDateMs = 0;
  if (item.catalogShow?.mediaType === MediaType.MOVIE) {
    const rd = item.catalogShow.releaseDate;
    if (rd) contentDateMs = new Date(rd).getTime();
  } else {
    const airDate = getNextEpisodeAirDate(item);
    if (airDate) contentDateMs = new Date(airDate).getTime();
  }

  return Math.max(priorityMs, contentDateMs);
}
```

- [ ] **Step 2: Update sortByPriority to use effective priority**

Replace the existing `sortByPriority` function:

```typescript
/**
 * Sort by effective priority descending.
 * Effective priority = max(priorityDate, nextEpisode.airDate or releaseDate)
 */
export function sortByPriority(
  items: EnrichedTrackingItem[],
): EnrichedTrackingItem[] {
  return [...items].sort((a, b) => {
    return getEffectivePriority(b) - getEffectivePriority(a);
  });
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add app/src/hooks/useVisibleTracking.ts
git commit -m "feat(sort): use max(priorityDate, airDate) as effective sort key"
```

---

### Task 3: Update priorityDate Write-Side in markEpisodeWatched

**Files:**
- Modify: `app/src/services/firestore.ts:181-186`
- Modify: `app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts` (pass airDate info)

**Interfaces:**
- Consumes: `markEpisodeWatched` existing params + new optional `nextEpisodeAirDate: string | null`
- Produces: Updated `markEpisodeWatched` that sets `priorityDate` to future airDate when applicable

- [ ] **Step 1: Add nextEpisodeAirDate parameter to markEpisodeWatched**

In `app/src/services/firestore.ts`, update the function signature (line 134):

```typescript
export async function markEpisodeWatched(
  userId: string,
  tmdbShowId: number,
  season: number,
  episode: number,
  episodeTitle: string,
  runtime: number,
  nextEpisode: { season: number; episode: number } | null,
  isShowComplete: boolean,
  skipTrackingUpdate: boolean = false,
  nextEpisodeName: string | null = null,
  nextEpisodeAirDate: string | null = null,
) {
```

- [ ] **Step 2: Update priorityDate logic in tracking update block**

Replace lines 181-186 in `firestore.ts`:

```typescript
  if (!skipTrackingUpdate) {
    const now = Timestamp.now();
    // If next episode hasn't aired yet, use its airDate as priorityDate
    // so it sorts to top when it becomes visible
    let effectivePriority: typeof now = now;
    if (nextEpisode && nextEpisodeAirDate) {
      const airDateMs = new Date(nextEpisodeAirDate).getTime();
      if (airDateMs > now.toMillis()) {
        effectivePriority = Timestamp.fromMillis(airDateMs);
      }
    }
    const trackingUpdate: Record<string, unknown> = {
      lastWatchedAt: now,
      priorityDate: effectivePriority,
      nextEpisode,
      nextEpisodeName,
    };
    if (isShowComplete) {
      trackingUpdate.status = WatchStatus.COMPLETED;
    }
    batch.update(doc(trackingRef(userId), String(tmdbShowId)), trackingUpdate);
  }
```

- [ ] **Step 3: Pass nextEpisodeAirDate from useWatchlistData.handleMarkWatched**

In `app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts`, in `handleMarkWatched` (around line 227), find where `markEpisodeWatched` is called and update:

After computing `nextEpisode` (around line 205-225), add airDate lookup:

```typescript
      // Get air date of next episode for priority scheduling
      let nextEpisodeAirDate: string | null = null;
      if (nextEpisode) {
        const nextSeason = catalog?.seasons?.find(
          (s) => s.seasonNumber === nextEpisode.season,
        );
        const nextEp = nextSeason?.episodes?.find(
          (e) => e.episodeNumber === nextEpisode.episode,
        );
        nextEpisodeAirDate = nextEp?.airDate ?? null;
      }
```

Then update the `markEpisodeWatched` call to pass it as the last argument:

```typescript
      await markEpisodeWatched(
        userId,
        item.tmdbId,
        currentEp.season,
        currentEp.episode,
        catalogEp?.title || "",
        catalogEp?.runtime || 0,
        nextEpisode,
        isComplete,
        false,
        nextEpisodeName,
        nextEpisodeAirDate,
      );
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add app/src/services/firestore.ts app/src/screens/HomeScreen/WatchlistTab/useWatchlistData.ts
git commit -m "feat(firestore): set priorityDate to future airDate when next ep unaired"
```

---

### Task 4: Movie Visibility — Same Rules as TV Shows

**Files:**
- Modify: `app/src/hooks/useVisibleTracking.ts:30-33`

**Interfaces:**
- Consumes: `EnrichedTrackingItem.catalogShow.releaseDate`
- Produces: Updated `isShowVisible()` that hides unreleased and watched movies

- [ ] **Step 1: Update movie visibility logic**

In `app/src/hooks/useVisibleTracking.ts`, replace lines 30-33 (the movie section):

```typescript
  const catalog = item.catalogShow;

  // Movies — visible only if released and not completed
  if (!catalog || catalog.mediaType === MediaType.MOVIE) {
    if (!catalog) return true; // No catalog data — show it
    const today = new Date().toISOString().split("T")[0];
    const releaseDate = catalog.releaseDate;
    // Hide if not yet released
    if (releaseDate && releaseDate > today) return false;
    // Visible if released (status already filtered to active above)
    return true;
  }
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useVisibleTracking.ts
git commit -m "feat(visibility): hide unreleased movies from watchlist"
```

---

### Task 5: Update addToTracking for Unreleased Movies (priorityDate = releaseDate)

**Files:**
- Modify: `app/src/services/firestore.ts:69-106`

**Interfaces:**
- Consumes: New optional param `releaseDate: string | null`
- Produces: Updated `addToTracking(userId, tmdbId, mediaType, releaseDate?)`

- [ ] **Step 1: Add releaseDate parameter to addToTracking**

Update signature and body in `app/src/services/firestore.ts`:

```typescript
export async function addToTracking(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  releaseDate?: string | null,
): Promise<void> {
  const functions = getFunctions();

  // Call addShow CF (handles catalog population)
  try {
    await httpsCallable(functions, "addShow")({ tmdbId, mediaType });
  } catch (err: any) {
    throw new Error(getCallableErrorMessage(err));
  }

  // Determine priorityDate: use releaseDate if movie is unreleased
  let priorityDate: any = serverTimestamp();
  if (mediaType === MediaType.MOVIE && releaseDate) {
    const releaseDateMs = new Date(releaseDate).getTime();
    if (releaseDateMs > Date.now()) {
      priorityDate = Timestamp.fromMillis(releaseDateMs);
    }
  }

  // Create local tracking doc
  const tRef = doc(trackingRef(userId), String(tmdbId));
  await setDoc(tRef, {
    tmdbId,
    mediaType,
    status: WatchStatus.WATCHING,
    nextEpisode: mediaType === MediaType.TV ? { season: 1, episode: 1 } : null,
    nextEpisodeName: null,
    rewatchCount: 0,
    addedAt: serverTimestamp(),
    lastWatchedAt: serverTimestamp(),
    priorityDate,
  });

  // Update user stats
  await setDoc(
    userRef(userId),
    {
      stats: { showsTracking: increment(1) },
    },
    { merge: true },
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add app/src/services/firestore.ts
git commit -m "feat(firestore): set priorityDate to releaseDate for unreleased movies"
```

---

### Task 6: Unreleased Movie Direct-Add Flow + Info Modal

**Files:**
- Create: `app/src/components/UnreleasedMovieModal.tsx`
- Modify: `app/src/screens/SearchScreen.tsx` (movie add flow)
- Modify: `app/src/screens/ShowDetailScreen.tsx` (movie add flow)

**Interfaces:**
- Consumes: `addToTracking(userId, tmdbId, MOVIE, releaseDate)`
- Produces: `UnreleasedMovieModal` component with props: `{ visible: boolean; onClose: () => void; movieTitle: string }`

- [ ] **Step 1: Create UnreleasedMovieModal component**

Create `app/src/components/UnreleasedMovieModal.tsx`:

```typescript
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getFirestore,
  doc,
  updateDoc,
  getDoc,
} from "@react-native-firebase/firestore";
import { AnimatedModal } from "./AnimatedModal";
import { colors, spacing, typography } from "../theme";
import { useAuthStore } from "../stores";

const STORAGE_KEY = "hideUnreleasedMovieModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  movieTitle: string;
}

export function UnreleasedMovieModal({ visible, onClose, movieTitle }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const user = useAuthStore((s) => s.user);

  const handleOk = async () => {
    if (dontShowAgain && user?.uid) {
      await AsyncStorage.setItem(STORAGE_KEY, "true");
      const db = getFirestore();
      updateDoc(doc(db, "users", user.uid), {
        hideUnreleasedMovieModal: true,
      }).catch(() => {});
    }
    onClose();
  };

  return (
    <AnimatedModal visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.title}>Added to Watchlist</Text>
        <Text style={styles.body}>
          {movieTitle} hasn't released yet. It will appear on your watchlist when
          it airs. Check the Upcoming or Calendar tab to confirm.
        </Text>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setDontShowAgain(!dontShowAgain)}
        >
          <View style={[styles.box, dontShowAgain && styles.boxChecked]}>
            {dontShowAgain && <Text style={styles.check}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>Don't show this again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleOk}>
          <Text style={styles.buttonText}>OK</Text>
        </TouchableOpacity>
      </View>
    </AnimatedModal>
  );
}

/**
 * Check if the unreleased movie modal should be shown.
 * Reads from AsyncStorage first (cache), falls back to Firestore.
 */
export async function shouldShowUnreleasedModal(
  userId: string,
): Promise<boolean> {
  // Check cache first
  const cached = await AsyncStorage.getItem(STORAGE_KEY);
  if (cached === "true") return false;

  // Fallback to Firestore
  try {
    const db = getFirestore();
    const userDoc = await getDoc(doc(db, "users", userId));
    const hide = userDoc.data()?.hideUnreleasedMovieModal === true;
    if (hide) {
      await AsyncStorage.setItem(STORAGE_KEY, "true");
      return false;
    }
  } catch {}

  return true;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    alignItems: "center",
  },
  title: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
    alignSelf: "flex-start",
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  boxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  check: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  checkLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: 8,
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
});
```

- [ ] **Step 2: Export from components index**

Find and update `app/src/components/index.ts` to add:
```typescript
export { UnreleasedMovieModal, shouldShowUnreleasedModal } from "./UnreleasedMovieModal";
```

- [ ] **Step 3: Update SearchScreen movie add flow**

In `app/src/screens/SearchScreen.tsx`, add imports:
```typescript
import { UnreleasedMovieModal, shouldShowUnreleasedModal } from "../components";
import { getCatalogShow } from "../services";
```

Add state after existing state declarations (around line 66):
```typescript
const [unreleasedModal, setUnreleasedModal] = useState<{ title: string } | null>(null);
```

Replace `handleAddToWatchlist` (lines 89-106) to handle unreleased movies:

```typescript
  const handleAddToWatchlist = useCallback(
    async (item: TMDBShow) => {
      if (!user?.uid) return;
      const mediaType: MediaType =
        item.media_type || (item.title ? MediaType.MOVIE : MediaType.TV);

      if (mediaType === MediaType.MOVIE) {
        const releaseDate = item.release_date || null;
        const today = new Date().toISOString().split("T")[0];
        const isUnreleased = releaseDate && releaseDate > today;

        if (isUnreleased) {
          // Unreleased movie — add directly, no "add & mark watched" prompt
          await withLoadingId(item.id, async () => {
            await addToTracking(user.uid!, item.id, MediaType.MOVIE, releaseDate);
            addShowToUpcoming(item.id);
          });
          // Show info modal if not suppressed
          const shouldShow = await shouldShowUnreleasedModal(user.uid!);
          if (shouldShow) {
            setUnreleasedModal({ title: item.title || item.name || "" });
          }
          return;
        }

        // Released movie — show add/add+watch modal
        setMovieModal(item);
        return;
      }

      await withLoadingId(item.id, async () => {
        await addToTracking(user.uid!, item.id, mediaType);
        addShowToUpcoming(item.id);
      });
    },
    [user?.uid, withLoadingId, addShowToUpcoming],
  );
```

Add the `UnreleasedMovieModal` JSX after the existing `AnimatedModal` (after line 365):

```typescript
      <UnreleasedMovieModal
        visible={!!unreleasedModal}
        onClose={() => setUnreleasedModal(null)}
        movieTitle={unreleasedModal?.title ?? ""}
      />
```

- [ ] **Step 4: Update ShowDetailScreen movie add flow**

In `app/src/screens/ShowDetailScreen.tsx`, add import:
```typescript
import { UnreleasedMovieModal, shouldShowUnreleasedModal } from "../components";
```

Add state:
```typescript
const [unreleasedModal, setUnreleasedModal] = useState<{ title: string } | null>(null);
```

Update `handleAddToWatchlist` (line 72) to handle unreleased:

```typescript
  const handleAddToWatchlist = useCallback(async () => {
    if (!user?.uid || !show || adding) return;
    setAdding(true);
    try {
      const releaseDate = show.release_date || null;
      const today = new Date().toISOString().split("T")[0];
      const isUnreleased =
        mediaType === MediaType.MOVIE && releaseDate && releaseDate > today;

      await addToTracking(
        user.uid,
        tmdbId,
        mediaType,
        isUnreleased ? releaseDate : null,
      );
      addShowToUpcoming(tmdbId);

      if (isUnreleased) {
        const shouldShow = await shouldShowUnreleasedModal(user.uid);
        if (shouldShow) {
          setUnreleasedModal({ title: show.title || show.name || "" });
        }
      }
    } catch (err: any) {
      console.error("addToTracking failed:", err);
      Alert.alert("Error", err.message || "Failed to add to watchlist.");
    } finally {
      setAdding(false);
    }
  }, [user?.uid, show, tmdbId, mediaType, adding, addShowToUpcoming]);
```

Add modal JSX before the closing fragment/View:
```typescript
      <UnreleasedMovieModal
        visible={!!unreleasedModal}
        onClose={() => setUnreleasedModal(null)}
        movieTitle={unreleasedModal?.title ?? ""}
      />
```

- [ ] **Step 5: Verify no TypeScript errors**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add app/src/components/UnreleasedMovieModal.tsx app/src/components/index.ts app/src/screens/SearchScreen.tsx app/src/screens/ShowDetailScreen.tsx
git commit -m "feat(ui): unreleased movie direct-add with info modal + dont show again"
```

---

### Task 7: Yellow "NEW" and "JUST AIRED" Tags on ShowCard

**Files:**
- Modify: `app/src/components/ShowCard.tsx`
- Modify: `app/src/screens/HomeScreen/WatchlistTab/types.ts` (extend ListItem if needed)

**Interfaces:**
- Consumes: New props on `ShowCardItem`: `nextEpisodeAirDate?: string | null`, `releaseDate?: string | null`
- Produces: Visual yellow pill tags inline with episode/movie label

- [ ] **Step 1: Add airDate/releaseDate to ShowCardItem interface and tag logic**

In `app/src/components/ShowCard.tsx`, update the `ShowCardItem` interface (add after `totalEpisodes`):

```typescript
interface ShowCardItem {
	tmdbId: number;
	mediaType: MediaType;
	status: string;
	nextEpisode: { season: number; episode: number } | null;
	nextEpisodeName?: string | null;
	rewatchCount: number;
	title: string;
	posterPath: string | null;
	totalEpisodes?: number;
	nextEpisodeAirDate?: string | null;
	releaseDate?: string | null;
}
```

- [ ] **Step 2: Add tag computation and rendering**

After the `remainingLabel` const (around line 63), add:

```typescript
	const today = new Date().toISOString().split("T")[0];

	// "NEW" tag: TV episode aired today
	const isNewEpisode =
		item.mediaType === MediaType.TV &&
		item.nextEpisodeAirDate &&
		item.nextEpisodeAirDate === today;

	// "JUST AIRED" tag: movie released within last 7 days
	const isJustAired = (() => {
		if (item.mediaType !== MediaType.MOVIE || !item.releaseDate) return false;
		const releaseMs = new Date(item.releaseDate).getTime();
		const todayMs = new Date(today).getTime();
		const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
		return releaseMs <= todayMs && todayMs - releaseMs <= sevenDaysMs;
	})();
```

- [ ] **Step 3: Render NEW tag inline after episode label**

In the normal (non-watched, non-updating) card's TV episode section (around line 170-176), update:

```typescript
					{item.mediaType === MediaType.MOVIE ? (
						<View style={styles.movieRow}>
							<View style={styles.movieBadge}>
								<Text style={styles.movieBadgeText}>MOVIE</Text>
							</View>
							{isJustAired && (
								<View style={styles.freshTag}>
									<Text style={styles.freshTagText}>JUST AIRED</Text>
								</View>
							)}
						</View>
					) : (
						<Text style={styles.episode}>
							{episodeLabel}
							{isNewEpisode && (
								<Text style={styles.freshTagInline}> NEW</Text>
							)}
							{remainingLabel ? (
								<Text style={styles.remaining}> {remainingLabel}</Text>
							) : null}
						</Text>
					)}
```

- [ ] **Step 4: Add styles for the tags**

Add to the `StyleSheet.create` block:

```typescript
	movieRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: 2,
	},
	freshTag: {
		backgroundColor: colors.warningAmber,
		paddingHorizontal: spacing.sm,
		paddingVertical: 1,
		borderRadius: 4,
	},
	freshTagText: {
		fontSize: 9,
		fontWeight: "700",
		color: "#1A1A1A",
		letterSpacing: 0.5,
	},
	freshTagInline: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.warningAmber,
	},
```

- [ ] **Step 5: Pass airDate/releaseDate data from WatchlistTab**

In `app/src/screens/HomeScreen/WatchlistTab/index.tsx`, find where `ShowCard` is rendered and ensure the item passed includes `nextEpisodeAirDate` and `releaseDate`. These come from `EnrichedTrackingItem.catalogShow`.

The `ShowCard` item should be constructed to include:
```typescript
nextEpisodeAirDate: (() => {
  const cat = item.catalogShow;
  if (!cat || !item.nextEpisode) return null;
  const s = cat.seasons?.find(s => s.seasonNumber === item.nextEpisode!.season);
  const ep = s?.episodes?.find(e => e.episodeNumber === item.nextEpisode!.episode);
  return ep?.airDate ?? null;
})(),
releaseDate: item.catalogShow?.releaseDate ?? null,
```

Look at how `ShowCard` is called in the WatchlistTab index and add these fields to the item prop mapping.

- [ ] **Step 6: Verify no TypeScript errors**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 7: Commit**

```bash
git add app/src/components/ShowCard.tsx app/src/screens/HomeScreen/WatchlistTab/index.tsx
git commit -m "feat(ui): add yellow NEW and JUST AIRED tags to ShowCard"
```

---
