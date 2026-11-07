import { describe, expect, it } from "vitest";
import { mainStudios } from "@app/utils/studioNames";

const s = (id: number, name: string, logo = `/${id}.png`) => ({ id, name, logo });

describe("info page studios", () => {
	it("drops a division when its parent is listed", () => {
		const shown = mainStudios([
			s(1, "Tokyo MX"),
			s(2, "OLM"),
			s(3, "OLM Digital, Inc."),
			s(4, "Toho Animation"),
			s(5, "TOHO"),
		]).map((x) => x.name);
		expect(shown).toEqual(["Tokyo MX", "OLM", "TOHO"]);
	});

	it("keeps a division listed alone, and look-alike names that aren't one", () => {
		const shown = mainStudios([s(1, "OLM Digital"), s(2, "Studio Dragon"), s(3, "Studio S")]).map(
			(x) => x.name,
		);
		expect(shown).toEqual(["OLM Digital", "Studio Dragon", "Studio S"]);
	});

	it("drops repeats with the same name or logo", () => {
		const shown = mainStudios([s(1, "OLM, Inc."), s(2, "OLM"), s(3, "Other", "/1.png")]).map(
			(x) => x.id,
		);
		expect(shown).toEqual([1]);
	});
});
