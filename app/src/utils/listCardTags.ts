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
 * title (Currently Watching, paused, watch count — not the other status pills, Up To Date or
 * the percentage) — and, for a title that isn't tracked, Not Started (a movie: Not Watched).
 * `card` null = not on the watchlist.
 */
export function deriveListTags(card: HistoryCard | null, isMovie = false): ListTag[] {
	const tags: ListTag[] = [];
	if (!card) {
		// A movie is watched or not, tracked or not: never "Started"
		tags.push(
			isMovie
				? { kind: ListTagKind.NOT_WATCHED, label: "Not Watched" }
				: { kind: ListTagKind.NOT_STARTED, label: "Not Started" },
		);
		return tags;
	}
	// Only Currently Watching of the status pills: Completed / Rewatching and the percentage are
	// left to the Watch History page
	if (card.pill === HistoryPill.WATCHING && card.pillLabel) {
		tags.push({
			kind: ListTagKind.STATUS,
			label: card.pillLabel,
			pill: card.pill,
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
