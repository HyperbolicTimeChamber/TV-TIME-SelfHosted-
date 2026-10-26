// Minimal react-native surface used by shared app logic
import { notify } from "./notify";

export const PixelRatio = {
	get: () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1),
};

export const Platform = {
	OS: "web" as string,
	select: <T>(o: { web?: T; default?: T }) => o.web ?? o.default,
};

export const Alert = {
	alert: (title: string, message?: string) => notify(title, message),
};

/** Reduce-motion, read from the CSS media query the browser already exposes */
export const AccessibilityInfo = {
	isReduceMotionEnabled: async (): Promise<boolean> =>
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};
