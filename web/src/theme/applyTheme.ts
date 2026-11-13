import { useSyncExternalStore } from "react";
import { applyThemePrefs, buildPalette, parseThemePrefs, resolveScheme, ThemeMode } from "@app/theme";
import type { ThemePrefs } from "@app/theme";

const STORAGE_KEY = "theme_prefs_v1";

/** palette key → CSS custom properties (global.scss :root defaults, Tailwind's @theme names) */
const CSS_VARS: Record<string, string[]> = {
	background: ["--bg", "--color-page"],
	surface: ["--surface", "--color-surface"],
	surfaceLight: ["--surface-light", "--color-surface-light"],
	cardDark: ["--card-dark"],
	primary: ["--primary", "--color-primary"],
	primaryDark: ["--primary-dark", "--color-primary-dark"],
	accent: ["--accent", "--color-accent"],
	text: ["--text", "--color-fg"],
	textSecondary: ["--text-secondary", "--color-fg-secondary"],
	textMuted: ["--text-muted", "--color-fg-muted"],
	border: ["--border", "--color-line"],
	watchedGreen: ["--watched-green", "--color-watched"],
	stopBlue: ["--stop-blue", "--color-stop"],
	destructiveRed: ["--destructive-red", "--color-danger"],
	moviePurple: ["--movie-purple", "--color-movie"],
	warningAmber: ["--warning-amber", "--color-warning"],
	onPrimary: ["--on-primary"],
	onAmber: ["--on-amber"],
	onImage: ["--on-image"],
	onImageSecondary: ["--on-image-secondary"],
	spinnerWhite: ["--color-spinner-white"],
	skeletonCard: ["--skeleton-card"],
};

const systemQuery = () =>
	typeof window !== "undefined" && window.matchMedia
		? window.matchMedia("(prefers-color-scheme: light)")
		: null;

const systemScheme = (): "light" | "dark" => (systemQuery()?.matches ? "light" : "dark");

function readPrefs(): ThemePrefs {
	try {
		return parseThemePrefs(localStorage.getItem(STORAGE_KEY));
	} catch {
		return parseThemePrefs(null);
	}
}

let prefs: ThemePrefs = readPrefs();
let version = 0;
const listeners = new Set<() => void>();

/** Palette → the page: CSS variables (everything styled with them follows at once) + the shared `colors` */
function apply() {
	const scheme = systemScheme();
	applyThemePrefs(prefs, scheme);
	const palette = buildPalette(prefs, scheme);
	const root = document.documentElement.style;
	for (const [key, names] of Object.entries(CSS_VARS)) {
		const value = palette[key as keyof typeof palette];
		if (value) for (const name of names) root.setProperty(name, value);
	}
	root.setProperty("color-scheme", resolveScheme(prefs.mode, scheme));
	document.documentElement.dataset.theme = resolveScheme(prefs.mode, scheme);
	version += 1;
	listeners.forEach((l) => l());
}

/** Boot: apply the saved theme before the first render, follow the device's scheme while on System */
export function initTheme() {
	apply();
	systemQuery()?.addEventListener("change", () => {
		if (prefs.mode === ThemeMode.SYSTEM) apply();
	});
}

export function setThemePrefs(next: ThemePrefs) {
	prefs = next;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// private mode / blocked storage: applies for this visit only
	}
	apply();
}

const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => listeners.delete(l);
};

/** Current prefs; re-renders the caller when they change */
export function useThemePrefs(): ThemePrefs {
	useSyncExternalStore(subscribe, () => version);
	return prefs;
}

/** Bumps on every change: key a subtree on it to re-read `colors` in inline styles */
export function useThemeVersion(): number {
	return useSyncExternalStore(subscribe, () => version);
}

export const isLightScheme = (): boolean =>
	resolveScheme(prefs.mode, systemScheme()) === ThemeMode.LIGHT;
