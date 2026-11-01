import { test } from "node:test";
import assert from "node:assert/strict";
import { promoteShows } from "../src/utils/watchlistOrder";

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
