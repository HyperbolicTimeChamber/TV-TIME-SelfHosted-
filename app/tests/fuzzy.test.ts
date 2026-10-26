import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackQueries, fuzzyRank, fuzzyScore, normalize } from "../src/utils/fuzzy";

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

test("fallbackQueries: cleaned query, then without the last word", () => {
	assert.deepEqual(fallbackQueries("The Offfice!"), ["offfice"]);
	assert.deepEqual(fallbackQueries("money heistt"), ["money"]);
	assert.deepEqual(fallbackQueries("scrubs"), []);
});
