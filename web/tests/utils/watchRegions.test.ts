import { describe, expect, it } from "vitest";
import { buildRegionList, regionFlag, regionName } from "@app/utils/watchRegions";

describe("watchRegions", () => {
	it("makes a flag from the code", () => {
		expect(regionFlag("IN")).toBe("\u{1F1EE}\u{1F1F3}");
		expect(regionFlag("in")).toBe("");
	});

	it("names a code, falling back to the code", () => {
		expect(regionName("DE")).toBe("Germany");
		expect(regionName("ZZ")).toBe("ZZ");
	});

	it("lists stored countries first and leaves the viewer's own out", () => {
		const list = buildRegionList(["JP", "FR"], "", "IN");
		expect(list.slice(0, 2).map((e) => e.code)).toEqual(["FR", "JP"]);
		expect(list.some((e) => e.code === "IN")).toBe(false);
	});

	it("filters by name or exact code, prefix matches first", () => {
		expect(buildRegionList([], "ger")[0].code).toBe("DE");
		expect(buildRegionList([], "us")[0].code).toBe("US");
		expect(buildRegionList([], "zzzzqq")).toEqual([]);
	});
});
