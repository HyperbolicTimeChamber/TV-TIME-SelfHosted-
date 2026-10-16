import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, testUser } from "../../render";

const handleDayPress = vi.fn();
const handleMonthChange = vi.fn();
vi.mock("@app/screens/useCalendarScreen", () => ({
	YEARS: [2025, 2026],
	useCalendarScreen: () => ({
		loading: false,
		selectedDate: "2026-10-09",
		currentYear: 2026,
		currentMonth: 10,
		yearModalVisible: false,
		setYearModalVisible: vi.fn(),
		markedDates: { "2026-10-09": { marked: true, dotColor: "#000", selected: true, selectedColor: "#E50914" } },
		selectedEpisodes: [
			{ tmdbShowId: 1, showTitle: "Reacher", posterPath: null, season: 4, episode: 9, episodeTitle: "Run", airDate: "2026-10-09", runtime: null },
			{ tmdbShowId: 1, showTitle: "Reacher", posterPath: null, season: 4, episode: 8, episodeTitle: "Cut", airDate: "2026-10-09", runtime: null },
			{ tmdbShowId: 3, showTitle: "Slow Horses", posterPath: null, season: 5, episode: 2, episodeTitle: "Two", airDate: "2026-10-09", runtime: null },
		],
		episodes: [
			{ tmdbShowId: 1, showTitle: "Reacher", posterPath: null, season: 4, episode: 8, episodeTitle: "Cut", airDate: "2026-10-09", runtime: null },
			// Same show twice that day → still 1 show
			{ tmdbShowId: 1, showTitle: "Reacher", posterPath: null, season: 4, episode: 9, episodeTitle: "Run", airDate: "2026-10-09", runtime: null },
			{ tmdbShowId: 2, showTitle: "Dune", posterPath: null, season: 0, episode: 0, episodeTitle: "Dune", airDate: "2026-10-09", runtime: null, mediaType: "movie" },
		],
		handleDayPress,
		handleMonthChange,
		selectYear: vi.fn(),
		monthLabel: "October 2026",
	}),
}));

import CalendarScreen from "../../../src/screens/CalendarScreen";
import { monthGrid } from "../../../src/screens/CalendarScreen/monthGrid";

describe("CalendarScreen", () => {
	it("month grid is 6 weeks starting on Sunday", () => {
		const g = monthGrid(2026, 10);
		expect(g).toHaveLength(42);
		expect(g[0].date).toBe("2026-09-27"); // Oct 1 2026 is a Thursday
		expect(g.find((c) => c.inMonth)?.date).toBe("2026-10-01");
	});

	it("lists the selected day's episodes and navigates months", () => {
		renderWithProviders(<CalendarScreen />, { user: testUser });
		expect(screen.getByText("October 2026")).toBeInTheDocument();
		expect(screen.getByText("Slow Horses")).toBeInTheDocument();
		expect(screen.getByText("SEASON 05")).toBeInTheDocument();
		expect(screen.getByText("E02")).toBeInTheDocument();
		fireEvent.click(screen.getByLabelText("Next month"));
		expect(handleMonthChange).toHaveBeenCalledWith(2026, 11);
		fireEvent.click(screen.getByLabelText("2026-10-15"));
		expect(handleDayPress).toHaveBeenCalledWith("2026-10-15");
	});

	it("desktop counts: distinct shows and movies per day", () => {
		renderWithProviders(<CalendarScreen />, { user: testUser });
		expect(screen.getByLabelText("1 shows")).toHaveTextContent("1");
		expect(screen.getByLabelText("1 movies")).toHaveTextContent("1");
	});

	it("collapses a show's several episodes into one card that opens like an accordion", async () => {
		renderWithProviders(<CalendarScreen />, { user: testUser });
		expect(screen.getAllByText("Reacher")).toHaveLength(1);
		expect(screen.getByText("Season 04")).toBeInTheDocument();
		expect(screen.getByText("2 EPISODES")).toBeInTheDocument();
		expect(screen.queryByText("E08")).not.toBeInTheDocument();
		const card = screen.getByRole("button", { expanded: false });
		fireEvent.click(card);
		expect(card).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText("E08")).toBeInTheDocument();
		expect(screen.getByText("E09")).toBeInTheDocument();
		expect(screen.getByText("Cut")).toBeInTheDocument();
		fireEvent.click(card);
		expect(card).toHaveAttribute("aria-expanded", "false");
		// Strips animate out before they leave the DOM
		await waitFor(() => expect(screen.queryByText("E09")).not.toBeInTheDocument());
	});

	it("tapping an episode opens its info card without watch buttons", async () => {
		renderWithProviders(<CalendarScreen />, { user: testUser });
		fireEvent.click(screen.getByText("Slow Horses"));
		// Card title + the modal's episode title
		expect(await screen.findAllByText("Two")).toHaveLength(2);
		expect(screen.getByText("S05 | E02")).toBeInTheDocument();
		expect(screen.queryByText(/Mark as Watched/)).not.toBeInTheDocument();
	});
});
