import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, testUser } from "../../render";

vi.mock("@app/hooks/useUserStats", () => ({
	useUserStats: () => ({ stats: { episodesWatched: 1234, moviesWatched: 56, showsTracking: 78, totalMinutes: 3 * 1440 + 240 }, loading: false }),
}));
vi.mock("@app/hooks/useWeeklyActivity", () => ({
	useWeeklyActivity: () => ({
		chartData: ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"].map((label, i) => ({
			day: label,
			label,
			episodes: i === 2 ? 5 : 0,
			movies: 0,
		})),
		loading: false,
	}),
}));
vi.mock("@app/hooks/useWatchlist", () => ({ useWatchlist: () => ({ items: [] }) }));
vi.mock("@app/hooks/useProfileCardImages", () => ({
	useProfileCardImages: () => ({ episodeBackdrop: null, movieBackdrop: null, trackingPosters: [], watchTimePosters: [] }),
}));
vi.mock("@app/hooks/useCompletedShows", () => ({
	useCompletedShows: () => ({
		sections: [{ title: "Drama", items: [{ tmdbId: 1, mediaType: "tv", posterPath: null, title: "Lost" }] }],
		loading: false,
	}),
}));

import ProfileScreen from "../../../src/screens/ProfileScreen";
import SettingsScreen from "../../../src/screens/ProfileScreen/SettingsScreen";

describe("ProfileScreen", () => {
	it("shows formatted stats, chart and recently completed", async () => {
		// Reduced motion: the stats skip their count-up and land on the final figures
		vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
		renderWithProviders(<ProfileScreen />, { user: testUser });
		expect(await screen.findByText("1.2K")).toBeInTheDocument();
		expect(screen.getByText("56")).toBeInTheDocument();
		expect(screen.getByText("3d 4h")).toBeInTheDocument();
		// Watch rate charts, now the week comes from the watched collections
		expect(screen.getByText("Weekly Watch Rate")).toBeInTheDocument();
		expect(screen.getByText("Daily Watch Rate")).toBeInTheDocument();
		vi.unstubAllGlobals();
		expect(screen.getByRole("button", { name: "Hall of Shame" })).toBeInTheDocument();
		expect(screen.getByText("Recently Completed")).toBeInTheDocument();
		expect(screen.getByText("Drama")).toBeInTheDocument();
		// Log Out lives in Settings now
		expect(screen.queryByRole("button", { name: "Log Out" })).not.toBeInTheDocument();
	});

	it("settings offers password change only to email accounts", () => {
		renderWithProviders(<SettingsScreen />, { user: testUser });
		expect(screen.getByRole("button", { name: "Log Out" })).toBeInTheDocument();
		expect(screen.getByText("Change Password")).toBeInTheDocument();
		expect(screen.getByText("Import TV Time Data")).toBeInTheDocument();
	});

	it("settings hides password change for Google accounts", () => {
		renderWithProviders(<SettingsScreen />, { user: { ...testUser, providerData: [{ providerId: "google.com" }] } });
		expect(screen.queryByText("Change Password")).not.toBeInTheDocument();
	});
});
