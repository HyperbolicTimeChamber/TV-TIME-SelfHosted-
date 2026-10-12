import { describe, expect, it } from "vitest";
import { queryClient } from "../src/queryClient";

describe("queryClient", () => {
	it("matches the app: no refetch when the tab regains focus", () => {
		const q = queryClient.getDefaultOptions().queries!;
		expect(q.refetchOnWindowFocus).toBe(false);
		expect(q.staleTime).toBe(5 * 60 * 1000);
	});
});
