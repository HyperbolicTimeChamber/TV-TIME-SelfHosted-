import { describe, expect, it } from "vitest";
import { WatchStatus } from "@app/enums";
import {
	epKey,
	lowestAiredCount,
	rewatchBlocker,
	rewatchHeal,
	type EpisodeRef,
} from "@app/utils/trackingAdvance";

const TODAY = "2026-10-29";
const order: EpisodeRef[] = [
	{ season: 3, episode: 1, airDate: "2003-10-02" },
	{ season: 3, episode: 2, airDate: "2003-10-09" },
	{ season: 3, episode: 3, airDate: "2003-10-23" },
	{ season: 3, episode: 4, airDate: "2003-10-30" },
	{ season: 3, episode: 5, airDate: "2027-01-01" }, // not aired yet
];
const countsOf = (...c: number[]) => new Map(c.map((n, i) => [epKey(3, i + 1), n]));
const ep = (episode: number) => ({ season: 3, episode });

describe("lowestAiredCount", () => {
	it("ignores unaired episodes and returns the first episode at the lowest count", () => {
		expect(lowestAiredCount(order, countsOf(2, 2, 1, 0, 0), TODAY)).toEqual({
			count: 0,
			first: ep(4),
		});
		expect(lowestAiredCount(order, countsOf(2, 1, 1, 2, 0), TODAY)).toEqual({
			count: 1,
			first: ep(2),
		});
	});
});

describe("rewatchHeal", () => {
	it("rewatch 1 with an aired episode at 0 (a hole, like Scrubs S03E04) → a first watch again, pointer on it", () => {
		const tracking = { status: WatchStatus.REWATCHING, rewatchCount: 1, nextEpisode: ep(2) };
		expect(rewatchHeal(order, countsOf(2, 1, 0, 2, 0), tracking, TODAY)).toEqual({
			rewatchCount: 0,
			status: WatchStatus.WATCHING,
			nextEpisode: ep(3),
		});
	});

	it("paused rewatch dropping to 0 → paused", () => {
		const tracking = { status: WatchStatus.PAUSED_REWATCH, rewatchCount: 1, nextEpisode: ep(3) };
		expect(rewatchHeal(order, countsOf(2, 2, 1, 0, 0), tracking, TODAY)?.status).toBe(
			WatchStatus.PAUSED,
		);
	});

	it("rewatch 2 with the lowest at 1 → rewatch 1, pointer on the first episode at 1", () => {
		const tracking = { status: WatchStatus.REWATCHING, rewatchCount: 2, nextEpisode: ep(4) };
		expect(rewatchHeal(order, countsOf(3, 1, 2, 2, 0), tracking, TODAY)).toEqual({
			rewatchCount: 1,
			status: WatchStatus.REWATCHING,
			nextEpisode: ep(2),
		});
	});

	it("consistent data (every aired episode at or above the rewatch count) → null", () => {
		const tracking = { status: WatchStatus.REWATCHING, rewatchCount: 1, nextEpisode: ep(3) };
		expect(rewatchHeal(order, countsOf(2, 2, 1, 1, 0), tracking, TODAY)).toBeNull();
	});

	it("rewatch under way: new episodes after the last watched one don't pull it down", () => {
		const tracking = { status: WatchStatus.REWATCHING, rewatchCount: 1, nextEpisode: ep(2) };
		expect(rewatchHeal(order, countsOf(2, 1, 1, 0, 0), tracking, TODAY)).toBeNull();
		// …but a hole before the last watched one still does
		expect(rewatchHeal(order, countsOf(2, 0, 1, 1, 0), tracking, TODAY)?.nextEpisode).toEqual(
			ep(2),
		);
	});

	it("paused rewatch: new episodes do reset it (pointer to the first new one)", () => {
		const tracking = { status: WatchStatus.PAUSED_REWATCH, rewatchCount: 1, nextEpisode: ep(2) };
		expect(rewatchHeal(order, countsOf(2, 1, 1, 0, 0), tracking, TODAY)).toEqual({
			rewatchCount: 0,
			status: WatchStatus.PAUSED,
			nextEpisode: ep(4),
		});
	});

	it("first watch (rewatch count 0) never heals", () => {
		const tracking = { status: WatchStatus.WATCHING, rewatchCount: 0, nextEpisode: ep(2) };
		expect(rewatchHeal(order, countsOf(1, 0, 0, 0, 0), tracking, TODAY)).toBeNull();
	});
});

describe("rewatchBlocker", () => {
	it("next rewatch needs every aired episode at the current run → the first one short", () => {
		expect(rewatchBlocker(order, countsOf(2, 2, 1, 0, 0), 0, TODAY)).toEqual(ep(4));
		expect(rewatchBlocker(order, countsOf(2, 2, 1, 2, 0), 1, TODAY)).toEqual(ep(3));
	});

	it("all aired episodes caught up (unaired ones don't count) → null", () => {
		expect(rewatchBlocker(order, countsOf(1, 1, 1, 1, 0), 0, TODAY)).toBeNull();
		expect(rewatchBlocker(order, countsOf(2, 3, 2, 2, 0), 1, TODAY)).toBeNull();
	});
});
