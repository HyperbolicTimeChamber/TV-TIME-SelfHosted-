import { theme as antdTheme, type ThemeConfig } from "antd";
import { colors, spacing, spinnerShape } from "@app/theme";

export { colors, spacing, spinnerShape };

/** antd theme mirroring the mobile app's dark palette */
/** Poppins (self-hosted in main.tsx), system fonts while it loads — keep in sync with $font-family */
export const FONT_FAMILY =
	'"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const antdThemeConfig: ThemeConfig = {
	algorithm: antdTheme.darkAlgorithm,
	token: {
		colorPrimary: colors.primary,
		colorBgBase: colors.background,
		colorBgContainer: colors.surface,
		colorBgElevated: colors.surface,
		colorBorder: colors.border,
		colorText: colors.text,
		colorTextSecondary: colors.textSecondary,
		colorError: colors.destructiveRed,
		colorSuccess: colors.watchedGreen,
		colorInfo: colors.accent,
		borderRadius: 12,
		fontFamily: FONT_FAMILY,
	},
	components: {
		// Shimmer in the app palette (surfaceLight → border), as the old CSS pulse used
		Skeleton: { gradientFromColor: colors.surfaceLight, gradientToColor: colors.border },
	},
};
