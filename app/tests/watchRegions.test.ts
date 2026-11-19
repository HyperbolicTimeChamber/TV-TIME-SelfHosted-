import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegionList, regionFlag, regionName } from "../src/utils/watchRegions";
import { WATCH_REGION_NAMES } from "../src/enums";

const codes = (list: { code: string }[]) => list.map((e) => e.code);

test("regionFlag: two capital letters become the flag, anything else is empty", () => {
	assert.equal(regionFlag("IN"), "\u{1F1EE}\u{1F1F3}");
	assert.equal(regionFlag("us"), "");
	assert.equal(regionFlag("USA"), "");
	assert.equal(regionFlag(""), "");
});

test("regionName: listed name, then the chip names, then the code", () => {
	assert.equal(regionName("IN"), "India");
	assert.equal(regionName("ZZ"), "ZZ");
});

test("buildRegionList: stored countries first (A-Z), the rest A-Z, the viewer's own left out", () => {
	const list = buildRegionList(["JP", "FR"], "", "IN");
	assert.deepEqual(codes(list).slice(0, 2), ["FR", "JP"]);
	assert.equal(list[0].stored, true);
	assert.equal(list[2].stored, false);
	assert.equal(list[2].name, "Albania");
	assert.ok(!codes(list).includes("IN"));
	assert.equal(list.length, Object.keys(WATCH_REGION_NAMES).length - 1);
});

test("buildRegionList: a stored code that is not on the list is still offered, first", () => {
	const list = buildRegionList(["ZZ"], "");
	assert.equal(list[0].code, "ZZ");
	assert.equal(list[0].name, "ZZ");
});

test("buildRegionList: name search is case-insensitive, prefix matches before contains", () => {
	const list = buildRegionList([], "GER");
	assert.equal(list[0].code, "DE");
	assert.ok(codes(list).includes("NG"));
	assert.ok(!codes(list).includes("US"));
});

test("buildRegionList: an exact code matches first", () => {
	assert.equal(buildRegionList([], "us")[0].code, "US");
});

test("buildRegionList: stored stay first while searching", () => {
	assert.equal(buildRegionList(["NG"], "ger")[0].code, "NG");
});

test("buildRegionList: nothing matches -> empty list", () => {
	assert.deepEqual(buildRegionList([], "zzzzqq"), []);
});

test("buildRegionList: a blank search is the full list", () => {
	assert.equal(buildRegionList([], "   ").length, Object.keys(WATCH_REGION_NAMES).length);
});
