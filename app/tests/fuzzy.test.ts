import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanedQuery, fallbackWords, fuzzyRank, fuzzyScore, normalize } from "../src/utils/fuzzy";

test("normalize: case, accents, punctuation, a leading 'the'", () => {
	assert.equal(normalize("The Office (US)"), "office us");
	assert.equal(normalize("Pokémon: Indigo League"), "pokemon indigo league");
});

test("fuzzyScore: prefixes, typos, swapped letters, joined words", () => {
	assert.ok(fuzzyScore("break", "Breaking Bad") > 1); // starts-with bonus
	assert.ok(fuzzyScore("brakng bad", "Breaking Bad") > 0); // dropped letters
	assert.ok(fuzzyScore("braeking", "Breaking Bad") > 0); // swapped letters
	assert.ok(fuzzyScore("moneyheist", "Money Heist") > 0);
	assert.ok(fuzzyScore("scrbs", "Scrubs") > 0);
	assert.equal(fuzzyScore("bat", "Scrubs"), 0);
	assert.equal(fuzzyScore("xyz", "Breaking Bad"), 0);
	// Short words must be exact prefixes — "bt" shouldn't match "but"
	assert.equal(fuzzyScore("bt", "But Why"), 0);
});

test("fuzzyRank: best first, misses dropped, ties keep order", () => {
	const titles = ["Better Call Saul", "Breaking Bad", "El Camino: A Breaking Bad Movie", "Scrubs"];
	assert.deepEqual(fuzzyRank("brakng bad", titles), [
		"Breaking Bad",
		"El Camino: A Breaking Bad Movie",
	]);
	assert.deepEqual(fuzzyRank("bat", ["Batman", "Batwoman"]), ["Batman", "Batwoman"]);
});

test("cleanedQuery: only when cleaning changes it", () => {
	assert.equal(cleanedQuery("The Offfice!"), "offfice");
	assert.equal(cleanedQuery("scrubs"), null);
});

test("fallbackWords: longest meaningful words of a multi-word query", () => {
	assert.deepEqual(fallbackWords("brakng bad"), ["brakng", "bad"]);
	assert.deepEqual(fallbackWords("The Lord of the Rnigs"), ["rnigs", "lord"]);
	assert.deepEqual(fallbackWords("a b cd efgh ijklmn opq rs"), ["ijklmn", "efgh", "opq"]);
	assert.deepEqual(fallbackWords("scrubs"), []);
});

test("rememberedMatches: reuse the longest earlier query's suggestions, still matching", async () => {
	const { rememberSuggestions, rememberedMatches, SUGGESTION_MEMORY_MS } =
		await import("../src/utils/fuzzy");
	const memory = new Map();
	rememberSuggestions(memory, "breaking", ["Breaking Bad", "Breaking Point", "Breaking Dawn"], 0);
	rememberSuggestions(memory, "breaking b", ["Breaking Bad", "Breaking Bread"], 1);
	// Longest prefix wins; only what still matches "breaking bda"
	assert.deepEqual(rememberedMatches(memory, "breaking bda", 2), [
		"Breaking Bad",
		"Breaking Bread",
	]);
	// Nothing typed before that it starts with
	assert.deepEqual(rememberedMatches(memory, "scrbs", 2), []);
	// Expired
	assert.deepEqual(rememberedMatches(memory, "breaking bda", SUGGESTION_MEMORY_MS + 10), []);
});

test("rememberSuggestions: empty results aren't kept, oldest dropped past 20", async () => {
	const { rememberSuggestions } = await import("../src/utils/fuzzy");
	const memory = new Map();
	rememberSuggestions(memory, "none", [], 0);
	assert.equal(memory.size, 0);
	for (let i = 0; i < 25; i++) rememberSuggestions(memory, `q${i}`, ["x"], i);
	assert.equal(memory.size, 20);
	assert.ok(!memory.has("q0") && memory.has("q24"));
});
