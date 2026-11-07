import { Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, { Easing, FadeIn } from "react-native-reanimated";
import { Image } from "expo-image";
import { useCountryName, useWatchProviders } from "../hooks/useWatchProviders";
import { tmdbPosterUri } from "../hooks/useTmdbImage";
import { displayProviders, providerLink, shortProviderName } from "../utils/providerNames";
import { useSharedShimmer } from "./SkeletonLine";
import { colors, spacing, typography } from "../theme";
import type { MediaType } from "../enums";

const HIGH_SEAS_ART = require("../../assets/high-seas.webp");
const HIGH_SEAS_RATIO = 240 / 253;

const LOGO = 60;
const SKELETONS = [0, 1, 2, 3, 4];
/** Logos settle in one after another (nearest first), quick enough never to hold anything up */
const STAGGER_MS = 40;
const ENTER_MS = 220;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

interface Props {
	tmdbId: number;
	mediaType: MediaType;
	/** The title's name — the services' searches are opened with it */
	title: string;
	/** Cancels the info page's side padding so the row scrolls off the screen edge */
	bleed: number;
}

/**
 * Info page "Where to Watch in {country}": the services streaming the title in the viewer's
 * country (IP, else the device locale) as a sideways-scrolling row of round logos; tapping one
 * opens that service (its app when installed) at its search for the title where it allows it. None → "Not Available to Stream"
 */
export default function WhereToWatch({ tmdbId, mediaType, title, bleed }: Readonly<Props>) {
	const { region, data, isPending, isError } = useWatchProviders(tmdbId, mediaType);
	const shimmer = useSharedShimmer();
	const country = useCountryName(region);
	// A failed request says nothing about availability: no section rather than a wrong "none"
	if (isError) return null;
	const shown = data ? displayProviders(data.providers) : [];
	// The service's app (or site) at its search for the title, or just the service; TMDB's watch
	// page for a service it doesn't know
	const open = (name: string) => {
		const url = providerLink(name, title, data?.link ?? null);
		if (url) Linking.openURL(url).catch(() => {});
	};

	return (
		<View style={styles.section}>
			{country ? (
				<Text style={styles.title} numberOfLines={1}>
					Where to Watch in {country}
				</Text>
			) : (
				// The title waits for the country: a bar its size, so nothing moves when it lands
				<Animated.View style={[styles.skeletonTitle, { opacity: shimmer }]} />
			)}
			{isPending || !data ? (
				<View style={styles.row} accessibilityLabel="Loading where to watch">
					{SKELETONS.map((i) => (
						<View key={i} style={styles.tile}>
							<Animated.View style={[styles.logo, styles.skeleton, { opacity: shimmer }]} />
							<Animated.View style={[styles.skeletonName, { opacity: shimmer }]} />
						</View>
					))}
				</View>
			) : shown.length === 0 ? (
				<View style={styles.empty}>
					<Image
						source={HIGH_SEAS_ART}
						style={styles.emptyArt}
						contentFit="contain"
						accessibilityIgnoresInvertColors
					/>
					<View style={styles.emptyText}>
						<Text style={styles.emptyTitle}>Not Available to Stream</Text>
						<Text style={styles.emptyHint}>Try the high seas</Text>
					</View>
				</View>
			) : (
				<>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={{ marginHorizontal: -bleed }}
						contentContainerStyle={[styles.row, { paddingHorizontal: bleed }]}
					>
						{shown.map((p, i) => (
							<Reanimated.View
								key={p.id}
								entering={FadeIn.delay(i * STAGGER_MS).duration(ENTER_MS).easing(EASE_OUT)}
							>
								<Pressable
									onPress={() => open(p.name)}
									accessibilityRole="link"
									accessibilityLabel={`Watch on ${p.name}`}
									style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
								>
									<Image
										source={{ uri: tmdbPosterUri(p.logo, LOGO) }}
										style={styles.logo}
										contentFit="cover"
										transition={ENTER_MS}
										recyclingKey={String(p.id)}
									/>
									<Text style={styles.name} numberOfLines={2}>
										{shortProviderName(p.name)}
									</Text>
								</Pressable>
							</Reanimated.View>
						))}
					</ScrollView>
					{/* TMDB's terms: the availability data is JustWatch's */}
					<Text style={styles.attribution}>Streaming data by JustWatch</Text>
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	section: { marginTop: spacing.xl },
	// The page's section title (Seasons)
	title: { ...typography.title, fontSize: 18, marginBottom: spacing.md },
	skeletonTitle: {
		width: 220,
		height: 18,
		borderRadius: 6,
		marginTop: 4,
		marginBottom: spacing.md + 4,
		backgroundColor: colors.border,
	},
	row: { flexDirection: "row", gap: spacing.md },
	tile: { width: LOGO, alignItems: "center", gap: spacing.xs },
	// Press feedback: the logo gives a little under the finger
	tilePressed: { transform: [{ scale: 0.96 }], opacity: 0.85 },
	logo: {
		width: LOGO,
		height: LOGO,
		borderRadius: LOGO / 2,
		backgroundColor: colors.surface,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
	},
	skeleton: { backgroundColor: colors.border, borderWidth: 0 },
	// One line of a service name
	skeletonName: {
		width: 44,
		height: 9,
		borderRadius: 4,
		marginTop: 3,
		backgroundColor: colors.border,
	},
	name: {
		...typography.caption,
		fontSize: 11,
		lineHeight: 13,
		color: colors.textSecondary,
		textAlign: "center",
	},
	empty: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		backgroundColor: colors.surface,
		borderRadius: 14,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.lg,
	},
	emptyArt: { width: 44, height: 44 / HIGH_SEAS_RATIO },
	emptyText: { flex: 1, gap: 2 },
	emptyTitle: { ...typography.body, fontWeight: "600", color: colors.text },
	emptyHint: { ...typography.caption, color: colors.textMuted },
	attribution: {
		...typography.caption,
		fontSize: 10,
		color: colors.textMuted,
		marginTop: spacing.sm,
	},
});
