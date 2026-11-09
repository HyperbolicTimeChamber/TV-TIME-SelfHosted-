import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryPill, HistoryProgress, ListTagKind } from "../src/enums";
import type { HistoryCard } from "../src/utils/historyCard";

const card = (over: Partial<HistoryCard>): HistoryCard =>
	({
		pill: null,
		pillLabel: null,
		pillCount: null,
		watchCount: null,
		progress: null,
		...over,
	}) as HistoryCard;

test("deriveListTags: not on the watchlist → no tags", async () => {
	const { deriveListTags } = await import("../src/utils/listCardTags");
	assert.deepEqual(deriveListTags(null), []);
});

test("deriveListTags: Rewatching shows with its run number", async () => {
	const { deriveListTags } = await import("../src/utils/listCardTags");
	const tags = deriveListTags(
		card({
			pill: HistoryPill.REWATCHING,
			pillLabel: HistoryPill.REWATCHING,
			pillCount: 2,
			watchCount: 2,
			progress: { kind: HistoryProgress.PERCENT, percent: 40 },
		}),
	);
	assert.deepEqual(tags, [
		{
			kind: ListTagKind.STATUS,
			label: HistoryPill.REWATCHING,
			pill: HistoryPill.REWATCHING,
			count: 2,
		},
	]);
});

test("deriveListTags: Paused, Currently Watching and the watch count", async () => {
	const { deriveListTags } = await import("../src/utils/listCardTags");
	assert.deepEqual(
		deriveListTags(card({ progress: { kind: HistoryProgress.PAUSED } })).map((t) => t.kind),
		[ListTagKind.PAUSED],
	);
	assert.deepEqual(
		deriveListTags(
			card({
				pill: HistoryPill.WATCHING,
				pillLabel: HistoryPill.WATCHING,
				lastWatched: "S01 | E02",
				progress: { kind: HistoryProgress.PERCENT, percent: 10 },
			}),
		).map((t) => t.kind),
		[ListTagKind.STATUS],
	);
	assert.deepEqual(
		deriveListTags(
			card({ pill: HistoryPill.COMPLETED, pillLabel: HistoryPill.COMPLETED, watchCount: 3 }),
		),
		[{ kind: ListTagKind.WATCH_COUNT, label: "Watch Count", count: 3 }],
	);
});

test("deriveListTags: tracked show with nothing watched → Not Started only", async () => {
	const { deriveListTags } = await import("../src/utils/listCardTags");
	assert.deepEqual(
		deriveListTags(
			card({
				pill: HistoryPill.WATCHING,
				pillLabel: HistoryPill.WATCHING,
				lastWatched: null,
				progress: { kind: HistoryProgress.PERCENT, percent: 0 },
			}),
		),
		[{ kind: ListTagKind.NOT_STARTED, label: "Not Started" }],
	);
});
