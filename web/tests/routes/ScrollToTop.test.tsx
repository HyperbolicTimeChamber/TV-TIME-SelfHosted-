import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import ScrollToTop from "../../src/routes/ScrollToTop";

let navigate: ReturnType<typeof useNavigate>;
function Grab() {
	navigate = useNavigate();
	return null;
}

describe("ScrollToTop", () => {
	it("scrolls to the top on new pages, not on back/forward", () => {
		const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
		render(
			<MemoryRouter initialEntries={["/home"]}>
				<ScrollToTop />
				<Grab />
			</MemoryRouter>,
		);
		scrollTo.mockClear();

		act(() => navigate("/show/tv/1"));
		expect(scrollTo).toHaveBeenCalledWith(0, 0);

		scrollTo.mockClear();
		act(() => navigate(-1));
		expect(scrollTo).not.toHaveBeenCalled();
	});
});
