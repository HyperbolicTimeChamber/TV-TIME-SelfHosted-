import { DEFAULT_THEME_PREFS, ThemeMode, buildPalette, resolveScheme, tint as tintHex } from "./palette";
import type { ColorPalette, ThemePrefs } from "./palette";
import { bumpThemeVersion } from "./themeStore";

export * from "./palette";
export { themedStyles } from "./themedStyles";
export { getThemeVersion, useThemeVersion } from "./themeStore";

/**
 * Live palette. Styles built at module load (StyleSheet.create) copy these values, so the theme is
 * applied once at startup (applyThemePrefs, before the app's modules load) and changing it means
 * restarting the app (see the theme store / reloadAppAsync).
 */
export const colors: ColorPalette = buildPalette(DEFAULT_THEME_PREFS);

let lightTheme = false;

/** Light palette in use (status bar icons, navigation theme) */
export const isLightTheme = (): boolean => lightTheme;

/** Swap the palette in place — call before any styled module is imported */
export function applyThemePrefs(prefs: ThemePrefs, system?: "light" | "dark" | null): void {
	Object.assign(colors, buildPalette(prefs, system));
	lightTheme = resolveScheme(prefs.mode, system) === ThemeMode.LIGHT;
	bumpThemeVersion();
}

/** Custom font families (loaded in App via useFonts). Android: never pair with fontWeight. */
export const fonts = {
	/** Smooch Sans — calendar episode square */
	smoochRegular: "SmoochSans_400Regular",
	smoochMedium: "SmoochSans_500Medium",
	/** Handjet — pixel-style display (watchlist welcome title) */
	handjetExtraBold: "Handjet_800ExtraBold",
	/** VT323 — terminal pixel font (update drawer release notes) */
	vt323: "VT323_400Regular",
} as const;

/** `#RRGGBB` + alpha → rgba(), for translucent fills and glow shadows */
export const tint = tintHex;

export const spacing = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 24,
	xxl: 32,
} as const;

/** Colors are getters: spreading one into a style reads the live palette at that moment */
export const typography = {
	title: {
		fontSize: 22,
		fontWeight: "600" as const,
		get color() {
			return colors.text;
		},
	},
	subtitle: {
		fontSize: 16,
		fontWeight: "600" as const,
		get color() {
			return colors.text;
		},
	},
	body: {
		fontSize: 14,
		fontWeight: "400" as const,
		get color() {
			return colors.text;
		},
	},
	caption: {
		fontSize: 12,
		fontWeight: "400" as const,
		get color() {
			return colors.textSecondary;
		},
	},
};

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
export const posterSize = {
	small: `${TMDB_IMAGE_BASE}/w185`,
	medium: `${TMDB_IMAGE_BASE}/w342`,
	large: `${TMDB_IMAGE_BASE}/w500`,
} as const;

export const backdropSize = {
	small: `${TMDB_IMAGE_BASE}/w300`,
	medium: `${TMDB_IMAGE_BASE}/w780`,
} as const;

/** Loading spinner ball (white with orange spots + hat) — shared by app and web */
export const spinnerShape = {
	size: 48,
	dots: [
		{ r: 12, cx: 22, cy: 22 },
		{ r: 10, cx: 6, cy: 40 },
		{ r: 14, cx: 31, cy: -6 },
		{ r: 5, cx: 40, cy: 30 },
	],
	/** Ball spin period (ms) */
	spinMs: 1000,
	/** Tilt keyframes: [time ms, degrees] — rocks between -10° and 5° */
	tilt: [
		[0, -10],
		[900, 5],
		[1500, -5.5],
		[2100, 5],
		[3000, -10],
	] as const,
} as const;
