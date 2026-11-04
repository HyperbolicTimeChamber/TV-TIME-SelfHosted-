import { test } from "node:test";
import assert from "node:assert/strict";
import { WatchStatus } from "../src/enums";
import type { HistoryEntry } from "../src/types";

const entry = (over: Partial<HistoryEntry>): HistoryEntry =>
	({ status: WatchStatus.WATCHING, genres: [], keywords: [], ...over }) as HistoryEntry;
const facets = (
	genres: string[],
	keywords: string[],
	countries: string[] = [],
	studios: string[] = [],
) => ({
	genres: new Set(genres),
	keywords: new Set(keywords),
	countries: new Set(countries),
	studios: new Set(studios),
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
	// K-Drama = Korea AND Drama
	const kdrama = entry({ genres: ["Drama"], countries: ["KR"] });
	assert.equal(matchesHistoryView(kdrama, [], facets(["Drama"], [], ["KR"])), true);
	assert.equal(matchesHistoryView(kdrama, [], facets(["Drama"], [], ["JP"])), false);
	assert.equal(matchesHistoryView(entry({ genres: ["Drama"] }), [], facets([], [], ["KR"])), false);
	// Studio
	const hbo = entry({ studios: ["HBO", "Warner Bros. Television"] });
	assert.equal(matchesHistoryView(hbo, [], facets([], [], [], ["HBO", "Netflix"])), true);
	assert.equal(matchesHistoryView(hbo, [], facets([], [], [], ["Netflix"])), false);
});

test("facetOptionsFromDoc: genres A–Z, keywords most common first, zero counts dropped", async () => {
	const { facetOptionsFromDoc } = await import("../src/utils/historyView");
	assert.deepEqual(
		facetOptionsFromDoc({
			genres: { Drama: 2, Comedy: 1, Western: 0 },
			keywords: { boss: 1, office: 3 },
			countries: { US: 4, KR: 6, JP: 0 },
		}),
		{
			genres: ["Comedy", "Drama"],
			keywords: ["office", "boss"],
			countries: ["KR", "US"],
			studios: [],
		},
	);
	assert.deepEqual(facetOptionsFromDoc(null), {
		genres: [],
		keywords: [],
		countries: [],
		studios: [],
	});
});

test("applyFacetDelta (client mirror): patches the kept facets doc, drops zeros", async () => {
	const { applyFacetDelta } = await import("../src/utils/historyView");
	const kept = { genres: { Comedy: 1, Drama: 2 }, keywords: { office: 1 } };
	assert.deepEqual(
		applyFacetDelta(kept, null, { genres: ["Comedy"], keywords: ["boss"], countries: ["KR"] }),
		{
			genres: { Comedy: 2, Drama: 2 },
			keywords: { office: 1, boss: 1 },
			countries: { KR: 1 },
			studios: {},
		},
	);
	assert.deepEqual(applyFacetDelta(kept, { genres: ["Comedy"], keywords: ["office"] }, null), {
		genres: { Drama: 2 },
		keywords: {},
		countries: {},
		studios: {},
	});
});
