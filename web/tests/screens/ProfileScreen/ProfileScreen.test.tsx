import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, testUser } from "../../render";

vi.mock("@app/hooks/useUserStats", () => ({
	useUserStats: () => ({ stats: { episodesWatched: 1234, moviesWatched: 56, showsTracking: 78, totalMinutes: 3 * 1440 + 240 }, loading: false }),
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
	it("shows formatted stats, chart and recently completed", () => {
		renderWithProviders(<ProfileScreen />, { user: testUser });
		expect(screen.getByText("1.2K")).toBeInTheDocument();
		expect(screen.getByText("56")).toBeInTheDocument();
		expect(screen.getByText("3d 4h")).toBeInTheDocument();
		// Chart is app-only (per-device cache)
		expect(screen.queryByText("Watch Statistics")).not.toBeInTheDocument();
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
