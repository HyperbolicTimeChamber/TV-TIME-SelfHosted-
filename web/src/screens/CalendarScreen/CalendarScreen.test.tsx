import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, testUser } from "../../test/render";

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
		handleDayPress,
		handleMonthChange,
		selectYear: vi.fn(),
		monthLabel: "October 2026",
	}),
}));

import CalendarScreen, { monthGrid } from ".";

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
		expect(screen.getByText("S04E08")).toBeInTheDocument();
		fireEvent.click(screen.getByLabelText("Next month"));
		expect(handleMonthChange).toHaveBeenCalledWith(2026, 11);
		fireEvent.click(screen.getByLabelText("2026-10-15"));
		expect(handleDayPress).toHaveBeenCalledWith("2026-10-15");
	});
});
