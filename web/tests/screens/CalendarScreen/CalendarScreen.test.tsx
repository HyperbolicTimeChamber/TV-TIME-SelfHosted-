import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
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
			{ tmdbShowId: 1, showTitle: "Reacher", posterPath: null, season: 4, episode: 8, episodeTitle: "Cut", airDate: "2026-10-09", runtime: null },
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
		expect(screen.getByText("Reacher")).toBeInTheDocument();
		expect(screen.getByText("SEASON 04")).toBeInTheDocument();
		expect(screen.getByText("E08")).toBeInTheDocument();
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
});
