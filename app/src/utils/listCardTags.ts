import { HistoryPill, HistoryProgress, ListTagKind } from "../enums";
import type { HistoryCard } from "./historyCard";

export interface ListTag {
	kind: ListTagKind;
	label: string;
	/** STATUS: which pill (picks the colour); PERCENT: 0–100; WATCH_COUNT / STATUS: the count circle */
	pill?: HistoryPill;
	percent?: number;
	count?: number;
}

/**
 * The tags under a list card's meta line, in one row: what the Watch History card shows for the
 * title (Currently Watching / Rewatching, Paused, watch count — not Completed, Up To Date or the
 * percentage), or Not Started for a tracked show with no episode watched. A title that isn't on
 * the watchlist gets no tags. `card` null = not on the watchlist.
 */
export function deriveListTags(card: HistoryCard | null): ListTag[] {
	const tags: ListTag[] = [];
	if (!card) return tags;
	// Tracked, nothing watched yet (no last episode, not a rewatch) → Not Started in place of
	// Currently Watching
	if (card.pill === HistoryPill.WATCHING && !card.lastWatched) {
		tags.push({ kind: ListTagKind.NOT_STARTED, label: "Not Started" });
		return tags;
	}
	// Currently Watching / Rewatching (its run number in the circle) of the status pills: Completed
	// and the percentage are left to the Watch History page
	if (
		(card.pill === HistoryPill.WATCHING || card.pill === HistoryPill.REWATCHING) &&
		card.pillLabel
	) {
		tags.push({
			kind: ListTagKind.STATUS,
			label: card.pillLabel,
			pill: card.pill,
			count: card.pillCount ?? undefined,
		});
	}
	if (card.progress?.kind === HistoryProgress.PAUSED) {
		tags.push({ kind: ListTagKind.PAUSED, label: "Paused" });
	} else if (card.progress) {
		// Up To Date and a percentage aren't shown on a list card — the Watch History page has them
	} else if (card.watchCount != null) {
		tags.push(
			card.watchCount > 0
				? { kind: ListTagKind.WATCH_COUNT, label: "Watch Count", count: card.watchCount }
				: { kind: ListTagKind.NOT_WATCHED, label: "Not Watched" },
		);
	}
	return tags;
}

/**
 * Hall of Shame's grid card: everything its list card shows as pills — the status pill (Completed
 * too) and the progress (percent / Up To Date / Paused) or the watch count. Lists' own grids keep
 * deriveListTags' shorter set.
 */
export function deriveHistoryGridTags(card: HistoryCard | null): ListTag[] {
	const tags: ListTag[] = [];
	if (!card) return tags;
	if (card.pill && card.pillLabel && card.progress?.kind !== HistoryProgress.PAUSED) {
		tags.push({
			kind: ListTagKind.STATUS,
			label: card.pillLabel,
			pill: card.pill,
			count: card.pillCount ?? undefined,
		});
	}
	if (card.progress?.kind === HistoryProgress.PERCENT) {
		tags.push({
			kind: ListTagKind.PERCENT,
			label: `${card.progress.percent ?? 0}%`,
			percent: card.progress.percent,
		});
	} else if (card.progress?.kind === HistoryProgress.UP_TO_DATE) {
		tags.push({ kind: ListTagKind.UP_TO_DATE, label: "Up To Date" });
	} else if (card.progress?.kind === HistoryProgress.PAUSED) {
		tags.push({ kind: ListTagKind.PAUSED, label: "Paused" });
	} else if (card.watchCount != null) {
		tags.push({ kind: ListTagKind.WATCH_COUNT, label: "Watch Count", count: card.watchCount });
	}
	return tags;
}
