import { App as AntApp, ConfigProvider } from "antd";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import ScrollToTop from "./routes/ScrollToTop";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { store } from "./store";
import { queryClient, persistOptions } from "./queryClient";
import { antdThemeConfig } from "./theme/index";
import AuthListener from "./AuthListener";
import OfflineBanner from "./components/OfflineBanner";
import AppRoutes from "./routes/AppRoutes";

export default function App() {
	return (
		<Provider store={store}>
			<PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
				<ConfigProvider theme={antdThemeConfig}>
					<AntApp>
						<BrowserRouter>
							<ScrollToTop />
							<AuthListener />
							<OfflineBanner />
							<AppRoutes />
						</BrowserRouter>
					</AntApp>
				</ConfigProvider>
			</PersistQueryClientProvider>
		</Provider>
	);
}
