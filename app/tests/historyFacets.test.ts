import { test } from "node:test";
import assert from "node:assert/strict";
import { WatchStatus } from "../src/enums";
import type { HistoryEntry } from "../src/types";

const entry = (over: Partial<HistoryEntry>): HistoryEntry =>
	({ status: WatchStatus.WATCHING, genres: [], keywords: [], ...over }) as HistoryEntry;
const facets = (genres: string[], keywords: string[]) => ({
	genres: new Set(genres),
	keywords: new Set(keywords),
});

test("matchesHistoryView: any picked genre AND any picked keyword AND the statuses", async () => {
	const { matchesHistoryView } = await import("../src/utils/historyView");
	const sword = entry({ genres: ["Comedy", "Animation"], keywords: ["sword", "magic"] });
	assert.equal(matchesHistoryView(sword, [], facets(["Comedy", "Drama"], [])), true);
	assert.equal(matchesHistoryView(sword, [], facets(["Comedy"], ["sword"])), true);
	assert.equal(matchesHistoryView(sword, [], facets(["Comedy"], ["office"])), false);
	assert.equal(matchesHistoryView(sword, [WatchStatus.PAUSED], facets(["Comedy"], [])), false);
	// Cached before the fields existed → no match once a facet is picked
	assert.equal(matchesHistoryView(entry({ genres: undefined }), [], facets(["Comedy"], [])), false);
	assert.equal(matchesHistoryView(entry({ genres: undefined }), [], facets([], [])), true);
});

test("facetOptionsFromDoc: genres A–Z, keywords most common first, zero counts dropped", async () => {
	const { facetOptionsFromDoc } = await import("../src/utils/historyView");
	assert.deepEqual(
		facetOptionsFromDoc({
			genres: { Drama: 2, Comedy: 1, Western: 0 },
			keywords: { boss: 1, office: 3 },
		}),
		{ genres: ["Comedy", "Drama"], keywords: ["office", "boss"] },
	);
	assert.deepEqual(facetOptionsFromDoc(null), { genres: [], keywords: [] });
});

test("applyFacetDelta (client mirror): patches the kept facets doc, drops zeros", async () => {
	const { applyFacetDelta } = await import("../src/utils/historyView");
	const kept = { genres: { Comedy: 1, Drama: 2 }, keywords: { office: 1 } };
	assert.deepEqual(applyFacetDelta(kept, null, { genres: ["Comedy"], keywords: ["boss"] }), {
		genres: { Comedy: 2, Drama: 2 },
		keywords: { office: 1, boss: 1 },
	});
	assert.deepEqual(applyFacetDelta(kept, { genres: ["Comedy"], keywords: ["office"] }, null), {
		genres: { Drama: 2 },
		keywords: {},
	});
});
