import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSlowPending } from "@app/hooks/useSlowPending";
import { SLOW_LOAD_MS } from "@app/enums";

const THRESHOLD = 40;

describe("useSlowPending", () => {
	it("is false at first, true once pending outlasts the threshold", async () => {
		const { result } = renderHook(() => useSlowPending(true, THRESHOLD));
		expect(result.current).toBe(false);
		await waitFor(() => expect(result.current).toBe(true));
	});

	it("never goes true when pending clears before the threshold", async () => {
		const { result, rerender } = renderHook(({ pending }) => useSlowPending(pending, THRESHOLD), {
			initialProps: { pending: true },
		});
		rerender({ pending: false });
		await new Promise((r) => setTimeout(r, THRESHOLD * 3));
		expect(result.current).toBe(false);
	});

	it("drops to false the moment the data lands", async () => {
		const { result, rerender } = renderHook(({ pending }) => useSlowPending(pending, THRESHOLD), {
			initialProps: { pending: true },
		});
		await waitFor(() => expect(result.current).toBe(true));
		rerender({ pending: false });
		expect(result.current).toBe(false);
	});

	it("the default threshold is 6 seconds", () => {
		expect(SLOW_LOAD_MS).toBe(6000);
	});
});
