import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./firebase";
import { initAppCheck } from "./appCheck";
// Poppins, self-hosted (latin subset, the weights the UI uses)
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/smooch-sans/latin-400.css";
import "@fontsource/smooch-sans/latin-500.css";
import "./theme/tailwind.css";
import "./theme/global.scss";
import App from "./App";

initAppCheck();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
