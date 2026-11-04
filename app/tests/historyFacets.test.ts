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

const INDEX = {
	tv_1: ["g:Drama", "c:KR", "s:tvN", "k:romance"],
	tv_2: ["g:Comedy", "c:US", "s:NBC"],
	tv_3: ["g:Drama", "c:IT", "s:RAI"],
};

test("availableFacets: a section's own picks don't narrow it; other sections do", async () => {
	const { availableFacets } = await import("../src/utils/historyView");
	assert.equal(availableFacets(INDEX, facets([], [])), null);
	assert.equal(availableFacets(null, facets(["Drama"], [])), null);
	const a = availableFacets(INDEX, facets([], [], ["IT"]))!;
	// Italy picked: only Drama is left in genres; every country stays (any-of)
	assert.deepEqual([...a.genres], ["Drama"]);
	assert.deepEqual([...a.countries].sort(), ["IT", "KR", "US"]);
	const b = availableFacets(INDEX, facets(["Drama"], [], ["IT"]))!;
	assert.deepEqual([...b.studios], ["RAI"]);
	assert.deepEqual([...b.keywords], []);
});

test("buildFilterSections: k drama reveals South Korea + Drama and offers both in one chip", async () => {
	const { buildFilterSections } = await import("../src/utils/historyFilterSections");
	const options = {
		genres: ["Comedy", "Drama"],
		keywords: ["romance"],
		countries: ["US", "KR", "IT"],
		studios: ["NBC", "tvN", "RAI"],
	};
	const s = buildFilterSections({
		term: "k drama",
		filters: new Set(),
		facets: facets([], []),
		options,
		index: INDEX,
		allCountries: false,
		studioLimit: 8,
	});
	assert.deepEqual(s.countries, ["KR"]);
	assert.deepEqual(s.genres, ["Drama"]);
	assert.deepEqual(s.region?.countries, ["KR"]);
	assert.deepEqual(s.region?.genres, ["Drama"]);
	// Italy picked → Comedy / US / NBC can't match anything with it: hidden
	const it = buildFilterSections({
		term: "",
		filters: new Set(),
		facets: facets([], [], ["IT"]),
		options,
		index: INDEX,
		allCountries: false,
		studioLimit: 8,
	});
	assert.deepEqual(it.genres, ["Drama"]);
	assert.deepEqual(it.studios, ["RAI"]);
	assert.deepEqual(it.keywords.rest, []);
});

test("filterAliasFor: demonyms, genre and keyword synonyms", async () => {
	const { filterAliasFor } = await import("../src/utils/historyView");
	assert.deepEqual(filterAliasFor("Korean")?.countries, ["KR"]);
	assert.ok(filterAliasFor("sci-fi")?.genres?.includes("Science Fiction"));
	assert.deepEqual(filterAliasFor("rom com")?.keywords, ["romantic comedy"]);
	assert.equal(filterAliasFor("K-Drama")?.label, "K-Drama");
});
