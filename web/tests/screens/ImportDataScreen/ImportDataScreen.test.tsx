import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, testUser } from "../../render";

let state: Record<string, unknown> = {};
const processFile = vi.fn();
const toggleSelected = vi.fn();
vi.mock("@app/screens/ImportDataScreen/useImportData", () => ({ useImportData: () => state }));

import ImportDataScreen from "../../../src/screens/ImportDataScreen";

const lost = { tmdbId: 1, mediaType: "tv", tmdbName: "Lost", tvTimeName: "Lost", tvTimeId: 9, year: "2004", posterPath: null };
const base = {
	progress: { done: 0, total: 0 },
	matched: [],
	ambiguous: [],
	unmatchedNames: [],
	selected: new Set<string>(),
	existingIdsRef: { current: new Set<number>() },
	parsedRef: { current: null },
	processFile,
	toggleSelected,
};

describe("ImportDataScreen", () => {
	it("pick phase hands the chosen zip to the shared flow as a blob URL", () => {
		state = { ...base, phase: "pick" };
		globalThis.URL.createObjectURL = vi.fn(() => "blob:zip");
		const { container } = renderWithProviders(<ImportDataScreen />, { user: testUser });
		expect(screen.getByText("Import TV Time Data")).toBeInTheDocument();
		const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
		fireEvent.change(input, { target: { files: [new File(["x"], "export.zip", { type: "application/zip" })] } });
		expect(processFile).toHaveBeenCalledWith("blob:zip");
	});

	it("review phase lists matches and counts selected episodes", () => {
		state = {
			...base,
			phase: "review",
			matched: [lost],
			selected: new Set(["tv-1"]),
			existingIdsRef: { current: new Set([1]) },
			unmatchedNames: ["Mystery Show"],
			parsedRef: { current: { watchedEpisodes: [{ tvTimeShowId: 9 }, { tvTimeShowId: 9 }, { tvTimeShowId: 3 }] } },
		};
		renderWithProviders(<ImportDataScreen />, { user: testUser });
		expect(screen.getByText("Review Import (1 selected)")).toBeInTheDocument();
		expect(screen.getByText("Already in watchlist")).toBeInTheDocument();
		expect(screen.getByText("Unmatched (1)")).toBeInTheDocument();
		expect(screen.getByText("Import 1 shows, 0 movies, 2 episodes")).toBeInTheDocument();
		fireEvent.click(screen.getByText("Lost"));
		expect(toggleSelected).toHaveBeenCalledWith("tv-1");
	});
});
