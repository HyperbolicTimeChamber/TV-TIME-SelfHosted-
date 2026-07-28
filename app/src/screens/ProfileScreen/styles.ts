import { StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../theme";

export const BLUR_RADIUS = 0.5;

export const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	profileSection: {
		marginHorizontal: spacing.lg,
		paddingTop: spacing.xl,
	},
	header: {
		alignItems: "center",
		marginTop: -65,
		zIndex: 4,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		alignSelf: "center",
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.xs,
		borderRadius: 16,
		overflow: "hidden",
	},
	avatarOverlay: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		justifyContent: "center",
		alignItems: "center",
		zIndex: 3,
		pointerEvents: "none",
	},
	avatar: {
		width: 100,
		height: 100,
		borderRadius: 50,
		borderWidth: 3,
		borderColor: colors.background,
	},
	avatarPlaceholder: {
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		alignItems: "center",
	},
	avatarText: {
		...typography.title,
		fontSize: 32,
	},
	name: {
		...typography.title,
	},
	email: {
		...typography.caption,
		marginTop: 2,
	},
	statsGrid: {
		gap: spacing.sm,
	},
	statsRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	statCard: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: spacing.lg,
		minHeight: 110,
		overflow: "hidden",
	},
	statCardOverlay: {
		backgroundColor: "rgba(0, 0, 0, 0.55)",
	},
	statNumber: {
		...typography.title,
		fontSize: 32,
		marginTop: spacing.xs,
	},
	statLoader: {
		height: 38,
		marginTop: spacing.xs,
	},
	statLabel: {
		...typography.caption,
		color: colors.text,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs / 2,
		borderRadius: 10,
		overflow: "hidden",
	},
	section: {
		marginTop: spacing.xl,
		paddingHorizontal: spacing.lg,
	},
	sectionTitle: {
		...typography.subtitle,
		marginBottom: spacing.md,
	},
	genreSection: {
		marginBottom: spacing.lg,
	},
	genreTitle: {
		...typography.caption,
		color: colors.text,
		marginBottom: spacing.sm,
	},
	completedPoster: {
		width: 80,
		height: 120,
		borderRadius: 6,
	},
	completedLoader: {
		marginTop: spacing.xl,
		alignItems: "center",
	},
	signOutButton: {
		marginTop: spacing.xxl,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.xxl * 2,
		paddingVertical: spacing.lg,
		backgroundColor: colors.surface,
		borderRadius: 8,
		alignItems: "center",
	},
	signOutText: {
		...typography.subtitle,
		color: colors.destructiveRed,
	},
});
