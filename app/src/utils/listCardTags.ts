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
 * title (status, progress / up to date / paused, watch count) — and, for a title
 * that isn't tracked, Not Started in place of the status and 0%.
 * `card` null = not on the watchlist.
 */
export function deriveListTags(card: HistoryCard | null): ListTag[] {
	const tags: ListTag[] = [];
	if (!card) {
		tags.push({ kind: ListTagKind.NOT_STARTED, label: "Not Started" });
		return tags;
	}
	if (card.pill && card.pillLabel) {
		tags.push({
			kind: ListTagKind.STATUS,
			label: card.pillLabel,
			pill: card.pill,
			count: card.pillCount ?? undefined,
		});
	}
	if (card.progress?.kind === HistoryProgress.UP_TO_DATE) {
		tags.push({ kind: ListTagKind.UP_TO_DATE, label: "Up To Date" });
	} else if (card.progress?.kind === HistoryProgress.PAUSED) {
		tags.push({ kind: ListTagKind.PAUSED, label: "Paused" });
	} else if (card.progress) {
		const percent = card.progress.percent ?? 0;
		tags.push({ kind: ListTagKind.PERCENT, label: `${percent}%`, percent });
	} else if (card.watchCount != null) {
		tags.push(
			card.watchCount > 0
				? { kind: ListTagKind.WATCH_COUNT, label: "Watch Count", count: card.watchCount }
				: { kind: ListTagKind.NOT_WATCHED, label: "Not Watched" },
		);
	}
	return tags;
}
