import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, testUser } from "../../render";

const trending = [
	{ id: 1, name: "Lost", media_type: "tv", poster_path: null, first_air_date: "2004-09-22" },
	{ id: 2, title: "Heat", media_type: "movie", poster_path: null, release_date: "1995-12-15" },
];

vi.mock("@app/hooks/useTrending", () => ({
	useTrending: () => ({ data: trending, isLoading: false }),
}));
vi.mock("@app/hooks/useSearch", () => ({
	useSearch: () => ({ data: undefined, isLoading: false, fetchNextPage: vi.fn(), hasNextPage: false }),
}));

let signedIn = false;
vi.mock("@app/screens/SearchScreen/useSearchActions", () => ({
	useSearchActions: () => ({
		user: signedIn ? { uid: "u1" } : null,
		trackedIds: new Set([1]),
		addingIds: new Set(),
		handleAddToWatchlist: vi.fn(),
		handleRemoveFromWatchlist: vi.fn(),
	}),
}));

import SearchScreen from "../../../src/screens/SearchScreen";

describe("SearchScreen", () => {
	it("guests browse trending read-only with sign in / sign up", () => {
		signedIn = false;
		renderWithProviders(<SearchScreen />);
		expect(screen.getByText("Lost")).toBeInTheDocument();
		expect(screen.getByText("Heat")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
		expect(screen.queryByLabelText(/watchlist/i)).not.toBeInTheDocument();
	});

	it("signed-in users get add / tracked badges", () => {
		signedIn = true;
		renderWithProviders(<SearchScreen />, { user: testUser });
		expect(screen.getByLabelText("Remove from watchlist")).toBeInTheDocument();
		expect(screen.getByLabelText("Add to watchlist")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
	});

	it("labels TV vs movie", () => {
		signedIn = false;
		renderWithProviders(<SearchScreen />);
		// "TV" also labels the filter tab
		expect(screen.getAllByText("TV")).toHaveLength(2);
		expect(screen.getByText("MOVIE")).toBeInTheDocument();
	});
});
