import { Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, {
	Easing,
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useCountryName, useWatchProviders } from "../hooks/useWatchProviders";
import { tmdbPosterUri } from "../hooks/useTmdbImage";
import { displayProviders, providerLink } from "../utils/providerNames";
import { useSharedShimmer } from "./SkeletonLine";
import { colors, spacing, typography } from "../theme";
import { PROVIDER_OPEN_GUARD_MS, type MediaType } from "../enums";

const HIGH_SEAS_ART = require("../../assets/high-seas.webp");
const HIGH_SEAS_RATIO = 240 / 253;

const LOGO = 60;
const SKELETONS = [0, 1, 2, 3, 4];
/** Logos settle in one after another (nearest first), quick enough never to hold anything up */
const STAGGER_MS = 40;
/** The stagger stops growing after this many: a long row's tail never waits on the rest */
const STAGGER_CAP = 6;
const ENTER_MS = 220;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Press: the logo sinks quickly, then settles back a little slower on release */
const PRESS_SCALE = 0.9;
const PRESS_IN_MS = 90;
const PRESS_OUT_MS = 220;
/** When a service was last opened: a double tap (or a tap on a second logo) opens one */
let lastOpenAt = 0;

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
	// The service's app (or site): at its search for the title when the app fills it in, else its
	// home; TMDB's watch page for a service it doesn't know
	const open = (name: string) => {
		const url = providerLink(name, title, data?.link ?? null, true);
		if (url) Linking.openURL(url).catch(() => {});
	};

	return (
		<View style={styles.section}>
			{country ? (
				<View style={styles.header}>
					<Text style={styles.title} numberOfLines={1}>
						Where to Watch in {country}
					</Text>
					{/* TMDB's terms: the availability data is JustWatch's */}
					{shown.length > 0 && <Text style={styles.attribution}>Streaming data by JustWatch</Text>}
				</View>
			) : (
				// The title waits for the country: a bar its size, so nothing moves when it lands
				<Animated.View style={[styles.skeletonTitle, { opacity: shimmer }]} />
			)}
			{isPending || !data ? (
				<View style={styles.row} accessibilityLabel="Loading where to watch">
					{SKELETONS.map((i) => (
						<Animated.View key={i} style={[styles.logo, styles.skeleton, { opacity: shimmer }]} />
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
						<Text style={styles.emptyHint}>Try the High Seas</Text>
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
								entering={FadeIn.delay(Math.min(i, STAGGER_CAP) * STAGGER_MS).duration(ENTER_MS).easing(EASE_OUT)}
							>
								<ProviderLogo id={p.id} name={p.name} logo={p.logo} onOpen={open} />
							</Reanimated.View>
						))}
					</ScrollView>
				</>
			)}
		</View>
	);
}

/**
 * One service's logo button: sinks under the finger with a light tick and opens the service at once
 * (the switch never waits on the animation; the dip covers a slow one). A quick tap (released
 * before the sink ends) still plays the full dip
 */
function ProviderLogo({
	id,
	name,
	logo,
	onOpen,
}: Readonly<{ id: number; name: string; logo: string; onOpen: (name: string) => void }>) {
	const scale = useSharedValue(1);
	const pressed = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
		opacity: 0.8 + ((scale.value - PRESS_SCALE) / (1 - PRESS_SCALE)) * 0.2,
	}));
	const sink = () => {
		scale.value = withTiming(PRESS_SCALE, { duration: PRESS_IN_MS, easing: EASE_OUT });
	};
	const release = () => {
		scale.value = withSequence(
			withTiming(PRESS_SCALE, { duration: PRESS_IN_MS, easing: EASE_OUT }),
			withTiming(1, { duration: PRESS_OUT_MS, easing: EASE_OUT }),
		);
	};
	const press = () => {
		const now = Date.now();
		if (now - lastOpenAt < PROVIDER_OPEN_GUARD_MS) return;
		lastOpenAt = now;
		Haptics.selectionAsync().catch(() => {});
		onOpen(name);
	};

	return (
		<Pressable
			onPressIn={sink}
			onPressOut={release}
			onPress={press}
			accessibilityRole="link"
			accessibilityLabel={`Watch on ${name}`}
			style={styles.tile}
		>
			<Reanimated.View style={pressed}>
				<Image
					source={{ uri: tmdbPosterUri(logo, LOGO) }}
					style={styles.logo}
					contentFit="cover"
					transition={ENTER_MS}
					recyclingKey={String(id)}
				/>
			</Reanimated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	section: { marginTop: spacing.xl },
	header: { marginBottom: spacing.md, gap: 2 },
	// The page's section title (Seasons)
	title: { ...typography.title, fontSize: 18 },
	skeletonTitle: {
		width: 220,
		height: 18,
		borderRadius: 6,
		marginTop: 4,
		marginBottom: spacing.md + 4,
		backgroundColor: colors.border,
	},
	row: { flexDirection: "row", gap: spacing.md },
	// Logos only (the name is the accessibility label)
	tile: { width: LOGO, alignItems: "center" },
	logo: {
		width: LOGO,
		height: LOGO,
		// No border / backdrop: either showed as a fine ring at the anti-aliased edge (dark logos)
		borderRadius: LOGO / 2,
	},
	skeleton: { backgroundColor: colors.border },
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
	attribution: { ...typography.caption, fontSize: 11, color: colors.textMuted },
});
