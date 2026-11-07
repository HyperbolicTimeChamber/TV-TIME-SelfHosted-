import { StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../theme";
import { artHeight, NO_RESULTS_RATIO } from "../../components/NotFoundArt";

/** Search bar clear button (IoIosCloseCircle) — results and suggestions pages */
export const CLEAR_ICON_SIZE = 20;

/** Poster card corners: the same 16 as a list card, so the pills and badges sit in matching curves */
const CARD_RADIUS = 16;

/** List view: poster width, and a row's height (poster 2:3 + the row's padding) */
const ROW_POSTER_W = 64;
export const ROW_HEIGHT = Math.round(ROW_POSTER_W * 1.5) + 2 * spacing.sm;

export const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	content: { flex: 1 },
	headerBlock: {
		position: "absolute" as const,
		top: 0,
		left: 0,
		right: 0,
		zIndex: 1,
		// No backdrop: the search card floats over the results (a black strip behind it showed
		// square corners under its rounded ones)
	},
	searchBarRow: {
		flexDirection: "row",
		alignItems: "stretch",
	},
	// Margins live here (not on the card) so the backdrop's 50% bottom lands on the card's middle
	headerCardWrap: {
		marginHorizontal: spacing.md,
		marginTop: spacing.md,
	},
	// Top is set inline to reach the screen top (safe area + the wrap's margin)
	headerBackdrop: {
		position: "absolute" as const,
		left: -spacing.md,
		right: -spacing.md,
		bottom: "50%",
		backgroundColor: colors.background,
	},
	headerCard: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		overflow: "hidden",
		// Lifts the floating island off the posters scrolling under it
		elevation: 8,
		shadowColor: colors.background,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.5,
		shadowRadius: 10,
	},
	// Left inset only — the input's own padding is the gap to the text
	backButton: {
		paddingLeft: spacing.md,
		justifyContent: "center",
	},
	// Same ✕ as the suggestions page's search bar (SearchInputScreen)
	clearButton: {
		paddingHorizontal: spacing.md,
		justifyContent: "center",
	},
	// Grid / List toggle — right end of the search bar (rides along with the collapsing header)
	viewToggle: {
		paddingLeft: spacing.xs,
		paddingRight: spacing.md,
		justifyContent: "center",
	},
	searchIconWrap: {
		width: 44,
		justifyContent: "center",
		alignItems: "center",
	},
	searchRow: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	searchInput: {
		...typography.body,
		flex: 1,
		color: colors.text,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.lg,
	},
	// Inside the grid (already inset by spacing.lg); bottom = title gap + the grid's top gap
	listTitle: {
		...typography.subtitle,
		paddingTop: spacing.md,
		paddingBottom: spacing.sm * 2,
	},
	errorWrap: { flex: 1 },
	center: {
		flex: 1,
		justifyContent: "center" as const,
		alignItems: "center" as const,
	},
	grid: {
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.sm,
	},
	row: {
		gap: spacing.sm,
		paddingHorizontal: spacing.sm,
		marginBottom: spacing.xs,
	},
	card: {
		flex: 1,
		overflow: "hidden" as const,
		borderRadius: CARD_RADIUS,
	},
	// SearchSkeleton: the poster's box, in the skeleton colour (shimmer set inline)
	skeletonPoster: {
		backgroundColor: colors.border,
	},
	poster: {
		aspectRatio: 2 / 3,
		borderRadius: CARD_RADIUS,
		backgroundColor: colors.surface,
		width: "100%",
	},
	banner: {
		position: "absolute" as const,
		bottom: 0,
		left: 0,
		right: 0,
		// Gradient drawn by the card (fades up into the poster). Top room for the fade; side and
		// bottom room so the text clears the rounded corners
		paddingHorizontal: spacing.md,
		paddingTop: spacing.xl,
		paddingBottom: spacing.sm + 2,
	},
	cardTitle: {
		...typography.caption,
		color: colors.text,
		flexShrink: 1,
	},
	cardYear: {
		...typography.caption,
		fontSize: 11,
	},
	// The title's state pills (Currently Watching, Watch Count…), stacked top-left over the poster —
	// the badges are top-right
	overlayTags: {
		position: "absolute" as const,
		top: 8,
		left: 6,
		gap: 4,
		alignItems: "flex-start" as const,
		zIndex: 1,
	},
	watchlistBadge: {
		position: "absolute" as const,
		top: 6,
		right: 6,
		width: 26,
		height: 26,
		borderRadius: 13,
		borderWidth: 2,
		borderColor: colors.text,
		backgroundColor: colors.badgeOverlay,
		justifyContent: "center" as const,
		alignItems: "center" as const,
		zIndex: 1,
	},
	watchlistBadgeActive: {
		backgroundColor: colors.watchedGreen,
		borderColor: colors.watchedGreen,
	},
	// "Add to List" — sits right under the watchlist badge; amber = already in a list
	listBadge: {
		position: "absolute" as const,
		// Under the watchlist badge: 6 + 26 + a 10 gap
		top: 42,
		right: 6,
		width: 26,
		height: 26,
		borderRadius: 13,
		borderWidth: 2,
		borderColor: colors.text,
		backgroundColor: colors.badgeOverlay,
		justifyContent: "center" as const,
		alignItems: "center" as const,
		zIndex: 1,
	},
	// No watchlist badge above it: takes its place
	listBadgeTop: { top: 6 },
	listBadgeActive: {
		backgroundColor: colors.warningAmber,
		borderColor: colors.warningAmber,
	},
	// List view: one title per row — blurred backdrop, poster, title / meta / overview, badges
	rowCard: {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		marginBottom: spacing.sm,
		padding: spacing.sm,
		gap: spacing.md,
		borderRadius: CARD_RADIUS,
		overflow: "hidden" as const,
		backgroundColor: colors.surface,
	},
	// Darker than the list page's 0.55: the overview is small text over the backdrop
	rowOverlay: { backgroundColor: "rgba(0, 0, 0, 0.7)" },
	rowPoster: {
		width: ROW_POSTER_W,
		aspectRatio: 2 / 3,
		borderRadius: 10,
		backgroundColor: colors.surface,
	},
	rowInfo: { flex: 1, gap: spacing.xs },
	rowTitle: { ...typography.subtitle, fontSize: 15 },
	rowMeta: {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		gap: spacing.sm,
	},
	rowMetaText: { ...typography.caption, fontSize: 11 },
	rowOverview: typography.caption,
	rowBadges: { gap: 10, alignSelf: "center" as const },
	// In the row's badge column, not floating over a poster
	rowBadge: { position: "relative" as const, top: 0, right: 0 },
	// SearchSkeleton list variant: the row's box
	rowSkeleton: {
		height: ROW_HEIGHT,
		marginBottom: spacing.sm,
		borderRadius: CARD_RADIUS,
		backgroundColor: colors.border,
	},
	// TV / MOVIE pill with the year under it
	bannerSide: {
		alignItems: "flex-end" as const,
		gap: 2,
		flexShrink: 0,
	},
	bannerTop: {
		flexDirection: "row" as const,
		alignItems: "flex-start" as const,
		justifyContent: "space-between" as const,
		gap: 4,
	},
	typeBadge: {
		backgroundColor: colors.primary,
		borderRadius: 4,
		paddingHorizontal: 6,
		paddingVertical: 2,
		flexShrink: 0,
	},
	typeBadgeMovie: {
		backgroundColor: colors.moviePurple,
	},
	typeBadgeText: {
		color: colors.text,
		fontSize: 10,
		fontWeight: "700" as const,
	},
	// Text sits just above the character art pinned to the bottom edge
	emptyWrap: {
		flex: 1,
		alignItems: "center" as const,
		justifyContent: "flex-end" as const,
		paddingHorizontal: spacing.xxl,
		paddingBottom: artHeight(NO_RESULTS_RATIO) + spacing.xl,
	},
	emptyText: {
		...typography.subtitle,
		color: colors.textSecondary,
		textAlign: "center" as const,
	},
	emptyHint: {
		...typography.caption,
		color: colors.textMuted,
		textAlign: "center" as const,
		marginTop: spacing.xs,
	},
});
