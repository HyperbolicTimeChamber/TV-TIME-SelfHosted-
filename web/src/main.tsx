import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./firebase";
import { initAppCheck } from "./appCheck";
import { connectEmulators } from "./emulators";
import { AppOpenSource } from "@app/enums";
import { initMixpanel, trackAppOpened, flushAnalytics } from "@app/services/mixpanel";
import { Paths } from "./routes/paths";
// Poppins, self-hosted (latin subset, the weights the UI uses)
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/smooch-sans/latin-400.css";
import "@fontsource/smooch-sans/latin-500.css";
import "@fontsource/handjet/latin-800.css";
import "./theme/tailwind.css";
import "./theme/global.scss";
import App from "./App";

initAppCheck();
connectEmulators();

initMixpanel();
// A share link (/show/...) arriving from outside the site counts as a deep link
const fromShareLink =
	location.pathname.startsWith(Paths.SHOW.split(":")[0]) &&
	!document.referrer.startsWith(location.origin);
trackAppOpened(
	fromShareLink ? AppOpenSource.DEEP_LINK : AppOpenSource.ORGANIC,
	process.env.EXPO_PUBLIC_APP_VERSION ?? "",
);
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "hidden") flushAnalytics();
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
