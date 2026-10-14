import { useSyncExternalStore } from "react";

/** Tablet / desktop breakpoints — same as $bp-tablet / $bp-desktop in theme/_tokens.scss */
const TABLET = "(min-width: 600px)";
const DESKTOP = "(min-width: 900px)";

const subscribe = (onChange: () => void) => {
	const queries = [TABLET, DESKTOP].map((q) => window.matchMedia(q));
	queries.forEach((q) => q.addEventListener("change", onChange));
	return () => queries.forEach((q) => q.removeEventListener("change", onChange));
};

const snapshot = () => (window.matchMedia(DESKTOP).matches ? 3 : window.matchMedia(TABLET).matches ? 2 : 1);

/** 1 / 2 / 3 columns by viewport width, re-rendering only when the count changes */
export function useColumnCount(): number {
	return useSyncExternalStore(subscribe, snapshot, () => 1);
}
