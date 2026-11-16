import { test } from "node:test";
import assert from "node:assert/strict";
import {
	formatMovieRuntime,
	movieSheetMeta,
	directorLabel,
	movieSheetFromCatalog,
	movieSheetFromTmdb,
} from "../src/utils";
import type { CatalogShow, TMDBShow } from "../src/types";

test("runtime formats as hours and minutes", () => {
	assert.equal(formatMovieRuntime(112), "1h 52m");
	assert.equal(formatMovieRuntime(45), "45m");
	assert.equal(formatMovieRuntime(120), "2h");
	assert.equal(formatMovieRuntime(0), null);
	assert.equal(formatMovieRuntime(null), null);
});

test("meta line joins what is known", () => {
	assert.equal(movieSheetMeta("2010", 148), "2010 · 2h 28m");
	assert.equal(movieSheetMeta("2010", null), "2010");
	assert.equal(movieSheetMeta(null, 90), "1h 30m");
	assert.equal(movieSheetMeta(null, null), null);
});

test("director label is singular for one", () => {
	assert.equal(directorLabel(1), "Director");
	assert.equal(directorLabel(2), "Directors");
});

test("catalog source needs a complete doc with credits", () => {
	const base = { tmdbId: 1, title: "Heat", overview: "x", runtime: 170 } as unknown as CatalogShow;
	assert.equal(movieSheetFromCatalog(null), null);
	assert.equal(movieSheetFromCatalog({ ...base, partial: true } as CatalogShow), null);
	assert.equal(movieSheetFromCatalog(base), null);
	const full = {
		...base,
		credits: { directors: ["Michael Mann", "Michael Mann"], writers: [], producers: [] },
	} as unknown as CatalogShow;
	assert.deepEqual(movieSheetFromCatalog(full), {
		runtime: 170,
		directors: ["Michael Mann"],
		overview: "x",
	});
});

test("tmdb source picks directors only, each once", () => {
	const show = {
		id: 1,
		runtime: 0,
		overview: "o",
		credits: {
			crew: [
				{ job: "Director", department: "Directing", name: "A" },
				{ job: "Director", department: "Directing", name: "A" },
				{ job: "Writer", department: "Writing", name: "B" },
			],
		},
	} as unknown as TMDBShow;
	assert.deepEqual(movieSheetFromTmdb(show), { runtime: null, directors: ["A"], overview: "o" });
	assert.deepEqual(movieSheetFromTmdb({ id: 2 } as TMDBShow), {
		runtime: null,
		directors: [],
		overview: "",
	});
});
