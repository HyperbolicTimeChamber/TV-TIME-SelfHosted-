import React, { memo, ReactNode } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	StyleProp,
	ViewStyle,
	TextStyle,
} from "react-native";
import { colors, spacing, typography } from "../theme";
import { CARD_RADIUS } from "../enums";

/** Poster width (and card height) of the watchlist / Upcoming cards */
export const CARD_POSTER_WIDTH = 100;
/** Largest system font scale the fixed-height cards and calendar cells follow: at the maximum
 *  (2×) their lines no longer fit and were clipped */
export const CARD_MAX_FONT_SCALE = 1.15;

/** Gap between a card's three lines (title pill, episode / tags line, episode name / director);
 *  both gaps shrink evenly when a two-line episode name needs the room */
const CARD_LINE_GAP = 11;
/** The subline's capitals sit ~2pt below its line top: its gap is 2 less so the visible gaps match */
const SUBLINE_CAP_OFFSET = 2;

interface Props {
	title: string;
	/** Makes the title pill a button with a › arrow */
	onTitlePress?: () => void;
	/** The middle line: "S02 | E10" with its tags, or a movie's tags */
	children: ReactNode;
	/** The bottom line: episode name or a movie's director */
	subline?: string | null;
	/** Lines the subline may wrap to (episode names: 2) */
	sublineLines?: number;
	titlePillStyle?: StyleProp<ViewStyle>;
	titleTextStyle?: StyleProp<TextStyle>;
	sublineStyle?: StyleProp<TextStyle>;
	style?: StyleProp<ViewStyle>;
}

/**
 * Text column of the watchlist and Upcoming cards — title pill, middle line, subline, the three
 * equally spaced and centred in the card. The card has a fixed height, so a two-line subline
 * shrinks both gaps evenly instead of growing the card. Shared so all the cards keep one layout.
 */
export default memo(function CardInfo({
	title,
	onTitlePress,
	children,
	subline,
	sublineLines = 1,
	titlePillStyle,
	titleTextStyle,
	sublineStyle,
	style,
}: Props) {
	const titleContent = (
		<>
			<Text
				maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
				style={[cardStyles.titleText, titleTextStyle]}
				numberOfLines={1}
			>
				{title.toUpperCase()}
			</Text>
			{onTitlePress && (
				<Text maxFontSizeMultiplier={CARD_MAX_FONT_SCALE} style={cardStyles.titleArrow}>
					›
				</Text>
			)}
		</>
	);
	return (
		<View style={[cardStyles.info, style]}>
			{onTitlePress ? (
				<TouchableOpacity
					style={[cardStyles.titlePill, titlePillStyle]}
					onPress={onTitlePress}
					activeOpacity={0.7}
				>
					{titleContent}
				</TouchableOpacity>
			) : (
				<View style={[cardStyles.titlePill, titlePillStyle]}>{titleContent}</View>
			)}
			<View style={cardStyles.gap} />
			{children}
			{subline ? (
				<>
					<View style={[cardStyles.gap, cardStyles.sublineGap]} />
					<Text
						maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
						style={[cardStyles.subline, sublineStyle]}
						numberOfLines={sublineLines}
					>
						{subline}
					</Text>
				</>
			) : null}
		</View>
	);
});

export const cardStyles = StyleSheet.create({
	container: {
		flexDirection: "row",
		backgroundColor: colors.surface,
		borderRadius: CARD_RADIUS,
		overflow: "hidden",
		// Fixed: the gaps give way to a two-line episode name instead of the card growing
		height: CARD_POSTER_WIDTH,
	},
	poster: {
		width: CARD_POSTER_WIDTH,
		alignSelf: "stretch",
	},
	info: {
		flex: 1,
		justifyContent: "center",
		paddingVertical: spacing.sm,
		paddingLeft: spacing.md,
		paddingRight: spacing.xs,
	},
	titlePill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderColor: colors.text,
		borderRadius: 14,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		maxWidth: "90%",
	},
	titleText: {
		fontSize: 11,
		fontWeight: "600",
		color: colors.text,
		flexShrink: 1,
		letterSpacing: 0.5,
	},
	titleArrow: {
		fontSize: 11,
		color: colors.text,
		marginLeft: spacing.xs,
		lineHeight: 13,
	},
	/** "S02 | E10" */
	episode: {
		...typography.subtitle,
		fontSize: 16,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 1,
	},
	gap: { height: CARD_LINE_GAP, flexShrink: 1, minHeight: 2 },
	sublineGap: { height: CARD_LINE_GAP - SUBLINE_CAP_OFFSET },
	subline: {
		...typography.body,
		color: colors.textSecondary,
		fontSize: 13,
		lineHeight: 16,
	},
});
