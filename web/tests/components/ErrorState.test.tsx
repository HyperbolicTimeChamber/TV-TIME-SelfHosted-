import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describeLoadError } from "@app/utils/loadError";
import { MediaType } from "@app/enums";
import { renderWithProviders, testUser } from "../render";
import ErrorState from "../../src/components/ErrorState";
import NotFoundScreen from "../../src/screens/NotFoundScreen";
import AppShell from "../../src/layout/AppShell";

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
		expect(screen.getByRole("heading", { name: "You might be lost" })).toBeInTheDocument();
		expect(screen.queryByText("Error 404")).not.toBeInTheDocument();
		expect(document.querySelector('img[src="/not-found.webp"]')).toBeInTheDocument();
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
		expect(screen.getByText("Error NETWORK")).toBeInTheDocument();
		expect(document.querySelector('img[src="/not-found.webp"]')).not.toBeInTheDocument();
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
	it("not-found hides the tab bar; it comes back on other pages", () => {
		const view = renderWithProviders(
			<Routes>
				<Route element={<AppShell />}>
					<Route path="/home" element={<p>Watchlist page</p>} />
					<Route path="*" element={<NotFoundScreen />} />
				</Route>
			</Routes>,
			{ user: testUser, path: "/nope" },
		);
		expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByText("Go to Watchlist"));
		expect(screen.getByText("Watchlist page")).toBeInTheDocument();
		expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
		view.unmount();
	});
});

describe("LoadingSpinner", () => {
	it("renders the app's spotted ball (4 spots) with a progress role", async () => {
		const { default: LoadingSpinner } = await import("../../src/components/LoadingSpinner");
		const { container } = renderWithProviders(<LoadingSpinner />);
		expect(screen.getByRole("progressbar", { name: "Loading" })).toBeInTheDocument();
		expect(container.querySelectorAll("span")).toHaveLength(4);
	});

});
