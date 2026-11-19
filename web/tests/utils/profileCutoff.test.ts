import { describe, expect, it } from "vitest";
import { MediaType } from "@app/enums";
import type { CustomList } from "@app/types";
import { crossesCutoff, cutoffPlacement, previewOrder } from "@app/utils/profileCutoff";
import { profileLists } from "@app/utils/customLists";

const sized = (id: string, n: number, order?: number): CustomList => ({
	id,
	name: id,
	order,
	items: Array.from({ length: n }, (_, i) => ({
		tmdbId: i,
		mediaType: MediaType.TV,
		title: String(i),
		posterPath: null,
		addedAt: i,
	})),
	createdAt: 1,
	updatedAt: 1,
});
const seven = ["a", "b", "c", "d", "e", "f", "g"].map((id) => sized(id, 2));
const ids = (set: Set<string>) => [...set].sort();

describe("profileCutoff", () => {
	it("fades everything after the 5th list and puts the line on the 6th", () => {
		const p = cutoffPlacement(seven, 5);
		expect(ids(p.dimmedIds)).toEqual(["f", "g"]);
		expect(p.lineTopId).toBe("f");
		expect(p.lineBottomId).toBeNull();
	});

	it("empty lists never count and are faded", () => {
		const p = cutoffPlacement([sized("a", 1), sized("b", 0), sized("c", 2), sized("d", 3)], 2);
		expect(ids(p.dimmedIds)).toEqual(["b", "d"]);
		expect(p.lineTopId).toBe("d");
	});

	it("keeps the line off the dragged list", () => {
		const p = cutoffPlacement(seven, 5, "f");
		expect(p.lineTopId).toBeNull();
		expect(p.lineBottomId).toBe("e");
	});

	it("follows a drag across the cutoff", () => {
		const drag = { id: "a", from: 0, to: 0 };
		expect(previewOrder(seven, { ...drag, to: 5 }).map((l) => l.id)).toEqual([
			"b",
			"c",
			"d",
			"e",
			"f",
			"a",
			"g",
		]);
		expect(crossesCutoff(seven, drag, 4, 5)).toBe(false);
		expect(crossesCutoff(seven, drag, 5, 5)).toBe(true);
	});

	it("the profile shows the first lists in the user's order, skipping empty ones", () => {
		const lists = [sized("a", 1, 1), sized("b", 0, 0), sized("c", 4, 2), sized("d", 9, 3)];
		expect(profileLists(lists, 2).map((l) => l.id)).toEqual(["a", "c"]);
		expect(profileLists(lists, 0)).toEqual([]);
	});
});
