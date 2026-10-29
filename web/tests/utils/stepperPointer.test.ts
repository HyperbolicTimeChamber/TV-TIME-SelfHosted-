import { describe, expect, it } from "vitest";
import { WatchStatus } from "@app/enums";
import {
	epKey,
	firstSkippedBefore,
	stepperPointer,
	type EpisodeRef,
} from "@app/utils/trackingAdvance";

const order: EpisodeRef[] = [1, 2, 3, 4].map((episode) => ({ season: 1, episode }));
const countsOf = (...c: number[]) => new Map(c.map((n, i) => [epKey(1, i + 1), n]));
const ep = (episode: number) => ({ season: 1, episode });

describe("stepperPointer", () => {
	const watching = { status: WatchStatus.WATCHING, nextEpisode: ep(2) };
	// Rewatch 1 (run 2): E1 rewatched (2), pointer on E2 (1)
	const rewatching = { status: WatchStatus.REWATCHING, nextEpisode: ep(2) };

	it("+ that finishes the episode in the first watch moves the pointer to the next", () => {
		expect(stepperPointer(order, countsOf(1, 0, 0, 0), watching, ep(2), 0, 1)).toEqual(ep(3));
	});

	it("+ past the run (extra watch) leaves the pointer", () => {
		expect(stepperPointer(order, countsOf(1, 1, 0, 0), watching, ep(2), 1, 2)).toBeNull();
	});

	it("+ when the next episode is already watched in this run leaves the pointer", () => {
		expect(stepperPointer(order, countsOf(1, 0, 1, 0), watching, ep(2), 0, 1)).toBeNull();
	});

	it("+ in a rewatch: reaching the run level with the next one below it moves on", () => {
		expect(stepperPointer(order, countsOf(2, 1, 1, 1), rewatching, ep(2), 1, 2)).toEqual(ep(3));
	});

	it("− that un-finishes the episode moves the pointer back to it", () => {
		const tracking = { status: WatchStatus.WATCHING, nextEpisode: ep(3) };
		expect(stepperPointer(order, countsOf(1, 1, 0, 0), tracking, ep(2), 1, 0)).toEqual(ep(2));
	});

	it("− when the next episode is already watched in this run leaves the pointer", () => {
		const tracking = { status: WatchStatus.WATCHING, nextEpisode: ep(4) };
		expect(stepperPointer(order, countsOf(1, 1, 1, 0), tracking, ep(2), 1, 0)).toBeNull();
	});

	it("− of an extra watch (still at the run level after) leaves the pointer", () => {
		expect(stepperPointer(order, countsOf(1, 2, 0, 0), watching, ep(2), 2, 1)).toBeNull();
	});

	it("last episode has no next → no move", () => {
		expect(stepperPointer(order, countsOf(1, 1, 1, 0), watching, ep(4), 0, 1)).toBeNull();
	});

	it("completed show → no move", () => {
		const done = { status: WatchStatus.COMPLETED, nextEpisode: null };
		expect(stepperPointer(order, countsOf(1, 1, 1, 1), done, ep(2), 1, 2)).toBeNull();
	});

	it("+ ahead of the pointer moves it, and the speedster check finds the skipped episodes", () => {
		// First watch, E1 watched, pointer on E2; + on E3 (E4 still unwatched)
		const counts = countsOf(1, 0, 0, 0);
		expect(stepperPointer(order, counts, watching, ep(3), 0, 1)).toEqual(ep(4));
		expect(firstSkippedBefore(order, counts, watching, ep(3))).toEqual({
			firstSkipped: 2,
			level: 1,
		});
	});

	it("+ on the pointer episode itself never asks", () => {
		const counts = countsOf(1, 0, 0, 0);
		expect(firstSkippedBefore(order, counts, watching, ep(2))).toBeNull();
	});
});
