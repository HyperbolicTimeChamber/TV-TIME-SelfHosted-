import { useEffect } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, {
	Easing,
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import BottomSheet from "./BottomSheet";
import { colors, fonts, spacing, tint, typography } from "../../theme";
import { APP_VERSION } from "../../utils/appVersion";
import { exitApp, type ChannelRelease } from "../../services/appUpdate";
import { UpdatePhase, useUpdateStore } from "../../stores/updateStore";

const UPGRADE = require("../../../assets/upgrade.webp");
/** upgrade.webp's own proportions (1734 × 1486) */
const UPGRADE_RATIO = 1734 / 1486;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Progress bar catches up with each (coalesced) progress event over this long */
const BAR_MS = 400;
/** Swapping the status line / buttons: a quick crossfade, never a jump */
const SWAP_MS = 160;
/** Buttons answer the press: sink fast, settle a touch slower */
const PRESS_SCALE = 0.97;
const PRESS_IN_MS = 100;
const PRESS_OUT_MS = 180;

interface Props {
	visible: boolean;
	release: ChannelRelease;
	/** Below the minimum build: no "Not now", and dismissing it closes the app */
	forced: boolean;
}

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1);

/**
 * "It's Time for an Upgrade" drawer: the Upgrade art, the version step as a pill (V old → V new),
 * then one red Update button (download with a progress bar in the same spot → Android's
 * installer) and a quieter Not Now. Once downloaded (Install) it shows the release notes too.
 * Forced: Not Now becomes Close App, and back / drag down / tapping outside close the app
 */
export default function UpdateSheet({ visible, release, forced }: Readonly<Props>) {
	const { phase, progress, skip, startDownload, cancelDownload, install } = useUpdateStore();
	const downloading = phase === UpdatePhase.DOWNLOADING;
	const bar = useSharedValue(0);
	useEffect(() => {
		bar.value = withTiming(progress, { duration: BAR_MS, easing: EASE_OUT });
	}, [progress, bar]);
	const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));

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
		: phase === UpdatePhase.READY
			? "Downloaded — ready to install"
			: phase === UpdatePhase.FAILED
				? "The download failed. Check your connection and try again."
				: forced
					? "This version is no longer supported."
					: release.size
						? `${mb(release.size)} MB download`
						: "A new version is ready.";

	return (
		<BottomSheet visible={visible} onClose={dismiss}>
			{() => (
				<View style={styles.body}>
					<View style={styles.header}>
						<Text style={styles.title}>It's Time for an Upgrade</Text>
						<Image source={UPGRADE} style={styles.hero} contentFit="contain" />
						<View style={styles.versionPill}>
							<Text style={styles.versionOld}>V {APP_VERSION}</Text>
							<Text style={styles.versionArrow}>→</Text>
							<Text style={styles.versionNew}>V {release.version}</Text>
						</View>
					</View>

					{/* The notes once it's downloaded: what the Install brings */}
					{release.notes && phase === UpdatePhase.READY ? (
						<View style={styles.notes}>
							<Text style={styles.notesLabel}>WHAT'S NEW</Text>
							<Text style={styles.notesText} numberOfLines={5}>
								{release.notes}
							</Text>
						</View>
					) : null}

					{/* Fixed-height status: a track while downloading, one line otherwise */}
					<View style={styles.statusArea}>
						<View style={[styles.track, !downloading && styles.trackIdle]}>
							<Reanimated.View style={[styles.fill, barStyle]} />
						</View>
						<Reanimated.Text
							key={downloading ? "progress" : phase}
							entering={FadeIn.duration(SWAP_MS)}
							style={[styles.status, phase === UpdatePhase.FAILED && styles.statusError]}
						>
							{status}
						</Reanimated.Text>
					</View>

					{/* Same two slots in every state, so the drawer never changes height */}
					<SheetButton
						label={
							downloading
								? "Downloading…"
								: phase === UpdatePhase.READY
									? "Install"
									: phase === UpdatePhase.FAILED
										? "Try Again"
										: "Update Now"
						}
						onPress={phase === UpdatePhase.READY ? install : update}
						disabled={downloading}
					/>
					<SheetButton
						label={downloading ? "Cancel Download" : forced ? "Close App" : "Not Now"}
						onPress={downloading ? cancelDownload : dismiss}
						quiet
					/>
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

const styles = StyleSheet.create({
	body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
	header: { alignItems: "center", gap: spacing.sm },
	hero: { height: 150, aspectRatio: UPGRADE_RATIO },
	title: { ...typography.title, fontSize: 22, textAlign: "center" },
	versionPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 3,
		borderRadius: 999,
		backgroundColor: tint(colors.primary, 0.14),
	},
	versionOld: { ...typography.caption, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
	versionArrow: { ...typography.caption, color: colors.textMuted },
	versionNew: {
		...typography.caption,
		fontWeight: "700",
		color: colors.primary,
		fontVariant: ["tabular-nums"],
	},
	// 95% of the screen's width: wider than the drawer's padded column, centred on it
	notes: {
		width: Dimensions.get("window").width * 0.95,
		alignSelf: "center",
		backgroundColor: tint(colors.primary, 0.14),
		borderRadius: 14,
		padding: spacing.md,
		marginTop: spacing.lg,
		gap: 6,
	},
	notesLabel: { fontFamily: fonts.vt323, fontSize: 18, letterSpacing: 1, color: colors.primary, opacity: 0.75 },
	notesText: { fontFamily: fonts.vt323, fontSize: 20, lineHeight: 22, color: colors.primary },
	statusArea: { height: 44, justifyContent: "center", marginTop: spacing.md, gap: spacing.sm },
	track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceLight, overflow: "hidden" },
	// Idle: the track keeps its space but isn't drawn (no reflow when the download starts)
	trackIdle: { opacity: 0 },
	fill: { height: "100%", borderRadius: 3, backgroundColor: colors.primary },
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
