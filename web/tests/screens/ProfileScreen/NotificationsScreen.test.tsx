import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import NotificationsScreen from "../../../src/screens/ProfileScreen/NotificationsScreen";
import { renderWithProviders, testUser } from "../../render";

describe("web NotificationsScreen", () => {
	it("says notifications are an Android app feature and has no switches", () => {
		renderWithProviders(<NotificationsScreen />, { user: testUser });
		expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
		expect(screen.getByText("Notifications are available in the Android app")).toBeInTheDocument();
		expect(screen.queryByRole("switch")).not.toBeInTheDocument();
	});
});
