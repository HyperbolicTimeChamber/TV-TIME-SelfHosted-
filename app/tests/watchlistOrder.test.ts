import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addAiredCards,
	cardEntryMode,
	cardEntryOrder,
	changedCardCount,
	isBulkCardChange,
	mergeCachedShows,
	promoteShows,
	unseenCardIds,
} from "../src/utils/watchlistOrder";
import { CardEntryMode } from "../src/enums";

test("addAiredCards puts cards that aired at the top of the shows and skips ones already there", () => {
	const header = { type: "sectionHeader" as const, title: "What's Up Next" };
	const card = (tmdbId: number) => ({ type: "show" as const, card: { tmdbId } });
	const list = [{ type: "watchedEpisode" as const }, header, card(1), card(2)];
	const out = addAiredCards<{ type: string; card?: { tmdbId: number } }>(list, [card(9), card(2)], header);
	assert.deepEqual(
		out.map((i) => i.card?.tmdbId ?? i.type),
		["watchedEpisode", "sectionHeader", 9, 1, 2],
	);
});

test("addAiredCards opens the section when the list has no shows", () => {
	const header = { type: "sectionHeader" as const, title: "What's Up Next" };
	const out = addAiredCards<{ type: string; card?: { tmdbId: number } }>(
		[{ type: "watchedEpisode" }],
		[{ type: "show", card: { tmdbId: 9 } }],
		header,
	);
	assert.deepEqual(out.map((i) => i.card?.tmdbId ?? i.type), ["watchedEpisode", "sectionHeader", 9]);
});

test("addAiredCards returns the same list when nothing is new", () => {
	const list: { type: string; card?: { tmdbId: number } }[] = [{ type: "show", card: { tmdbId: 1 } }];
	assert.equal(addAiredCards(list, [], { type: "sectionHeader" }), list);
});

type Item = { type: "sectionHeader"; title: string } | { type: "show"; card: { tmdbId: number } } | { type: "watchedEpisode"; id: string };
const show = (tmdbId: number): Item => ({ type: "show", card: { tmdbId } });
const ids = (list: Item[]) => list.map((i) => (i.type === "show" ? i.card.tmdbId : i.type === "sectionHeader" ? "|" : "w"));

test("promoteShows moves just-marked shows to the top of the active section, newest first", () => {
	const list: Item[] = [
		{ type: "sectionHeader", title: "Previously Watched" },
		{ type: "watchedEpisode", id: "a" },
		{ type: "sectionHeader", title: "What's Up Next" },
		show(1),
		show(2),
		show(3),
		show(4),
	];
	const out = promoteShows(list, new Map([[3, 100], [4, 200]]));
	assert.deepEqual(ids(out), ["|", "w", "|", 4, 3, 1, 2]);
	// Nothing promoted → same list back (no re-render)
	assert.equal(promoteShows(list, new Map()), list);
	// A promoted show not in the list is ignored
	assert.deepEqual(ids(promoteShows(list, new Map([[9, 1]]))), ids(list));
});

test("mergeCachedShows keeps saved cards in their saved spot while live pages load", () => {
	const header: Item = { type: "sectionHeader", title: "What's Up Next" };
	// Saved order: 3 ranks high (new episode aired) but sits on a later Firestore page
	const cached: Item[] = [header, show(1), show(2), show(3), show(4), show(5), show(6)];
	// First live page: 3 and 6 not loaded yet; 7 is new (not in the saved list)
	const live: Item[] = [{ type: "watchedEpisode", id: "a" }, header, show(1), show(2), show(4), show(7), show(5)];
	assert.deepEqual(ids(mergeCachedShows(cached, live)), ["w", "|", 1, 2, 3, 4, 7, 5, 6]);
	// Every saved card live → live list as-is
	const full: Item[] = [header, show(1), show(2), show(3), show(4), show(5), show(6)];
	assert.equal(mergeCachedShows(cached, full), full);
	// No live shows yet → saved cards under a header
	assert.deepEqual(ids(mergeCachedShows(cached, [{ type: "watchedEpisode", id: "a" }])), ["w", "|", 1, 2, 3, 4, 5, 6]);
});

test("mergeCachedShows with no live shows uses the active section's header, not Previously Watched", () => {
	const cached: Item[] = [
		{ type: "sectionHeader", title: "Previously Watched" },
		{ type: "watchedEpisode", id: "a" },
		{ type: "sectionHeader", title: "What's Up Next" },
		show(1),
	];
	const out = mergeCachedShows(cached, [{ type: "watchedEpisode", id: "b" }]);
	assert.deepEqual(out[1], { type: "sectionHeader", title: "What's Up Next" });
});

test("unseenCardIds: live cards the saved list lacked, until let through", () => {
	const live = [
		{ type: "sectionHeader" },
		{ type: "show", card: { tmdbId: 1 } },
		{ type: "show", card: { tmdbId: 2 } },
	];
	assert.deepEqual([...unseenCardIds(new Set([1]), new Set(), live)], [2]);
	assert.deepEqual([...unseenCardIds(new Set([1]), new Set([2]), live)], []);
	assert.deepEqual([...unseenCardIds(null, new Set(), live)], []);
});

test("changedCardCount counts cards that joined and left, not ones that stayed", () => {
	assert.equal(changedCardCount(new Set([1, 2, 3]), new Set([2, 3, 4, 5])), 3);
	assert.equal(changedCardCount(new Set([1, 2]), new Set([1, 2])), 0);
});

test("changedCardCount ignores missing cards while the next list is still loading", () => {
	assert.equal(changedCardCount(new Set([1, 2, 3]), new Set([3, 9]), false), 1);
});

test("isBulkCardChange: a small number of changes animates, many are one swap", () => {
	assert.equal(isBulkCardChange(1), false);
	assert.equal(isBulkCardChange(4), false);
	assert.equal(isBulkCardChange(5), true);
	assert.equal(isBulkCardChange(25), true);
});


test("cardEntryMode: none, one at a time for a few cards, one swap for a catch-up", () => {
	assert.equal(cardEntryMode(0), CardEntryMode.NONE);
	assert.equal(cardEntryMode(1), CardEntryMode.STAGED);
	assert.equal(cardEntryMode(4), CardEntryMode.STAGED);
	assert.equal(cardEntryMode(5), CardEntryMode.SWAP);
	assert.equal(cardEntryMode(30), CardEntryMode.SWAP);
});

test("cardEntryOrder: waiting cards top first, ones the list lost dropped", () => {
	const card = (tmdbId: number) => ({ type: "show" as const, card: { tmdbId } });
	const list = [{ type: "sectionHeader" as const }, card(7), card(3), card(9), card(1)];
	assert.deepEqual(cardEntryOrder(new Set([1, 3, 42]), list), [3, 1]);
	assert.deepEqual(cardEntryOrder(new Set(), list), []);
});
