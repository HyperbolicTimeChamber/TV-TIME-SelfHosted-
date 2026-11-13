import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey } from "../enums";
import { applyThemePrefs } from "./index";
import { DEFAULT_THEME_PREFS, ThemeMode, parseThemePrefs } from "./palette";
import type { ThemePrefs } from "./palette";

/** What this session was started with (the palette in `colors` matches it) */
let activePrefs: ThemePrefs = { ...DEFAULT_THEME_PREFS };

export const getActiveThemePrefs = (): ThemePrefs => activePrefs;

let watching = false;

/** While on System, a change of the device scheme (night mode) re-themes the app */
function watchDeviceScheme() {
	if (watching) return;
	watching = true;
	Appearance.addChangeListener(() => {
		if (activePrefs.mode === ThemeMode.SYSTEM) applyThemePrefs(activePrefs, deviceScheme());
	});
}

/** Startup: read the saved choice and apply it, before any styled module is imported */
export async function loadThemePrefs(): Promise<ThemePrefs> {
	const raw = await AsyncStorage.getItem(CacheKey.THEME_PREFS).catch(() => null);
	activePrefs = parseThemePrefs(raw);
	applyThemePrefs(activePrefs, deviceScheme());
	watchDeviceScheme();
	return activePrefs;
}

const deviceScheme = (): "light" | "dark" => (Appearance.getColorScheme() === "light" ? "light" : "dark");

/** New theme / accent: saved, applied to the palette now; the app remounts its tree on the version bump */
export async function setThemePrefs(prefs: ThemePrefs): Promise<void> {
	activePrefs = prefs;
	applyThemePrefs(prefs, deviceScheme());
	await AsyncStorage.setItem(CacheKey.THEME_PREFS, JSON.stringify(prefs)).catch(() => {});
}
