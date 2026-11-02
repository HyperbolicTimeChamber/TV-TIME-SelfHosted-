import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey } from "../enums";
import { applyThemePrefs } from "./index";
import { DEFAULT_THEME_PREFS, parseThemePrefs } from "./palette";
import type { ThemePrefs } from "./palette";

/** What this session was started with (the palette in `colors` matches it) */
let activePrefs: ThemePrefs = { ...DEFAULT_THEME_PREFS };

export const getActiveThemePrefs = (): ThemePrefs => activePrefs;

/** Startup: read the saved choice and apply it, before any styled module is imported */
export async function loadThemePrefs(): Promise<ThemePrefs> {
	const raw = await AsyncStorage.getItem(CacheKey.THEME_PREFS).catch(() => null);
	activePrefs = parseThemePrefs(raw);
	applyThemePrefs(activePrefs, Appearance.getColorScheme() === "light" ? "light" : "dark");
	return activePrefs;
}

/** Saved for the next start; the running session keeps its palette until the app restarts */
export async function saveThemePrefs(prefs: ThemePrefs): Promise<void> {
	await AsyncStorage.setItem(CacheKey.THEME_PREFS, JSON.stringify(prefs));
}
