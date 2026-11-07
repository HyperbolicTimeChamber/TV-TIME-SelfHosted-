/** Theme palettes + accent options. Pure (no React Native imports): the web app uses it too. */

export enum ThemeMode {
	DARK = "dark",
	LIGHT = "light",
	SYSTEM = "system",
}

export enum AccentId {
	/** Today's look: red brand color, blue links */
	CLASSIC = "classic",
	RED = "red",
	BLUE = "blue",
	GREEN = "green",
	PURPLE = "purple",
	ORANGE = "orange",
	PINK = "pink",
}

export interface ThemePrefs {
	mode: ThemeMode;
	accent: AccentId;
}

export const DEFAULT_THEME_PREFS: ThemePrefs = { mode: ThemeMode.DARK, accent: AccentId.CLASSIC };

/** `primary` = brand color (buttons, active tab), `accent` = links / selection. Classic keeps both as before */
export const ACCENT_OPTIONS: {
	id: AccentId;
	label: string;
	primary: `#${string}`;
	accent: `#${string}`;
}[] = [
	{ id: AccentId.CLASSIC, label: "Classic", primary: "#E50914", accent: "#4A90D9" },
	{ id: AccentId.RED, label: "Red", primary: "#E50914", accent: "#E50914" },
	{ id: AccentId.BLUE, label: "Blue", primary: "#2F7FD8", accent: "#2F7FD8" },
	{ id: AccentId.GREEN, label: "Green", primary: "#1E9E4A", accent: "#1E9E4A" },
	{ id: AccentId.PURPLE, label: "Purple", primary: "#8B5CF6", accent: "#8B5CF6" },
	{ id: AccentId.ORANGE, label: "Orange", primary: "#F57C00", accent: "#F57C00" },
	{ id: AccentId.PINK, label: "Pink", primary: "#EC4899", accent: "#EC4899" },
];

export const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
	{ mode: ThemeMode.DARK, label: "Dark" },
	{ mode: ThemeMode.LIGHT, label: "Light" },
	{ mode: ThemeMode.SYSTEM, label: "System" },
];

const DARK = {
	background: "#000000",
	surface: "#1A1A1A",
	surfaceLight: "#252525",
	text: "#FFFFFF",
	textSecondary: "#A0A0A0",
	textMuted: "#666666",
	/** Unwatched checkmark tick on the white circle */
	checkTick: "#A0A0A0",
	border: "#333333",
	watchedGreen: "#00A800",
	stopBlue: "#3498DB",
	destructiveRed: "#E74C3C",
	moviePurple: "#8B5CF6",
	warningAmber: "#F59E0B",
	warningAmberFaded: "rgba(245, 158, 11, 0.5)",
	spinnerWhite: "#FFFFFF",
	spinnerOrange: "#FF3D00",
	overlay: "rgba(0, 0, 0, 0.85)",
	overlayLight: "rgba(0, 0, 0, 0.6)",
	overlayMedium: "rgba(0, 0, 0, 0.7)",
	badgeOverlay: "rgba(0, 0, 0, 0.5)",
	/** Cards that carry a photo collage (profile stats): dark in every theme, text on them is onImage */
	cardDark: "#1A1A1A",
	/** Text on photos / dark scrims: stays white in every theme */
	onImage: "#FFFFFF",
	onImageSecondary: "rgba(255, 255, 255, 0.75)",
	/** Text on a primary/accent fill */
	onPrimary: "#FFFFFF",
} as const;

const LIGHT = {
	background: "#F4F4F7",
	surface: "#FFFFFF",
	surfaceLight: "#E8E8EE",
	text: "#111114",
	textSecondary: "#55555F",
	textMuted: "#8A8A96",
	/** Unwatched checkmark tick on the white circle */
	checkTick: "#A0A0A0",
	border: "#D9D9E0",
	watchedGreen: "#0A9A2E",
	stopBlue: "#2A7FC0",
	destructiveRed: "#D9382B",
	moviePurple: "#7C4DE8",
	warningAmber: "#D98200",
	warningAmberFaded: "rgba(217, 130, 0, 0.45)",
	spinnerWhite: "#111114",
	spinnerOrange: "#FF3D00",
	overlay: "rgba(0, 0, 0, 0.6)",
	overlayLight: "rgba(0, 0, 0, 0.6)",
	overlayMedium: "rgba(0, 0, 0, 0.7)",
	badgeOverlay: "rgba(0, 0, 0, 0.5)",
	onImage: "#FFFFFF",
	onImageSecondary: "rgba(255, 255, 255, 0.75)",
	onPrimary: "#FFFFFF",
	cardDark: "#26262B",
} as const satisfies Record<keyof typeof DARK, string>;

export type ColorKey = keyof typeof DARK | "primary" | "primaryDark" | "accent";
type RgbaKey =
	| "warningAmberFaded"
	| "overlay"
	| "overlayLight"
	| "overlayMedium"
	| "badgeOverlay"
	| "onImageSecondary";
/** Solid colors are `#RRGGBB` (some components take that template type); scrims are rgba() */
export type ColorPalette = Record<Exclude<ColorKey, RgbaKey>, `#${string}`> & Record<RgbaKey, string>;

/** `#RRGGBB` + alpha → rgba(), for translucent fills and glow shadows */
export const tint = (hex: string, alpha: number) =>
	`rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

/** Blend two `#RRGGBB` colors: t = 0 → a, t = 1 → b */
export function mixHex(a: string, b: string, t: number): `#${string}` {
	const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
	const part = (i: number) =>
		Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)
			.toString(16)
			.padStart(2, "0");
	return `#${part(0)}${part(1)}${part(2)}`.toUpperCase() as `#${string}`;
}

/** Light or dark for this mode; `system` follows the device's scheme (null → dark) */
export function resolveScheme(mode: ThemeMode, system: "light" | "dark" | null | undefined) {
	if (mode === ThemeMode.SYSTEM) return system === "light" ? ThemeMode.LIGHT : ThemeMode.DARK;
	return mode === ThemeMode.LIGHT ? ThemeMode.LIGHT : ThemeMode.DARK;
}

/** Full palette for a theme + accent choice */
export function buildPalette(prefs: ThemePrefs, system?: "light" | "dark" | null): ColorPalette {
	const scheme = resolveScheme(prefs.mode, system);
	const base = scheme === ThemeMode.LIGHT ? LIGHT : DARK;
	const option = ACCENT_OPTIONS.find((o) => o.id === prefs.accent) ?? ACCENT_OPTIONS[0];
	return {
		...base,
		primary: option.primary,
		accent: option.accent,
		// Selected-row fill: the brand color pulled toward the page (white text / dark text stays readable)
		primaryDark:
			scheme === ThemeMode.LIGHT
				? mixHex(option.primary, "#FFFFFF", 0.82)
				: mixHex(option.primary, "#000000", 0.75),
	};
}

export function isThemeMode(value: unknown): value is ThemeMode {
	return Object.values(ThemeMode).includes(value as ThemeMode);
}

export function isAccentId(value: unknown): value is AccentId {
	return Object.values(AccentId).includes(value as AccentId);
}

/** Stored prefs (JSON string) → valid prefs; anything odd falls back to the defaults */
export function parseThemePrefs(raw: string | null | undefined): ThemePrefs {
	try {
		const data = raw ? JSON.parse(raw) : null;
		return {
			mode: isThemeMode(data?.mode) ? data.mode : DEFAULT_THEME_PREFS.mode,
			accent: isAccentId(data?.accent) ? data.accent : DEFAULT_THEME_PREFS.accent,
		};
	} catch {
		return { ...DEFAULT_THEME_PREFS };
	}
}
