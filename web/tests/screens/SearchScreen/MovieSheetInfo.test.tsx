import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../render";

let state: { data?: { runtime: number | null; directors: string[]; overview: string }; isPending: boolean } = {
	isPending: true,
};
vi.mock("@app/hooks/useMovieSheetDetails", () => ({ useMovieSheetDetails: () => state }));

import MovieSheetInfo from "../../../src/screens/SearchScreen/MovieSheetInfo";

describe("MovieSheetInfo", () => {
	it("shows the year at once and placeholders while pending", () => {
		state = { isPending: true };
		renderWithProviders(<MovieSheetInfo tmdbId={1} year="2010" />);
		expect(screen.getByText("2010")).toBeInTheDocument();
		expect(screen.getByRole("status", { name: "Loading details" })).toBeInTheDocument();
		expect(screen.queryByText("Director")).not.toBeInTheDocument();
	});

	it("fills runtime, director and overview when loaded", () => {
		state = { isPending: false, data: { runtime: 148, directors: ["Christopher Nolan"], overview: "Dreams." } };
		renderWithProviders(<MovieSheetInfo tmdbId={1} year="2010" />);
		expect(screen.getByText("2010 · 2h 28m")).toBeInTheDocument();
		expect(screen.getByText("Director")).toBeInTheDocument();
		expect(screen.getByText(/Christopher Nolan/)).toBeInTheDocument();
		expect(screen.getByText("Dreams.")).toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("hides the director row when loaded and empty (no blank text)", () => {
		state = { isPending: false, data: { runtime: null, directors: [], overview: "" } };
		renderWithProviders(<MovieSheetInfo tmdbId={1} year={null} />);
		expect(screen.queryByText("Director")).not.toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});
});
