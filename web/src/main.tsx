import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./firebase";
import { initAppCheck } from "./appCheck";
import "./theme/tailwind.css";
import "./theme/global.scss";
import App from "./App";

initAppCheck();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
