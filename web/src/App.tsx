import { App as AntApp, ConfigProvider } from "antd";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import ScrollToTop from "./routes/ScrollToTop";
import PageViewTracker from "./routes/PageViewTracker";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { store } from "./store";
import { queryClient, persistOptions } from "./queryClient";
import { antdThemeConfig } from "./theme/index";
import AuthListener from "./AuthListener";
import NoInternetModal from "./components/NoInternetModal";
import AppRoutes from "./routes/AppRoutes";

export default function App() {
	return (
		<Provider store={store}>
			<PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
				<ConfigProvider theme={antdThemeConfig}>
					<AntApp>
						<BrowserRouter>
							<ScrollToTop />
							<PageViewTracker />
							<AuthListener />
							<NoInternetModal />
							<AppRoutes />
						</BrowserRouter>
					</AntApp>
				</ConfigProvider>
			</PersistQueryClientProvider>
		</Provider>
	);
}
