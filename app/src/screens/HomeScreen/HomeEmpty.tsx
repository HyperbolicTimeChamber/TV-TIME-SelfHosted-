import { useState } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	useWindowDimensions,
	type TextLayoutEvent,
} from "react-native";
import { Image } from "expo-image";
import { colors, fonts, spacing, typography } from "../../theme";

export const WELCOME_ART = { source: require("../../../assets/welcome.webp"), ratio: 1080 / 647 };
export const UPCOMING_EMPTY_ART = {
	source: require("../../../assets/upcoming-empty.webp"),
	ratio: 1080 / 599,
};
export const CAUGHT_UP_ART = {
	source: require("../../../assets/caught-up.webp"),
	ratio: 660 / 486,
};
/** Streaming-overlay frame the art sits in on wide screens (tablets) */
const FRAME = require("../../../assets/stream-frame.webp");
const FRAME_RATIO = 563 / 350;
/** Framed art: as wide as the frame minus this inset per side, so cut-off edges (the
 *  upcoming host's hands) tuck under the frame's side borders; centred on the window */
const FRAME_ART_INSET = 0.05;
const FRAME_WINDOW_CENTER_Y = (0.1 + 0.79) / 2;
/** From this width the art is framed / capped; below it the art runs edge to edge */
const WIDE_MIN = 600;
const FRAME_MAX_W = 560;
const ART_MAX_W = 400;
const COMPACT_ART_MAX_W = 220;
/** Titles longer than this many characters use the smaller title size */
const LONG_TITLE = 12;

/** The art's palette: screen-glow cyan with a red "signal ghost" behind it */
const SIGNAL_CYAN = "#5CF2EE";
const SIGNAL_RED = "#FF2D55";

interface Props {
	art: { source: number; ratio: number };
	/** Pixel-font headline */
	title: string;
	subtitle: string;
	tagline: string;
	/** Tablet / web width: show the art inside the streaming-overlay frame */
	framed?: boolean;
	/** Smaller, centred art (never edge to edge) — inline under a list section */
	compact?: boolean;
	/** Regular bold title instead of the pixel font (art that isn't a TV / glitch look) */
	plainTitle?: boolean;
	/** Fill at least this height, content at the top right under the list's pinned header — inline
	 *  in a list, so it stays put with the header instead of scrolling off */
	minHeight?: number;
	onAddShows: () => void;
}

/** Home tab empty state: TV-host art, broadcast-style title, and the way to add shows */
export default function HomeEmpty({
	art,
	title,
	subtitle,
	tagline,
	framed = false,
	compact = false,
	plainTitle = false,
	minHeight,
	onAddShows,
}: Props) {
	const { width } = useWindowDimensions();
	const frameW = Math.min(width - spacing.lg * 2, FRAME_MAX_W);
	const frameH = frameW / FRAME_RATIO;
	const framedArtW = frameW * (1 - FRAME_ART_INSET * 2);
	const framedArtH = framedArtW / art.ratio;
	const plainArtW = Math.min(width - spacing.lg * 2, compact ? COMPACT_ART_MAX_W : ART_MAX_W);
	// Widest rendered line of the text above: a wrapped line's box is wider than its text, so the
	// button takes the measured line width instead
	const [lineW, setLineW] = useState<Record<string, number>>({});
	const measure = (key: string) => (e: TextLayoutEvent) => {
		const w = Math.ceil(Math.max(0, ...e.nativeEvent.lines.map((l) => l.width)));
		setLineW((prev) => (prev[key] === w ? prev : { ...prev, [key]: w }));
	};
	const textW = Math.max(0, ...Object.values(lineW));
	return (
		<View style={[styles.container, minHeight != null && [styles.pinned, { minHeight }]]}>
			{width >= WIDE_MIN && framed ? (
				<View style={{ width: frameW, height: frameH }}>
					<Image
						source={art.source}
						style={{
							position: "absolute",
							left: frameW * FRAME_ART_INSET,
							top: frameH * FRAME_WINDOW_CENTER_Y - framedArtH / 2,
							width: framedArtW,
							height: framedArtH,
						}}
						contentFit="contain"
					/>
					<Image source={FRAME} style={StyleSheet.absoluteFill} contentFit="fill" />
				</View>
			) : compact || width >= WIDE_MIN ? (
				<Image
					source={art.source}
					style={{ width: plainArtW, height: plainArtW / art.ratio }}
					contentFit="contain"
				/>
			) : (
				// Edge to edge: out past the container's side padding
				<Image
					source={art.source}
					style={{ width, height: width / art.ratio, marginHorizontal: -spacing.lg }}
					contentFit="contain"
				/>
			)}
			{/* Long titles step down a size so they stay on two lines */}
			<Text
				style={
					plainTitle
						? styles.plainTitle
						: [styles.title, title.length > LONG_TITLE && styles.titleLong]
				}
			>
				{title}
			</Text>
			{/* Shrink-wraps to the widest line, so the button matches the text width */}
			<View style={styles.textBlock}>
				<Text style={styles.subtitle} onTextLayout={measure("subtitle")}>
					{subtitle}
				</Text>
				<Text style={styles.tagline} onTextLayout={measure("tagline")}>
					{tagline}
				</Text>
				<TouchableOpacity
					style={[styles.button, textW > 0 && { alignSelf: "center", width: textW }]}
					onPress={onAddShows}
				>
					<Text style={styles.buttonText}>+ Add Shows & Movies</Text>
				</TouchableOpacity>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: spacing.lg,
	},
	// Glitched-TV look: pixel type in cyan with a hard red offset shadow
	title: {
		marginTop: spacing.md,
		fontFamily: fonts.handjetExtraBold,
		fontSize: 60,
		lineHeight: 64,
		letterSpacing: 2,
		textAlign: "center",
		color: SIGNAL_CYAN,
		textShadowColor: SIGNAL_RED,
		textShadowOffset: { width: 3, height: 2 },
		textShadowRadius: 1,
	},
	textBlock: {
		alignItems: "stretch",
	},
	titleLong: {
		fontSize: 40,
		lineHeight: 44,
		letterSpacing: 1,
	},
	pinned: {
		justifyContent: "flex-start",
		paddingTop: spacing.md,
	},
	plainTitle: {
		...typography.title,
		marginTop: spacing.md,
		fontSize: 32,
		fontWeight: "800",
		color: colors.text,
		textAlign: "center",
	},
	subtitle: {
		...typography.subtitle,
		marginTop: spacing.sm,
		color: colors.text,
		textAlign: "center",
	},
	tagline: {
		...typography.body,
		marginTop: spacing.xs,
		color: colors.textSecondary,
		textAlign: "center",
		fontStyle: "italic",
	},
	button: {
		alignSelf: "stretch",
		alignItems: "center",
		marginTop: spacing.lg,
		backgroundColor: colors.primary,
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		borderRadius: 8,
	},
	buttonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
});
