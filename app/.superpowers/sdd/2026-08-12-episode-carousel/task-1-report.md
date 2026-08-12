# Task 1 Report: Refactor EpisodeDetailModal into Carousel

**Status:** DONE_WITH_CONCERNS

**Commit:** ba39a44

**Test summary:** `npx tsc --noEmit` from `app/` passes for `EpisodeDetailModal.tsx` — zero errors in the rewritten file.

**Concerns:**

1. **Caller errors are expected, not regressions.** Three files still fail typecheck because they pass the old single-episode props (`season`, `episode`, `episodeTitle`, etc.) to the new carousel `Props` interface. These are the exact files Tasks 2-4 will update. They do not block this task.

2. **`getItemLayout` parameter type.** The brief showed the parameter typed as `any`. The actual `FlatList` generic constraint requires `ArrayLike<CarouselEpisode> | null | undefined`, not `CarouselEpisode[]`. Used the correct type to satisfy the compiler.

3. **`confirmLoading` state added.** The brief's `ConfirmModal` usage didn't include a `loading` prop, but `ConfirmModal` accepts one and the `handleConfirmBackfill` is async. Added `confirmLoading` state so the confirm button shows a spinner and is disabled while the backfill runs.

4. **`onViewableItemsChanged` callback type.** The brief typed the argument as `any`. Used the explicit RN type `{ viewableItems: Array<{ index: number | null }> }` to avoid the implicit-any lint error, keeping strict typing intact.
