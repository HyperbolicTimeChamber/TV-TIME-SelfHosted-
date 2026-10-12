import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describeLoadError } from "@app/utils/loadError";
import { MediaType } from "@app/enums";
import { renderWithProviders, testUser } from "../test/render";
import ErrorState from "./ErrorState";
import NotFoundScreen from "../screens/NotFoundScreen";

describe("ErrorState", () => {
	it("not-found: no retry, offers search + watchlist, shows code", () => {
		const search = vi.fn();
		renderWithProviders(
			<ErrorState
				info={describeLoadError({ response: { status: 404 } }, MediaType.TV)}
				mediaType={MediaType.TV}
				primary={{ label: "Search Shows & Movies", onPress: search }}
				secondary={{ label: "Go to Watchlist", onPress: vi.fn() }}
			/>,
		);
		expect(screen.getByRole("heading", { name: "We couldn't find this show" })).toBeInTheDocument();
		expect(screen.getByText("Error 404")).toBeInTheDocument();
		expect(document.querySelector('img[src="/not-found.png"]')).toBeInTheDocument();
		fireEvent.click(screen.getByText("Search Shows & Movies"));
		expect(search).toHaveBeenCalled();
	});

	it("offline copy", () => {
		renderWithProviders(
			<ErrorState
				info={describeLoadError({ code: "ERR_NETWORK", message: "Network Error" }, MediaType.MOVIE)}
				primary={{ label: "Try Again", onPress: vi.fn() }}
			/>,
		);
		expect(screen.getByRole("heading", { name: "You're offline" })).toBeInTheDocument();
		expect(document.querySelector('img[src="/not-found.png"]')).not.toBeInTheDocument();
	});

	it("unknown URLs show the 404 page", () => {
		renderWithProviders(
			<Routes>
				<Route path="*" element={<NotFoundScreen />} />
			</Routes>,
			{ user: testUser, path: "/nope" },
		);
		expect(screen.getByRole("heading", { name: "This page doesn't exist" })).toBeInTheDocument();
		expect(screen.getByText("Go to Watchlist")).toBeInTheDocument();
	});
});
