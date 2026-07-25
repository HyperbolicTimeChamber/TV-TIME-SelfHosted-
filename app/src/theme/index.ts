export const colors = {
	background: "#0D0D0D",
	surface: "#1A1A1A",
	surfaceLight: "#252525",
	primary: "#E50914",
	accent: "#4A90D9",
	text: "#FFFFFF",
	textSecondary: "#A0A0A0",
	textMuted: "#666666",
	watchedGreen: "#2ECC71",
	stopBlue: "#3498DB",
	destructiveRed: "#E74C3C",
	border: "#333333",
	moviePurple: "#8B5CF6",
	warningAmber: "#F59E0B",
	spinnerWhite: "#FFFFFF",
	spinnerOrange: "#FF3D00",
	overlay: "rgba(0, 0, 0, 0.85)",
	overlayLight: "rgba(0, 0, 0, 0.6)",
	overlayMedium: "rgba(0, 0, 0, 0.7)",
	badgeOverlay: "rgba(0, 0, 0, 0.5)",
} as const;

export const spacing = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 24,
	xxl: 32,
} as const;

export const typography = {
	title: { fontSize: 22, fontWeight: "700" as const, color: colors.text },
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
