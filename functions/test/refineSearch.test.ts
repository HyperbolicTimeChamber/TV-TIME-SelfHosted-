import { test } from "node:test";
import assert from "node:assert/strict";
import {
  byYear,
  personSplits,
  refineSearch,
  splitYear,
  titleMatches,
  type RefineDeps,
} from "../src/hooks/searchTitles/refineSearch";
import { searchIndexId } from "../src/hooks/searchTitles/searchIndex";
import { MediaType, SearchScope } from "../src/shared/enums";
import type { SearchTitle } from "../src/shared/types";

const movie = (id: number, title: string, release_date: string, popularity = 1): SearchTitle => ({
  id,
  media_type: MediaType.MOVIE,
  title,
  release_date,
  popularity,
});
const tv = (id: number, name: string, first_air_date: string): SearchTitle => ({
  id,
  media_type: MediaType.TV,
  name,
  first_air_date,
});

const BEGINS = movie(272, "Batman Begins", "2005-06-10", 20);
const KNIGHT = movie(155, "The Dark Knight", "2008-07-16", 50);
const RISES = movie(49026, "The Dark Knight Rises", "2012-07-20", 30);
const PRESTIGE = movie(1124, "The Prestige", "2006-10-17", 15);
const BATMAN_89 = movie(268, "Batman", "1989-06-21", 10);
const BATMAN_SHOW = tv(2022, "The Batman", "2006-09-11");

const ids = (titles: SearchTitle[]) => titles.map((t) => t.id);

test("a query files under its words, however it's typed", () => {
  assert.equal(searchIndexId(SearchScope.ALL, "Batman  Christian-Bale"), "all_batman_christian_bale");
  assert.equal(searchIndexId(SearchScope.TV, "batman 2006"), "tv_batman_2006");
  assert.equal(searchIndexId(SearchScope.ALL, "😀 😀"), null);
});

function deps(
  people: Record<string, number>,
  credits: Record<number, SearchTitle[]>,
  calls: string[] = [],
): RefineDeps {
  const tmdbGet = (async (path: string, params: Record<string, string | number>) => {
    calls.push(path);
    if (path === "/search/person") {
      const id = people[String(params.query)];
      return { results: id ? [{ id }] : [] };
    }
    const person = path.match(/^\/person\/(\d+)\//);
    if (person) return { cast: credits[Number(person[1])] ?? [], crew: [] };
    if (path === "/movie/272") return { belongs_to_collection: { id: 263 } };
    if (path.startsWith("/movie/")) return {};
    if (path === "/collection/263") return { parts: [{ id: 272 }, { id: 155 }, { id: 49026 }] };
    if (path === "/search/movie") {
      return { page: 1, results: [PRESTIGE], total_pages: 1, total_results: 1 };
    }
    if (path === "/search/tv") {
      return { page: 1, results: [BATMAN_SHOW], total_pages: 1, total_results: 1 };
    }
    throw new Error(`unexpected ${path}`);
  }) as RefineDeps["tmdbGet"];
  return {
    tmdbGet,
    search: async () => ({
      results: [BATMAN_89, BEGINS],
      batch: 1,
      totalBatches: 1,
      totalResults: 2,
    }),
  };
}

test("titleMatches wants every word, ignores accents and joins split words", () => {
  assert.equal(titleMatches(movie(1, "Batman Begins", ""), "begins batman"), true);
  assert.equal(titleMatches(movie(1, "Batman Begins", ""), "batman 2006"), false);
  assert.equal(titleMatches(movie(1, "Pokémon", ""), "pokemon"), true);
  assert.equal(titleMatches(movie(1, "Spider-Man", ""), "spiderman"), true);
  assert.equal(titleMatches(movie(1, "Blade Runner 2049", ""), "blade runner 2049"), true);
});

test("splitYear reads a year among other words only", () => {
  const now = new Date("2026-06-01");
  assert.deepEqual(splitYear(["batman", "2006"], now), { year: 2006, rest: ["batman"] });
  assert.deepEqual(splitYear(["2006", "batman"], now), { year: 2006, rest: ["batman"] });
  assert.equal(splitYear(["2012"], now).year, null);
  assert.equal(splitYear(["ocean", "1234"], now).year, null);
  assert.equal(splitYear(["ocean", "2099"], now).year, null);
  assert.equal(splitYear(["apollo", "13"], now).year, null);
});

test("personSplits tries a full name at the end first and leaves a title", () => {
  assert.deepEqual(personSplits(["batman", "christian", "bale"]).slice(0, 2), [
    { title: "batman", person: "christian bale" },
    { title: "batman christian", person: "bale" },
  ]);
  assert.deepEqual(personSplits(["batman", "nolan"]), [
    { title: "batman", person: "nolan" },
    { title: "nolan", person: "batman" },
  ]);
  assert.deepEqual(personSplits(["batman"]), []);
});

test("byYear puts that year first, then the closest, undated last", () => {
  const undated = movie(9, "No date", "");
  assert.deepEqual(ids(byYear([undated, BATMAN_89, BEGINS, PRESTIGE], 2006)), [
    1124, 272, 268, 9,
  ]);
});

test("a person's titles lead, with the sequels the title misses, then the rest", async () => {
  const res = await refineSearch(
    SearchScope.ALL,
    "batman christopher nolan",
    deps({ "christopher nolan": 525 }, { 525: [PRESTIGE, BEGINS, KNIGHT, RISES] }),
  );
  assert.deepEqual(ids(res!.results), [155, 49026, 272, 268]);
  assert.equal(res!.totalBatches, 1);
});

test("a person listed for both acting and directing appears once", async () => {
  const res = await refineSearch(
    SearchScope.ALL,
    "batman bale",
    deps({ bale: 3894 }, { 3894: [BEGINS, BEGINS] }),
  );
  assert.equal(ids(res!.results).filter((id) => id === 272).length, 1);
});

test("a year ranks the title's results by closeness", async () => {
  const res = await refineSearch(SearchScope.ALL, "batman 2006", deps({}, {}));
  assert.deepEqual(ids(res!.results), [1124, 2022, 272, 268]);
});

test("a year and a person combine", async () => {
  const res = await refineSearch(
    SearchScope.MOVIE,
    "batman 2012 christian bale",
    deps({ "christian bale": 3894 }, { 3894: [BEGINS, KNIGHT, RISES] }),
  );
  assert.deepEqual(ids(res!.results).slice(0, 3), [49026, 155, 272]);
});

test("a scope keeps out the other type's credits", async () => {
  const res = await refineSearch(
    SearchScope.TV,
    "batman bale",
    deps({ bale: 3894 }, { 3894: [BEGINS, BATMAN_SHOW] }),
  );
  assert.deepEqual(ids(res!.results).slice(0, 1), [2022]);
});

test("no year and nobody who worked on such a title: not refined", async () => {
  const calls: string[] = [];
  assert.equal(
    await refineSearch(
      SearchScope.ALL,
      "zzz christian bale",
      deps({ "christian bale": 3894 }, { 3894: [PRESTIGE] }, calls),
    ),
    null,
  );
  assert.equal(await refineSearch(SearchScope.ALL, "batman", deps({}, {})), null);
});

test("credits are fetched for a limited number of people", async () => {
  const calls: string[] = [];
  const everyone = new Proxy({} as Record<string, number>, { get: () => 7 });
  await refineSearch(SearchScope.ALL, "a b c d e", deps(everyone, {}, calls));
  assert.equal(calls.filter((p) => p.startsWith("/person/")).length, 3);
});
