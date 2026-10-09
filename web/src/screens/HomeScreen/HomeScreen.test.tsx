import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, testUser } from "../../test/render";
import { todayStr } from "@app/utils/todayStr";

let listData: unknown[] = [];
vi.mock("@app/screens/HomeScreen/WatchlistTab/useWatchlistScreen", () => ({
	useWatchlistScreen: () => ({
		isLoading: false,
		listData,
		prevWatchedOffset: 0,
		updatingShows: new Map(),
		hasMorePrevWatched: false,
		loadMoreTracking: vi.fn(),
		loadingMoreTracking: false,
		epModalData: null,
		drawerShow: null,
		sheetEpisode: null,
		sheetMovie: null,
	}),
}));

const yesterday = new Date(Date.now() - 86400000);
const ymd = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
let upcomingList: unknown[] = [];
vi.mock("@app/screens/HomeScreen/UpcomingTab/useUpcomingScreen", () => ({
	useUpcomingScreen: () => ({ isLoading: false, error: null, listData: upcomingList, epModalData: null, drawerShow: null }),
}));

import { Route, Routes } from "react-router-dom";
import HomeScreen from ".";

const Home = () => (
	<Routes>
		<Route path="/home/*" element={<HomeScreen />} />
	</Routes>
);

const show = {
	id: "tv_1",
	tmdbId: 1,
	mediaType: "tv",
	status: "watching",
	title: "Neagley",
	posterPath: null,
	rewatchCount: 0,
	nextEpisode: { season: 1, episode: 2 },
	nextEpisodeName: "The Real Name",
	nextEpisodeAirDate: todayStr(),
	remaining: 3,
};

describe("HomeScreen", () => {
	it("watchlist shows Up Next cards with NEW tag and remaining count", () => {
		listData = [{ type: "sectionHeader", title: "What's Up Next" }, { type: "show", item: show }];
		renderWithProviders(<Home />, { user: testUser, path: "/home" });
		expect(screen.getByText("What's Up Next")).toBeInTheDocument();
		expect(screen.getByText("NEAGLEY")).toBeInTheDocument();
		expect(screen.getByText("The Real Name")).toBeInTheDocument();
		expect(screen.getByText("NEW")).toBeInTheDocument();
		expect(screen.getByText("+3")).toBeInTheDocument();
	});

	it("empty watchlist offers to add shows", () => {
		listData = [];
		renderWithProviders(<Home />, { user: testUser, path: "/home" });
		expect(screen.getByText("No shows in your watchlist")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "+ Add Shows" })).toBeInTheDocument();
	});

	it("upcoming shows past days (Yesterday) above Today", () => {
		const ep = { tmdbShowId: 1, showTitle: "Neagley", posterPath: null, season: 1, episode: 3, episodeTitle: "Ep Three", airDate: todayStr(), runtime: null };
		upcomingList = [
			{ type: "header", date: ymd(yesterday) },
			{ type: "episode", episode: { ...ep, episode: 2, episodeTitle: "Ep Two", airDate: ymd(yesterday) } },
			{ type: "header", date: todayStr() },
			{ type: "episode", episode: ep },
		];
		renderWithProviders(<Home />, { user: testUser, path: "/home/upcoming" });
		const headers = screen.getAllByText(/Yesterday|Today/);
		expect(headers.map((h) => h.textContent)).toEqual(["Yesterday", "Today"]);
		expect(screen.getByText("Ep Three")).toBeInTheDocument();
	});
});
