import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { configureStore } from "@reduxjs/toolkit";
import auth, { initialAuthState, type AuthUser } from "../src/store/authSlice";
import ui from "../src/store/uiSlice";

export const testUser: AuthUser = {
	uid: "u1",
	email: "me@example.com",
	displayName: "Me",
	photoURL: null,
	providerData: [{ providerId: "password" }],
};

/** Render with Redux (optionally signed in), router, React Query and antd App */
export function renderWithProviders(ui_: ReactElement, opts: { user?: AuthUser | null; path?: string } = {}) {
	const store = configureStore({
		reducer: { auth, ui },
		preloadedState: { auth: { ...initialAuthState, loading: false, user: opts.user ?? null } },
	});
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<Provider store={store}>
			<QueryClientProvider client={client}>
				<AntApp>
					<MemoryRouter initialEntries={[opts.path ?? "/"]}>{ui_}</MemoryRouter>
				</AntApp>
			</QueryClientProvider>
		</Provider>,
	);
}
