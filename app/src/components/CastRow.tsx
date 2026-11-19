import { useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, { Easing, FadeIn } from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTitleExtras } from "../hooks/useTitleExtras";
import CastSheet from "./modals/CastSheet";
import PhotoTrigger from "./PhotoViewer";
import { tmdbPosterUri } from "../hooks/useTmdbImage";
import { useSharedShimmer } from "./SkeletonLine";
import { colors, spacing, typography, themedStyles } from "../theme";
import { personSubject } from "../utils/subjectLink";
import { FEATURED_CAST_MAX, type MediaType } from "../enums";

/** Portrait photo card (TMDB profiles are 2:3) */
const CARD_W = 104;
const CARD_H = 156;
const CARD_RADIUS = 14;
const SKELETONS = [0, 1, 2, 3, 4];
/** Lines the section up with the page's text, which sits this far inside its padding */
const TEXT_INSET = spacing.sm;
/** Cards settle in one after another (nearest first), quick enough never to hold anything up */
const STAGGER_MS = 40;
/** The stagger stops growing after this many: a long row's tail never waits on the rest */
const STAGGER_CAP = 6;
const ENTER_MS = 220;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Black rising from the card's foot behind the name, clear by its middle */
const NAME_FADE = ["transparent", "rgba(0, 0, 0, 0.55)", "rgba(0, 0, 0, 0.9)"] as const;
const NAME_FADE_STOPS = [0, 0.45, 1] as const;

interface Props {
	tmdbId: number;
	mediaType: MediaType;
	/** The title's name (the View All sheet's subtitle) */
	title: string;
	/** Cancels the info page's side padding so the row scrolls off the screen edge */
	bleed: number;
}

/**
 * Info page Cast: a movie's leads / a show's regulars as photo cards with the name over a black
 * fade at the foot, in a row that scrolls off the screen edge, ending in View All (the whole
 * cast, paged, in a sheet). Stored with the title's extras (titleExtras CF). No cast → no section
 */
export default function CastRow({ tmdbId, mediaType, title, bleed }: Readonly<Props>) {
	const { data: extras, isPending, isError } = useTitleExtras(tmdbId, mediaType);
	// At most FEATURED_CAST_MAX before View All (casts stored before the cap was lowered too)
	const data = extras?.cast.slice(0, FEATURED_CAST_MAX);
	const shimmer = useSharedShimmer();
	const [sheetOpen, setSheetOpen] = useState(false);
	if (isError || (data && data.length === 0)) return null;

	return (
		<View style={styles.section}>
			<Text style={styles.title}>Cast</Text>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ marginHorizontal: -(bleed + TEXT_INSET) }}
				contentContainerStyle={[styles.row, { paddingHorizontal: bleed + TEXT_INSET }]}
				scrollEnabled={!isPending}
			>
				{isPending || !data
					? SKELETONS.map((i) => (
							<Animated.View key={i} style={[styles.card, styles.skeleton, { opacity: shimmer }]} />
						))
					: data.map((m, i) => (
							<Reanimated.View
								key={m.id}
								entering={FadeIn.delay(Math.min(i, STAGGER_CAP) * STAGGER_MS).duration(ENTER_MS).easing(EASE_OUT)}
								style={styles.card}
								accessible={!m.profile}
								accessibilityLabel={m.character ? `${m.name} as ${m.character}` : m.name}
							>
								<PhotoTrigger
									subject={m.profile ? personSubject(m, { tmdbId, mediaType }) : null}
									radius={CARD_RADIUS}
									thumbWidth={CARD_W}
									style={StyleSheet.absoluteFill}
								>
									{m.profile ? (
										<Image
											source={{ uri: tmdbPosterUri(m.profile, CARD_W) }}
											style={StyleSheet.absoluteFill}
											contentFit="cover"
											transition={ENTER_MS}
											recyclingKey={String(m.id)}
										/>
									) : (
										<View style={styles.noPhoto}>
											<Ionicons name="person" size={40} color={colors.textMuted} />
										</View>
									)}
									<LinearGradient
										colors={NAME_FADE}
										locations={NAME_FADE_STOPS}
										style={styles.nameBar}
									>
										<Text style={styles.name} numberOfLines={2}>
											{m.name}
										</Text>
									</LinearGradient>
								</PhotoTrigger>
							</Reanimated.View>
						))}
				{data && (extras?.castTotal ?? 0) > 0 ? (
					<Reanimated.View
						entering={FadeIn.delay(Math.min(data.length, STAGGER_CAP) * STAGGER_MS).duration(ENTER_MS).easing(EASE_OUT)}
					>
						<Pressable
							style={({ pressed }) => [styles.card, styles.viewAll, pressed && styles.pressed]}
							onPress={() => setSheetOpen(true)}
							accessibilityRole="button"
							accessibilityLabel={`View all ${extras?.castTotal} cast`}
						>
							<View style={styles.viewAllArrow}>
								<Ionicons name="chevron-forward" size={24} color={colors.text} />
							</View>
							<Text style={styles.viewAllText}>View All</Text>
							<Text style={styles.viewAllCount}>{extras?.castTotal} people</Text>
						</Pressable>
					</Reanimated.View>
				) : null}
			</ScrollView>
			<CastSheet
				visible={sheetOpen}
				onClose={() => setSheetOpen(false)}
				tmdbId={tmdbId}
				mediaType={mediaType}
				title={title}
				castTotal={extras?.castTotal ?? 0}
			/>
		</View>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	section: { marginTop: spacing.xl, paddingHorizontal: TEXT_INSET },
	// The credits' red label (Director)
	title: { ...typography.subtitle, fontSize: 14, color: colors.primary, marginBottom: spacing.sm },
	row: { flexDirection: "row", gap: spacing.sm + 2 },
	card: {
		width: CARD_W,
		height: CARD_H,
		borderRadius: CARD_RADIUS,
		overflow: "hidden",
		backgroundColor: colors.surface,
	},
	skeleton: { backgroundColor: colors.border },
	noPhoto: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	// Bottom half of the card: the fade rises out of black behind the name
	nameBar: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingTop: spacing.xl,
		paddingHorizontal: spacing.sm,
		paddingBottom: spacing.sm,
	},
	name: { ...typography.caption, fontSize: 12, lineHeight: 15, fontWeight: "600", color: colors.onImage },
	// The last card: the whole cast in a sheet
	viewAll: {
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		backgroundColor: colors.surfaceLight,
	},
	viewAllArrow: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: colors.border,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.xs,
	},
	viewAllText: { ...typography.body, fontWeight: "600", color: colors.text },
	viewAllCount: { ...typography.caption, fontSize: 11, color: colors.textMuted },
	pressed: { transform: [{ scale: 0.96 }] },
}));
