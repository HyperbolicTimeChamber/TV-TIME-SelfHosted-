export const colors = {
	background: "#000000",
	surface: "#1A1A1A",
	surfaceLight: "#252525",
	primary: "#E50914",
	accent: "#4A90D9",
	text: "#FFFFFF",
	textSecondary: "#A0A0A0",
	textMuted: "#666666",
	watchedGreen: "#00A800",
	stopBlue: "#3498DB",
	destructiveRed: "#E74C3C",
	border: "#333333",
	moviePurple: "#8B5CF6",
	warningAmber: "#F59E0B",
	/** warningAmber at 50% — a faded fill that leaves the text on it untouched (opacity would not) */
	warningAmberFaded: "rgba(245, 158, 11, 0.5)",
	spinnerWhite: "#FFFFFF",
	spinnerOrange: "#FF3D00",
	overlay: "rgba(0, 0, 0, 0.85)",
	overlayLight: "rgba(0, 0, 0, 0.6)",
	overlayMedium: "rgba(0, 0, 0, 0.7)",
	badgeOverlay: "rgba(0, 0, 0, 0.5)",
} as const;

/** Custom font families (loaded in App via useFonts). Android: never pair with fontWeight. */
export const fonts = {
	/** Smooch Sans — calendar episode square */
	smoochRegular: "SmoochSans_400Regular",
	smoochMedium: "SmoochSans_500Medium",
	/** Handjet — pixel-style display (watchlist welcome title) */
	handjetExtraBold: "Handjet_800ExtraBold",
} as const;

/** `#RRGGBB` + alpha → rgba(), for translucent fills and glow shadows */
export const tint = (hex: string, alpha: number) =>
	`rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

export const spacing = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 24,
	xxl: 32,
} as const;

export const typography = {
	title: { fontSize: 22, fontWeight: "600" as const, color: colors.text },
	subtitle: { fontSize: 16, fontWeight: "600" as const, color: colors.text },
	body: { fontSize: 14, fontWeight: "400" as const, color: colors.text },
	caption: {
		fontSize: 12,
		fontWeight: "400" as const,
		color: colors.textSecondary,
	},
} as const;

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
