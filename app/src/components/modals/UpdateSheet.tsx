import { useEffect, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
// gesture-handler's: scrolls inside the sheet's drag gesture (BottomSheet pans with gesture-handler)
import { ScrollView } from "react-native-gesture-handler";
import Reanimated, {
	Easing,
	FadeIn,
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { FontAwesome5 } from "@expo/vector-icons";
import BottomSheet from "./BottomSheet";
import { colors, fonts, spacing, typography } from "../../theme";
import { APP_VERSION } from "../../utils/appVersion";
import { exitApp, type ChannelRelease } from "../../services/appUpdate";
import { UpdatePhase, useUpdateStore } from "../../stores/updateStore";
import { UPGRADE_LINES } from "../../enums";

/** Downloaded ("Upgrade Ready"): Upgrade reaching down onto the notes */
const UPGRADE = require("../../../assets/upgrade.webp");
/** upgrade.webp's own proportions (1734 × 1486) */
const UPGRADE_RATIO = 1734 / 1486;
/** Before / during the download: the Omnitrix dial on Upgrade, in two layers on one square canvas
 *  — the outer ring with its gems turns about the centre while it downloads */
const DIAL_RING = require("../../../assets/upgrade-dial-ring.webp");
const DIAL_CORE = require("../../../assets/upgrade-dial-core.webp");
const DIAL_SIZE = 150;
/** One turn of the ring while downloading: constant motion → linear */
const DIAL_TURN_MS = 2400;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Progress bar catches up with each (coalesced) progress event over this long */
const BAR_MS = 400;
/** Swapping the status line / buttons: a quick crossfade, never a jump */
const SWAP_MS = 160;
/** Buttons answer the press: sink fast, settle a touch slower */
const PRESS_SCALE = 0.97;
const PRESS_IN_MS = 100;
const PRESS_OUT_MS = 180;
/** How far Upgrade's hand reaches down onto the notes box */
const HAND_OVERLAP = 44;
/** upgrade.webp: his body's centre is ~35% across — shift the art right to centre it */
const BODY_OFFSET = Math.round(150 * UPGRADE_RATIO * 0.15);

interface Props {
	visible: boolean;
	release: ChannelRelease;
	/** Below the minimum build: no "Not now", and dismissing it closes the app */
	forced: boolean;
}

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1);

/**
 * "It's Time for an Upgrade" drawer: the Omnitrix dial, the version step as a pill (V old → V new),
 * an Upgrade line, then one red Upgrade Now and a quieter Later. Downloading ("Upgrading"): the
 * dial's ring spins and a progress bar takes the button's place. Downloaded ("Upgrade Ready"):
 * Upgrade reaching onto the release notes, Install only. Forced ("App Outdated, Upgrade
 * Required"): an explanation, Later becomes Close App, and back / drag down / tapping outside
 * close the app
 */
export default function UpdateSheet({ visible, release, forced }: Readonly<Props>) {
	const { phase, progress, skip, startDownload, cancelDownload, install } = useUpdateStore();
	const downloading = phase === UpdatePhase.DOWNLOADING;
	const ready = phase === UpdatePhase.READY;
	// One line per opening, kept while it's open
	const [line] = useState(() => UPGRADE_LINES[Math.floor(Math.random() * UPGRADE_LINES.length)]);
	const bar = useSharedValue(0);
	useEffect(() => {
		bar.value = withTiming(progress, { duration: BAR_MS, easing: EASE_OUT });
	}, [progress, bar]);
	const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));
	// The dial's ring spins while downloading and comes to rest where it stopped
	const turn = useSharedValue(0);
	useEffect(() => {
		if (!downloading) {
			cancelAnimation(turn);
			return;
		}
		turn.value = turn.value % 360;
		turn.value = withRepeat(
			withTiming(turn.value + 360, { duration: DIAL_TURN_MS, easing: Easing.linear }),
			-1,
		);
	}, [downloading, turn]);
	const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

	// Forced: leaving the drawer leaves the app; otherwise it's "Not now" (cancelling a download)
	const dismiss = () => {
		if (forced) return exitApp();
		if (downloading) cancelDownload();
		skip();
	};
	const update = () => {
		Haptics.selectionAsync().catch(() => {});
		startDownload();
	};

	const status = downloading
		? release.size
			? `${mb(progress * release.size)} of ${mb(release.size)} MB`
			: `${Math.round(progress * 100)}%`
		: phase === UpdatePhase.FAILED
			? "The download failed. Check your connection and try again."
			: forced
				? "This version no longer works with Watchloom's servers, so syncing and marking " +
					"episodes are paused. Upgrade to keep tracking.\nYour watchlist and history are safe."
				: release.size
					? `${line} · ${mb(release.size)} MB`
					: line;

	const versionPill = (
		<View style={styles.versionPill}>
			<Text style={styles.versionOld}>V {APP_VERSION}</Text>
			{/* The sort menu's "A → Z" arrow (a text arrow sat off the pixel font's centre) */}
			<FontAwesome5 name="long-arrow-alt-right" size={12} color={colors.textMuted} />
			<Text style={styles.versionNew}>V {release.version}</Text>
		</View>
	);

	return (
		<BottomSheet visible={visible} onClose={dismiss}>
			{() => (
				<View style={styles.body}>
					<View style={[styles.header, ready && release.notes ? styles.headerOverNotes : null]}>
						<Text style={styles.title}>
							{ready
								? "Upgrade Ready"
								: downloading
									? "Upgrading"
									: forced
										? "App Outdated, Upgrade Required"
										: "It's Time for an Upgrade"}
						</Text>
						{ready ? (
							<Image
								source={UPGRADE}
								style={[styles.hero, { aspectRatio: UPGRADE_RATIO }, release.notes ? styles.heroOverNotes : null]}
								contentFit="contain"
							/>
						) : (
							<View style={styles.dial}>
								<Image source={DIAL_CORE} style={StyleSheet.absoluteFill} contentFit="contain" />
								<Reanimated.View style={[StyleSheet.absoluteFill, ringStyle]}>
									<Image source={DIAL_RING} style={StyleSheet.absoluteFill} contentFit="contain" />
								</Reanimated.View>
							</View>
						)}
						{ready ? null : versionPill}
					</View>

					{/* The notes once it's downloaded: what the Install brings */}
					{release.notes && ready ? (
						<View style={styles.notes}>
							<View style={styles.notesLabelRow}>
								<Text style={styles.notesLabel}>WHAT'S NEW</Text>
								<Text style={styles.notesVersion}>V{release.version}</Text>
							</View>
							{/* All of it: long notes scroll inside the box instead of being cut off */}
							<ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
								<Text style={styles.notesText}>{release.notes}</Text>
							</ScrollView>
						</View>
					) : null}

					{/* Status line (a forced update explains itself in a few lines); none once downloaded
					    (the notes and Install say it) */}
					<View
						style={[
							styles.statusArea,
							forced && !downloading && !ready && styles.statusAreaLong,
							ready && styles.statusAreaReady,
						]}
					>
						{ready ? null : (
							<Reanimated.Text
								key={downloading ? "progress" : phase}
								entering={FadeIn.duration(SWAP_MS)}
								style={[styles.status, phase === UpdatePhase.FAILED && styles.statusError]}
							>
								{status}
							</Reanimated.Text>
						)}
					</View>

					{/* Downloading: the progress bar takes the button's slot (same height — nothing moves) */}
					{downloading ? (
						<View style={styles.barSlot}>
							<View style={styles.track}>
								<Reanimated.View style={[styles.fill, barStyle]} />
							</View>
						</View>
					) : (
						<SheetButton
							label={ready ? "Install" : phase === UpdatePhase.FAILED ? "Try Again" : "Upgrade Now"}
							onPress={ready ? install : update}
						/>
					)}
					{/* Downloaded: Install is the only way on (forced still offers Close App) */}
					{ready && !forced ? null : (
						<SheetButton
							label={downloading ? "Cancel Download" : forced ? "Close App" : "Later"}
							onPress={downloading ? cancelDownload : dismiss}
							quiet
						/>
					)}
				</View>
			)}
		</BottomSheet>
	);
}

/** Red primary or quiet text button; sinks under the finger (Reanimated, on the UI thread) */
function SheetButton({
	label,
	onPress,
	quiet = false,
	disabled = false,
}: Readonly<{ label: string; onPress: () => void; quiet?: boolean; disabled?: boolean }>) {
	const scale = useSharedValue(1);
	const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
	return (
		<Pressable
			onPress={onPress}
			onPressIn={() => {
				scale.value = withTiming(PRESS_SCALE, { duration: PRESS_IN_MS, easing: EASE_OUT });
			}}
			onPressOut={() => {
				scale.value = withTiming(1, { duration: PRESS_OUT_MS, easing: EASE_OUT });
			}}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled }}
		>
			<Reanimated.View style={[styles.button, quiet && styles.buttonQuiet, disabled && styles.buttonBusy, pressed]}>
				<Text style={[styles.buttonText, quiet && styles.buttonTextQuiet]}>{label}</Text>
			</Reanimated.View>
		</Pressable>
	);
}

const PIXEL_LINE = {
	fontFamily: fonts.vt323,
	fontSize: 18,
	lineHeight: 18,
	includeFontPadding: false,
	textAlignVertical: "center",
	// The pixel glyphs still sit a hair low in their box
	transform: [{ translateY: -1 }],
} as const;

const styles = StyleSheet.create({
	body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
	header: { alignItems: "center", gap: spacing.sm },
	hero: { height: 150 },
	// Downloaded: the hand reaches down over the notes box's top edge
	headerOverNotes: { zIndex: 1, elevation: 1 },
	// …and sits off-centre so his body (left third of the art) is centred, the hand reaching right
	heroOverNotes: {
		marginTop: spacing.sm,
		marginBottom: -HAND_OVERLAP,
		transform: [{ translateX: BODY_OFFSET }],
	},
	dial: { width: DIAL_SIZE, height: DIAL_SIZE, marginVertical: spacing.sm },
	title: { ...typography.title, fontSize: 22, textAlign: "center" },
	versionPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 2,
		borderRadius: 999,
		backgroundColor: colors.background,
	},
	// Pixel font like the notes (custom family: no fontWeight on Android)
	// VT323's line box carries extra room below the glyphs: a tight line height (no Android font
	// padding) centres the text in the pill
	versionOld: { ...PIXEL_LINE, color: colors.textSecondary },
	versionNew: { ...PIXEL_LINE, color: colors.primary },
	// 95% of the screen's width: wider than the drawer's padded column, centred on it
	notes: {
		width: Dimensions.get("window").width * 0.95,
		alignSelf: "center",
		backgroundColor: colors.background,
		borderRadius: 14,
		// The hand overlaps the top padding; the text keeps its usual place
		padding: spacing.md,
		marginTop: spacing.lg,
		gap: 6,
	},
	notesScroll: { maxHeight: Dimensions.get("window").height * 0.32, flexGrow: 0 },
	notesLabelRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
	notesVersion: { fontFamily: fonts.vt323, fontSize: 18, color: colors.primary },
	notesLabel: { fontFamily: fonts.vt323, fontSize: 18, letterSpacing: 1, color: colors.primary, opacity: 0.75 },
	notesText: { fontFamily: fonts.vt323, fontSize: 20, lineHeight: 22, color: colors.primary },
	// The line sits as far under the pill as the dial sits above it
	statusArea: { height: 32, justifyContent: "center", marginTop: spacing.sm },
	statusAreaReady: { height: spacing.md },
	// Forced: the explanation needs a few lines
	statusAreaLong: { height: undefined, minHeight: 32, paddingVertical: spacing.xs },
	// Same height and margin as the button it stands in for
	barSlot: { height: 52, justifyContent: "center", marginTop: spacing.sm },
	track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceLight, overflow: "hidden" },
	fill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
	status: { ...typography.caption, textAlign: "center", fontVariant: ["tabular-nums"] },
	statusError: { color: colors.destructiveRed },
	button: {
		height: 52,
		borderRadius: 26,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
		marginTop: spacing.sm,
	},
	// The way out stays quiet beside the one clear action
	buttonQuiet: { backgroundColor: "transparent", height: 48, marginTop: 2 },
	// Downloading: the primary stays in place, dimmed, until the download ends
	buttonBusy: { opacity: 0.45 },
	buttonText: { ...typography.subtitle, fontSize: 16 },
	buttonTextQuiet: { color: colors.textSecondary, fontWeight: "600" },
});
