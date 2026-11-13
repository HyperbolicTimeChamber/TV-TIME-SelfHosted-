import { App as AntApp, ConfigProvider } from "antd";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import ScrollToTop from "./routes/ScrollToTop";
import PageViewTracker from "./routes/PageViewTracker";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { store } from "./store";
import { queryClient, persistOptions } from "./queryClient";
import { getAntdThemeConfig } from "./theme/index";
import { isLightScheme, useThemeVersion } from "./theme/applyTheme";
import AuthListener from "./AuthListener";
import NoInternetModal from "./components/NoInternetModal";
import AppRoutes from "./routes/AppRoutes";

export default function App() {
	const themeVersion = useThemeVersion();
	return (
		<Provider store={store}>
			<PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
				<ConfigProvider theme={getAntdThemeConfig(isLightScheme())}>
					<AntApp>
						<BrowserRouter>
							<ScrollToTop />
							<PageViewTracker />
							<AuthListener />
							<NoInternetModal />
							{/* Keyed on the theme: inline colors read the new palette */}
							<AppRoutes key={themeVersion} />
						</BrowserRouter>
					</AntApp>
				</ConfigProvider>
			</PersistQueryClientProvider>
		</Provider>
	);
}
