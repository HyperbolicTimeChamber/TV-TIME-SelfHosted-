import { useState } from "react";
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
import { displayProviders, providerApp, providerLink, shortProviderName } from "../utils/providerNames";
import ServiceApps from "../../modules/service-apps";
import BottomSheet, { SheetGroup, sheetStyles } from "./modals/BottomSheet";
import { useSharedShimmer } from "./SkeletonLine";
import { colors, spacing, typography, themedStyles } from "../theme";
import { PROVIDER_OPEN_GUARD_MS, type MediaType } from "../enums";

const HIGH_SEAS_ART = require("../../assets/high-seas.webp");
const HIGH_SEAS_RATIO = 240 / 253;

const LOGO = 60;
/** Lines the section up with the page's text, which sits this far inside its padding */
const TEXT_INSET = spacing.sm;
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
		if (url) openService(url, providerApp(name));
	};

	return (
		<View style={styles.section}>
			{country ? (
				<View style={[styles.header, styles.creditRow]}>
					<Text style={[styles.title, styles.creditRowTitle]}>Where to Watch in {country}</Text>
					{shown.length > 0 && <Text style={styles.endCredit}>via JustWatch</Text>}
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
					</View>
				</View>
			) : (
				<>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={{ marginHorizontal: -(bleed + TEXT_INSET) }}
						contentContainerStyle={[styles.row, { paddingHorizontal: bleed + TEXT_INSET }]}
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
	size = LOGO,
}: Readonly<{ id: number; name: string; logo: string; onOpen: (name: string) => void; size?: number }>) {
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
			style={[styles.tile, { width: size }]}
		>
			<Reanimated.View style={pressed}>
				<Image
					source={{ uri: tmdbPosterUri(logo, size) }}
					style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}
					contentFit="cover"
					transition={ENTER_MS}
					recyclingKey={String(id)}
				/>
			</Reanimated.View>
		</Pressable>
	);
}

/** Where a compact row sits: the info drawer ("Where to Watch in {country}") or the episode
 *  modal ("Watch on", smaller logos, just above Mark as Watched) */
export enum WhereToWatchPlacement {
	DRAWER = "drawer",
	MODAL = "modal",
}

const COMPACT_LOGO: Record<WhereToWatchPlacement, number> = {
	[WhereToWatchPlacement.DRAWER]: 48,
	[WhereToWatchPlacement.MODAL]: 36,
};
const COMPACT_GAP: Record<WhereToWatchPlacement, number> = {
	[WhereToWatchPlacement.DRAWER]: spacing.md,
	[WhereToWatchPlacement.MODAL]: spacing.sm,
};


/** The service's own app when it's installed (the link, else its home screen), else the browser */
function openService(url: string, androidPackage: string | null) {
	try {
		if (ServiceApps?.openInApp(url, androidPackage)) return;
	} catch {}
	Linking.openURL(url).catch(() => {});
}

/**
 * Where to Watch for a drawer / modal: one row that never scrolls or overflows — as many logos as
 * fit the width, and when there are more the last slot is a "+N" tile that opens every service
 * in a sheet. Nothing at all while loading, on an error or when nothing streams it (no empty
 * state or skeleton in a small space)
 */
export function WhereToWatchCompact({
	tmdbId,
	mediaType,
	title,
	placement,
}: Readonly<{ tmdbId: number; mediaType: MediaType; title: string; placement: WhereToWatchPlacement }>) {
	const { region, data } = useWatchProviders(tmdbId, mediaType);
	const country = useCountryName(region);
	const [width, setWidth] = useState(0);
	const [sheetOpen, setSheetOpen] = useState(false);
	const shown = data ? displayProviders(data.providers) : [];
	if (shown.length === 0) return null;

	const size = COMPACT_LOGO[placement];
	const gap = COMPACT_GAP[placement];
	const fit = width > 0 ? Math.max(1, Math.floor((width + gap) / (size + gap))) : 0;
	const overflow = shown.length > fit;
	const visible = overflow ? shown.slice(0, Math.max(0, fit - 1)) : shown;
	const open = (name: string) => {
		const url = providerLink(name, title, data?.link ?? null, true);
		if (url) openService(url, providerApp(name));
	};
	const heading =
		placement === WhereToWatchPlacement.MODAL ? "Watch on" : `Where to Watch${country ? ` in ${country}` : ""}`;

	return (
		<View style={placement === WhereToWatchPlacement.MODAL ? styles.compactModal : styles.compactDrawer}>
			{placement === WhereToWatchPlacement.MODAL ? (
				<Text style={styles.compactLabel}>
					{heading}
					<Text style={styles.inlineCredit}>{"  "}(via JustWatch)</Text>
				</Text>
			) : (
				<View style={styles.creditRow}>
					<Text style={[styles.compactTitle, styles.creditRowTitle]}>{heading}</Text>
					<Text style={styles.endCredit}>via JustWatch</Text>
				</View>
			)}
			<View style={[styles.row, { gap }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
				{width > 0 &&
					visible.map((p) => <ProviderLogo key={p.id} id={p.id} name={p.name} logo={p.logo} onOpen={open} size={size} />)}
				{width > 0 && overflow ? (
					<Pressable
						onPress={() => setSheetOpen(true)}
						accessibilityRole="button"
						accessibilityLabel={`${shown.length - visible.length} more streaming services`}
						style={({ pressed }) => [pressed && styles.tilePressed]}
					>
						{/* The next service's logo under a dark "+N" — it reads as more of the same row */}
						<Image
							source={{ uri: tmdbPosterUri(shown[visible.length].logo, size) }}
							style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}
							contentFit="cover"
						/>
						<View style={[styles.moreOverlay, { borderRadius: size / 2 }]}>
							<Text style={[styles.moreText, { fontSize: size > 40 ? 15 : 12 }]}>
								+{shown.length - visible.length}
							</Text>
						</View>
					</Pressable>
				) : null}
			</View>
			<ProvidersSheet
				visible={sheetOpen}
				onClose={() => setSheetOpen(false)}
				heading={`Where to Watch${country ? ` in ${country}` : ""}`}
				providers={shown}
				onOpen={open}
			/>
		</View>
	);
}

/** Every service streaming the title, one row each (logo + name); tapping one opens it */
function ProvidersSheet({
	visible,
	onClose,
	heading,
	providers,
	onOpen,
}: Readonly<{
	visible: boolean;
	onClose: () => void;
	heading: string;
	providers: ReturnType<typeof displayProviders>;
	onOpen: (name: string) => void;
}>) {
	return (
		<BottomSheet visible={visible} onClose={onClose}>
			{(close) => (
				<View style={styles.sheetBody}>
					<View style={styles.creditRow}>
						<Text style={[styles.sheetTitle, styles.creditRowTitle]}>{heading}</Text>
						<Text style={styles.endCredit}>via JustWatch</Text>
					</View>
					<SheetGroup>
						{providers.map((p) => (
							<Pressable
								key={p.id}
								onPress={() => {
									const now = Date.now();
									if (now - lastOpenAt < PROVIDER_OPEN_GUARD_MS) return;
									lastOpenAt = now;
									Haptics.selectionAsync().catch(() => {});
									close(() => onOpen(p.name));
								}}
								accessibilityRole="link"
								accessibilityLabel={`Watch on ${p.name}`}
								style={({ pressed }) => [sheetStyles.row, pressed && styles.sheetRowPressed]}
							>
								<Image
									source={{ uri: tmdbPosterUri(p.logo, 40) }}
									style={styles.sheetLogo}
									contentFit="cover"
								/>
								<Text style={styles.sheetName} numberOfLines={1}>
									{shortProviderName(p.name)}
								</Text>
							</Pressable>
						))}
					</SheetGroup>
				</View>
			)}
		</BottomSheet>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	section: { marginTop: spacing.xl, paddingHorizontal: TEXT_INSET },
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
	tilePressed: { transform: [{ scale: 0.92 }], opacity: 0.85 },
	compactDrawer: { marginTop: spacing.lg, marginBottom: spacing.xl, gap: spacing.sm },
	compactModal: { marginTop: spacing.sm, marginBottom: spacing.sm, gap: 6 },
	// The drawer's section title (its other headings' size)
	compactTitle: { ...typography.subtitle, fontSize: 15 },
	compactLabel: { ...typography.caption, fontWeight: "600", color: colors.textSecondary },
	moreOverlay: {
		position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
		backgroundColor: "rgba(0, 0, 0, 0.78)",
		alignItems: "center",
		justifyContent: "center",
	},
	moreText: { color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] },
	sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
	sheetTitle: { ...typography.title, fontSize: 18 },
	sheetLogo: { width: 36, height: 36, borderRadius: 18 },
	sheetName: { ...typography.body, fontSize: 15, flex: 1 },
	sheetRowPressed: { opacity: 0.6 },
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
	// TMDB's terms: the availability data is JustWatch's — credited on every heading that shows it:
	// at the row's right end (page, drawer, sheet), after the label in the small modal
	creditRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
	creditRowTitle: { flexShrink: 1 },
	endCredit: { ...typography.caption, fontSize: 11, color: colors.textMuted },
	inlineCredit: { ...typography.caption, fontSize: 11, fontWeight: "400", color: colors.textMuted },
}));
