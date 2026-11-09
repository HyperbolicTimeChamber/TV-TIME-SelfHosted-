import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, { Easing, FadeIn } from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTitleExtras } from "../hooks/useTitleExtras";
import { tmdbLogoUri } from "../hooks/useTmdbImage";
import { useSharedShimmer } from "./SkeletonLine";
import PhotoTrigger from "./PhotoViewer";
import { mainStudios } from "../utils/studioNames";
import { colors, spacing, typography } from "../theme";
import { studioSubject } from "../utils/subjectLink";
import type { MediaType } from "../enums";

const CHIP_W = 112;
const CHIP_H = 56;
const CHIP_RADIUS = 12;
const SKELETONS = [0, 1, 2, 3];
/** Lines the section up with the page's text, which sits this far inside its padding */
const TEXT_INSET = spacing.sm;
const STAGGER_MS = 40;
/** The stagger stops growing after this many: a long row's tail never waits on the rest */
const STAGGER_CAP = 6;
const ENTER_MS = 220;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Frosted glass: mostly-white body (the logos are black — see-through glass over the black page
 *  would hide them), lighter at the top, with a diagonal sheen across it */
const GLASS_BODY = ["rgba(255, 255, 255, 0.95)", "rgba(255, 255, 255, 0.74)"] as const;
const GLASS_SHEEN = ["rgba(255, 255, 255, 0.55)", "rgba(255, 255, 255, 0)"] as const;

interface Props {
	tmdbId: number;
	mediaType: MediaType;
	/** Cancels the info page's side padding so the row scrolls off the screen edge */
	bleed: number;
}

/**
 * Info page Studios: the networks / production companies' logos only, each on a frosted glass
 * chip (TMDB's logos are black on transparent — it has no light versions), in a row that scrolls off the screen edge. Stored with the
 * title's extras (titleExtras CF). None with a logo → no section
 */
export default function StudiosRow({ tmdbId, mediaType, bleed }: Readonly<Props>) {
	const { data, isPending, isError } = useTitleExtras(tmdbId, mediaType);
	const shimmer = useSharedShimmer();
	// Each company once: a division drops out next to its parent (OLM Digital beside OLM)
	const studios = data?.studios && mainStudios(data.studios);
	if (isError || (studios && studios.length === 0)) return null;

	return (
		<View style={styles.section}>
			<Text style={styles.label}>Studios</Text>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ marginHorizontal: -(bleed + TEXT_INSET) }}
				contentContainerStyle={[styles.row, { paddingHorizontal: bleed + TEXT_INSET }]}
				scrollEnabled={!isPending}
			>
				{isPending || !studios
					? SKELETONS.map((i) => (
							<Animated.View key={i} style={[styles.chip, styles.skeleton, { opacity: shimmer }]} />
						))
					: studios.map((s, i) => (
							<Reanimated.View
								key={s.id}
								entering={FadeIn.delay(Math.min(i, STAGGER_CAP) * STAGGER_MS).duration(ENTER_MS).easing(EASE_OUT)}
								style={styles.chip}
							>
								<PhotoTrigger
									subject={studioSubject(s, { tmdbId, mediaType })}
									radius={CHIP_RADIUS}
									thumbWidth={CHIP_W}
									style={styles.chipBody}
								>
									{/* Rounded themselves: clipping them with the chip's overflow left jagged corners
									    (Android doesn't anti-alias that clip) */}
									<LinearGradient colors={GLASS_BODY} style={styles.glass} />
									<LinearGradient
										colors={GLASS_SHEEN}
										start={{ x: 0, y: 0 }}
										end={{ x: 0.7, y: 0.6 }}
										style={styles.glass}
									/>
									<View style={styles.logoSlot}>
										<Image
											source={{ uri: tmdbLogoUri(s.logo, CHIP_W) }}
											style={styles.logo}
											contentFit="contain"
											transition={ENTER_MS}
											recyclingKey={String(s.id)}
										/>
									</View>
								</PhotoTrigger>
							</Reanimated.View>
						))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	section: { marginTop: spacing.lg, paddingHorizontal: TEXT_INSET },
	// The credits' red label (Director)
	label: { ...typography.subtitle, fontSize: 14, color: colors.primary, marginBottom: spacing.sm },
	row: { flexDirection: "row", gap: spacing.sm },
	chip: {
		width: CHIP_W,
		height: CHIP_H,
		borderRadius: CHIP_RADIUS,
	},
	chipBody: { width: "100%", height: "100%" },
	logoSlot: {
		flex: 1,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	// Fills the whole chip (no rim: the gradient's shading is the glass)
	glass: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		borderRadius: CHIP_RADIUS,
	},
	logo: { width: "100%", height: "100%" },
	skeleton: { backgroundColor: colors.border },
});
