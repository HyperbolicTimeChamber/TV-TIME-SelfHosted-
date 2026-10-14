import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import auth, { initialAuthState } from "../../src/store/authSlice";
import ui from "../../src/store/uiSlice";
import RequireAuth from "../../src/routes/RequireAuth";

function LoginProbe() {
	const { search } = useLocation();
	return <div>login{search}</div>;
}

const renderAt = (path: string, user: boolean) => {
	const store = configureStore({
		reducer: { auth, ui },
		preloadedState: {
			auth: {
				...initialAuthState,
				loading: false,
				user: user
					? { uid: "u", email: null, displayName: null, photoURL: null, providerData: [] }
					: null,
			},
		},
	});
	render(
		<Provider store={store}>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/login" element={<LoginProbe />} />
					<Route element={<RequireAuth />}>
						<Route path="/home" element={<div>watchlist</div>} />
					</Route>
				</Routes>
			</MemoryRouter>
		</Provider>,
	);
};

describe("RequireAuth", () => {
	it("sends guests to login with a return path", () => {
		renderAt("/home", false);
		expect(screen.getByText("login?next=%2Fhome")).toBeInTheDocument();
	});

	it("lets signed-in users through", () => {
		renderAt("/home", true);
		expect(screen.getByText("watchlist")).toBeInTheDocument();
	});
});
