import { describe, expect, it } from "vitest";
import { adjacentPointer, type EpisodeRef } from "@app/utils/trackingAdvance";

const order: EpisodeRef[] = [1, 2, 3, 4].map((episode) => ({ season: 3, episode }));
const ep = (episode: number) => ({ season: 3, episode });

describe("adjacentPointer (watchlist: pointer known, episode counts not)", () => {
	it("− un-finishing the episode right before the pointer moves it back (rewatch 1, run 2)", () => {
		expect(adjacentPointer(order, ep(4), ep(3), 2, 1, 2)).toEqual(ep(3));
	});

	it("− when the pointer isn't the next episode leaves it", () => {
		expect(adjacentPointer(order, ep(4), ep(2), 2, 1, 2)).toBeNull();
	});

	it("− of an extra watch (still at the run) leaves it", () => {
		expect(adjacentPointer(order, ep(4), ep(3), 3, 2, 2)).toBeNull();
	});

	it("+ finishing the pointer episode moves it to the next", () => {
		expect(adjacentPointer(order, ep(3), ep(3), 1, 2, 2)).toEqual(ep(4));
	});

	it("+ on an episode that isn't the pointer leaves it", () => {
		expect(adjacentPointer(order, ep(4), ep(3), 1, 2, 2)).toBeNull();
	});

	it("first watch: unwatching the episode before the pointer moves it back", () => {
		expect(adjacentPointer(order, ep(4), ep(3), 1, 0, 1)).toEqual(ep(3));
	});

	it("last episode has no next → no move", () => {
		expect(adjacentPointer(order, ep(4), ep(4), 1, 2, 2)).toBeNull();
	});
});
