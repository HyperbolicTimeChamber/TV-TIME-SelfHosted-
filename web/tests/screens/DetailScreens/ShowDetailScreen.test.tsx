import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders, testUser } from "../../render";

let user: { uid: string } | null = null;
const season = { id: 1, season_number: 1, name: "Season 1", episode_count: 2, air_date: "2020-01-01", poster_path: null };
const episodes = [
	{ id: 1, episode_number: 1, season_number: 1, name: "Pilot", overview: "", air_date: "2020-01-01", runtime: 30, still_path: null },
];

vi.mock("@app/screens/DetailScreens/useShowDetailActions", () => ({
	useShowDetailActions: () => ({
		user,
		show: { id: 1, name: "Lost", poster_path: null, backdrop_path: null, overview: "Plane crash.", vote_average: 8.2, number_of_seasons: 1, number_of_episodes: 2, seasons: [season] },
		isLoading: false,
		trackingLoading: false,
		isError: false,
		error: null,
		title: "Lost",
		year: "2004",
		directors: [],
		writers: [],
		producers: [],
		watchlistItem: null,
		showWatchedEps: [],
		episodesBySeason: new Map([[1, episodes]]),
		seasonLayout: [{ season: 1, episodeCount: 2 }],
		adding: false,
		removing: false,
		movieWatchCount: 0,
	}),
}));

vi.mock("@app/components/useSeasonActions", () => ({
	useSeasonActions: () => ({
		expanded: true,
		setExpanded: vi.fn(),
		episodes,
		watchedMap: new Map(),
		markingEps: new Set(),
		markingSeason: false,
		watchedLoading: false,
		watchedCount: 0,
		minWatchCount: 0,
		allWatched: false,
		partiallyWatched: false,
		isLoading: false,
		imagesLoading: false,
		epInfoData: null,
		sheetTarget: null,
		pendingAction: { current: null },
	}),
}));

import ShowDetailScreen from "../../../src/screens/DetailScreens/ShowDetailScreen";

const renderShow = (signedIn: boolean) => {
	user = signedIn ? { uid: "u1" } : null;
	renderWithProviders(
		<Routes>
			<Route path="/show/:mediaType/:tmdbId" element={<ShowDetailScreen />} />
			<Route path="/home" element={<p>watchlist page</p>} />
			<Route path="/search" element={<p>search page</p>} />
		</Routes>,
		{ user: signedIn ? testUser : null, path: "/show/tv/1" },
	);
};

describe("ShowDetailScreen", () => {
	it("guests see show info + episodes but cannot track or mark", () => {
		renderShow(false);
		expect(screen.getByRole("heading", { name: "Lost" })).toBeInTheDocument();
		expect(screen.getByText("Plane crash.")).toBeInTheDocument();
		expect(screen.getByText("Pilot")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Sign in to track" })).toBeInTheDocument();
		expect(screen.queryByText("+ Add to Watchlist")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Mark season watched")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Mark watched")).not.toBeInTheDocument();
	});

	it("signed-in users get add + check buttons", () => {
		renderShow(true);
		expect(screen.getByText("+ Add to Watchlist")).toBeInTheDocument();
		expect(screen.getByLabelText("Mark season watched")).toBeInTheDocument();
		expect(screen.getByLabelText("Mark watched")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Sign in to track" })).not.toBeInTheDocument();
	});

	it("shows the stats bar", () => {
		renderShow(false);
		expect(screen.getByText("2004")).toBeInTheDocument();
		expect(screen.getByText("8.2")).toBeInTheDocument();
		expect(screen.getByText("EPISODES")).toBeInTheDocument();
	});

	it("back from a deep link goes to the watchlist (search for guests)", () => {
		renderShow(true);
		fireEvent.click(screen.getByLabelText("Back"));
		expect(screen.getByText("watchlist page")).toBeInTheDocument();
	});

	it("back from a deep link sends guests to search", () => {
		renderShow(false);
		fireEvent.click(screen.getByLabelText("Back"));
		expect(screen.getByText("search page")).toBeInTheDocument();
	});
});
