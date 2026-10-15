import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { HistoryPill, HistoryProgress, MediaType } from "@app/enums";
import type { HistoryCard } from "@app/utils";
import { renderWithProviders, testUser } from "../../render";

const card = (o: Partial<HistoryCard>): HistoryCard => ({
	id: "tv_1",
	tmdbId: 1,
	mediaType: MediaType.TV,
	title: "Lost",
	logoPath: null,
	backdropPath: null,
	pill: HistoryPill.WATCHING,
	timeSpent: "3d 4h",
	lastWatched: "S01 | E02",
	watchCount: null,
	progress: { kind: HistoryProgress.PERCENT, percent: 55 },
	tag: "Ongoing",
	...o,
});

const tvCards = [
	card({ id: "tv_1", logoPath: "/logo.png" }),
	card({ id: "tv_2", tmdbId: 2, title: "Dark", pill: HistoryPill.COMPLETED, watchCount: 2, progress: null, tag: "Ended" }),
	card({ id: "tv_3", tmdbId: 3, title: "Severance", progress: { kind: HistoryProgress.UP_TO_DATE } }),
	card({ id: "tv_4", tmdbId: 4, title: "Fargo", pill: HistoryPill.PAUSED, progress: { kind: HistoryProgress.PAUSED } }),
];
const useWatchHistory = vi.fn((mediaType: MediaType) => ({
	cards: mediaType === MediaType.TV ? tvCards : [],
	loading: false,
	loadingMore: false,
	hasMore: false,
	error: null,
	loadMore: vi.fn(),
}));
vi.mock("@app/hooks/useWatchHistory", () => ({ useWatchHistory: (m: MediaType) => useWatchHistory(m) }));

import AppShell from "../../../src/layout/AppShell";
import WatchHistoryScreen from "../../../src/screens/ProfileScreen/WatchHistory";

const renderPage = () =>
	renderWithProviders(
		<Routes>
			<Route element={<AppShell />}>
				<Route path="/profile/history" element={<WatchHistoryScreen />} />
			</Route>
		</Routes>,
		{ user: testUser, path: "/profile/history" },
	);

describe("WatchHistoryScreen", () => {
	it("opens on TV Shows (left tab), hides the tab bar, renders each card state", () => {
		renderPage();
		const tabs = screen.getAllByRole("tab");
		expect(tabs.map((t) => t.textContent)).toEqual(["TV Shows", "Movies"]);
		expect(tabs[0]).toHaveAttribute("aria-selected", "true");
		expect(useWatchHistory).toHaveBeenLastCalledWith(MediaType.TV);
		expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();

		expect(screen.getByText("55%")).toBeInTheDocument();
		expect(screen.getByText("Up To Date")).toBeInTheDocument();
		// Paused card: status pill reads Incomplete, progress module says Paused
		expect(screen.getByText("Incomplete")).toBeInTheDocument();
		expect(screen.getByText("Paused")).toBeInTheDocument();
		expect(screen.getByText("Watch Count")).toHaveTextContent("Watch Count 2");
		expect(screen.getByText("Ended")).toBeInTheDocument();
		// Logo only where TMDB has one
		expect(document.querySelectorAll('img[src*="/logo.png"]')).toHaveLength(1);
	});

	it("Movies tab loads its own list; empty shows the message", () => {
		renderPage();
		fireEvent.click(screen.getByText("Movies"));
		expect(useWatchHistory).toHaveBeenLastCalledWith(MediaType.MOVIE);
		expect(screen.getByText("Nothing watched yet")).toBeInTheDocument();
	});
});
