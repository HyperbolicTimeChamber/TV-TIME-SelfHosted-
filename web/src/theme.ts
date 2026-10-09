import { theme as antdTheme, type ThemeConfig } from "antd";
import { colors, spacing } from "@app/theme";

export { colors, spacing };

/** antd theme mirroring the mobile app's dark palette */
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
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
	},
};
