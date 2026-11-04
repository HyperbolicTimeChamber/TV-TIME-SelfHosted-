import React, {
	createContext,
	useContext,
	cloneElement,
	isValidElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import {
	View,
	Text,
	Pressable,
	Modal,
	Animated,
	Easing,
	Keyboard,
	PanResponder,
	StyleSheet,
	Dimensions,
} from "react-native";
import Reanimated, {
	Easing as REasing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
	tmdbBlurredBackdropUri,
	tmdbLogoUri,
	tmdbPosterUri,
	tmdbStillUri,
} from "../../hooks/useTmdbImage";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
import { useTitleInfo } from "../../hooks/useTitleInfo";
import { useTitleLogo } from "../../hooks/useTitleLogo";
import { MediaType } from "../../types";
import { colors, fonts, spacing, tint, typography } from "../../theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;

/** Slide-in / snap-back: critically damped, never past its resting place — an overshoot lifted
 *  the sheet off the bottom edge and showed the page under it */
const SHEET_SPRING = {
	toValue: 0,
	damping: 30,
	stiffness: 220,
	overshootClamping: true,
	useNativeDriver: true,
} as const;
/** Exit: a touch quicker than the entry, iOS drawer curve. Travels the sheet's own height —
 *  sliding the whole screen height put it off-screen in the first frames (read as a blink) */
const SHEET_EXIT = {
	duration: 240,
	easing: Easing.bezier(0.32, 0.72, 0, 1),
	useNativeDriver: true,
} as const;
/** Drag past this (or flick) → dismiss */
const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.5;

/** Logo box: at least MIN_W wide / MIN_H tall so wide or tiny logos stay legible, within MAX_*
 *  (a centred logo has the whole width; next to the count pill it has less) */
const LOGO_MIN_W = 160;
const LOGO_MIN_H = 44;
const LOGO_MAX_W = 280;
const LOGO_MAX_W_BESIDE_PILL = 200;
const LOGO_MAX_H = 72;
const SUBTITLE_LINE = 18;
/** Logo → line under it (episode name): room for the logo to breathe */
const SUBTITLE_GAP = spacing.sm;

/** Logo size for its shape: grow to the min height (or min width), clamp to the max box */
function logoSize(ratio: number, maxW: number) {
	let w = Math.min(maxW, Math.max(LOGO_MIN_W, ratio * LOGO_MIN_H));
	let h = w / ratio;
	if (h > LOGO_MAX_H) {
		h = LOGO_MAX_H;
		w = h * ratio;
	}
	return { width: w, height: h };
}

/** Closes the sheet (slide out), then runs `after` once it's gone */
export type CloseSheet = (after?: () => void) => void;

interface Props {
	visible: boolean;
	onClose: () => void;
	children: (close: CloseSheet) => ReactNode;
	/** Drawn behind the content, filling the sheet (clipped to its rounded top) — e.g. art */
	background?: ReactNode;
	/** The title the sheet is about: its art behind the content (SheetArt), cards go translucent */
	art?: SheetArtSource | null;
}

/** Which title a sheet's art comes from — backdrop / poster looked up when not given */
export interface SheetArtSource {
	tmdbId?: number;
	mediaType?: MediaType;
	backdropPath?: string | null;
	posterPath?: string | null;
	/** An episode sheet: that episode's still is the art (show backdrop when it has none) */
	episode?: { season: number; episode: number } | null;
}

/** An episode's still from the catalog kept on the phone (no read); null when unknown */
function cachedStill(
	tmdbId: number | undefined,
	ep: { season: number; episode: number } | null | undefined,
): string | null {
	if (!tmdbId || !ep) return null;
	const season = getCachedCatalogShow(tmdbId, MediaType.TV)?.seasons?.find(
		(s) => s.seasonNumber === ep.season,
	);
	return season?.episodes?.find((e) => e.episodeNumber === ep.episode)?.stillPath ?? null;
}

/** Cards inside a sheet with art default to translucent, so every such sheet matches */
const SheetArtContext = createContext(false);

/**
 * A scroll view inside the sheet (SortSheet's, when its content outgrows the screen) reports here:
 * whether it can scroll at all, and how far it is scrolled. The sheet's own drag stays out of a
 * scrolling list's way — scrolling back up was read as a pull-down and closed the sheet.
 */
export interface SheetScroll {
	scrollable: { current: boolean };
	offset: { current: number };
}
export const SheetScrollContext = createContext<SheetScroll | null>(null);

/** Top of the art stays visible; it darkens downward so the cards and text read on it */
const ART_FADE = ["rgba(26, 26, 26, 0.35)", "rgba(26, 26, 26, 0.85)", colors.surface] as const;
/** A poster standing in for a missing backdrop: blurred to a wash of its colours */
const ART_POSTER_BLUR = 30;
const ART_BLUR = 0.5;
const ART_FADE_MS = 200;

/**
 * A title's art for a sheet's background: its backdrop (blurred a touch), else its poster as a
 * wash, under a gradient into the sheet colour. Nothing known → nothing (the plain sheet)
 */
export function SheetArt({ tmdbId, mediaType, backdropPath, posterPath, episode }: SheetArtSource) {
	const still = cachedStill(tmdbId, episode);
	const lookup = !still && backdropPath === undefined && !!tmdbId;
	const { data: info } = useTitleInfo(tmdbId ?? 0, mediaType ?? MediaType.TV, lookup);
	const backdrop = backdropPath ?? info?.backdropPath ?? null;
	if (!still && !backdrop && !posterPath) return null;
	return (
		<>
			{still ? (
				// Episode still: landscape like a backdrop, same crop / blur
				<Image
					source={{ uri: tmdbStillUri(still, 300) }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					blurRadius={ART_BLUR}
					transition={ART_FADE_MS}
				/>
			) : backdrop ? (
				<Image
					source={{ uri: tmdbBlurredBackdropUri(backdrop) }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					contentPosition="top"
					blurRadius={ART_BLUR}
					transition={ART_FADE_MS}
				/>
			) : posterPath ? (
				<Image
					source={{ uri: tmdbPosterUri(posterPath, 185) }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					blurRadius={ART_POSTER_BLUR}
					transition={ART_FADE_MS}
				/>
			) : null}
			<LinearGradient colors={ART_FADE} style={StyleSheet.absoluteFill} />
		</>
	);
}

/** Bottom sheet shell: dimmed backdrop that fades with the sheet, drag down / tap outside to close */
export default function BottomSheet({ visible, onClose, children, background, art }: Props) {
	const behind = background ?? (art ? <SheetArt {...art} /> : null);
	const insets = useSafeAreaInsets();
	// Parked off-screen until measured; every slide then travels exactly the sheet's height
	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
	const [sheetH, setSheetH] = useState<number | null>(null);
	const liveH = useRef<number | null>(null);
	// Filled in by a scroll view inside (SheetScrollContext); read by the pan responder
	const scroll = useRef<SheetScroll>({ scrollable: { current: false }, offset: { current: 0 } })
		.current;
	const hiddenY = sheetH ?? SCREEN_HEIGHT;
	// Backdrop follows the sheet (drag included) instead of popping in and out
	const backdropOpacity = useMemo(
		() =>
			translateY.interpolate({
				inputRange: [0, hiddenY],
				outputRange: [1, 0],
				extrapolate: "clamp",
			}),
		[translateY, hiddenY],
	);

	// Slide in once open and measured (first open waits a frame for its layout)
	const entered = useRef(false);
	useEffect(() => {
		if (!visible) {
			entered.current = false;
			translateY.setValue(SCREEN_HEIGHT);
			// Reopened content starts at its top, measured afresh
			scroll.offset.current = 0;
			scroll.scrollable.current = false;
			return;
		}
		if (entered.current || sheetH == null) return;
		entered.current = true;
		translateY.setValue(liveH.current ?? sheetH);
		Animated.spring(translateY, SHEET_SPRING).start();
	}, [visible, sheetH, translateY, scroll]);

	const close = useCallback<CloseSheet>(
		(after) => {
			Animated.timing(translateY, {
				...SHEET_EXIT,
				toValue: liveH.current ?? hiddenY,
			}).start(() => {
				onClose();
				after?.();
			});
		},
		[translateY, hiddenY, onClose],
	);
	// The pan responder is made once — it reads the latest close through this
	const closeRef = useRef(close);
	closeRef.current = close;

	const panResponder = useRef(
		PanResponder.create({
			// Claim touches no child claims (labels, gaps, the handle): asked last, after the rows /
			// chips (they keep their taps). Unclaimed, a drag from there never reached the sheet —
			// on Android the Modal sent its moves nowhere, so only drags that began on a pressable
			// moved the drawer. A plain tap just springs back to where it was
			// …unless the content scrolls: then the list owns the touch, and only a pull down from
			// its very top (nothing left to scroll back) drags the sheet
			onStartShouldSetPanResponder: () => !scroll.scrollable.current,
			onMoveShouldSetPanResponder: (_, gs) =>
				gs.dy > 8 &&
				Math.abs(gs.dy) > Math.abs(gs.dx) &&
				(!scroll.scrollable.current || scroll.offset.current <= 0),
			onPanResponderMove: (_, gs) => {
				// Upward drag gets resistance instead of a hard stop
				translateY.setValue(gs.dy > 0 ? gs.dy : -Math.sqrt(-gs.dy) * 2);
			},
			// A scroll view inside took the touch over (content taller than the sheet): settle back
			onPanResponderTerminate: () => Animated.spring(translateY, SHEET_SPRING).start(),
			onPanResponderRelease: (_, gs) => {
				// A touch the sheet took (outside any field / row) leaves a focused field, like a
				// tap outside an input anywhere else
				Keyboard.dismiss();
				if (gs.dy > DISMISS_DISTANCE || gs.vy > DISMISS_VELOCITY) closeRef.current();
				else Animated.spring(translateY, SHEET_SPRING).start();
			},
		}),
	).current;

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			statusBarTranslucent
			// Draw under the nav bar too: the sheet's fill runs to the screen edge and the
			// padding above keeps its rows clear of the bar
			navigationBarTranslucent
			onRequestClose={() => close()}
		>
			<View style={styles.root}>
				<Animated.View
					style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
				>
					<Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
				</Animated.View>
				<Animated.View
					style={[
						styles.sheet,
						// Clear of the system nav bar (3-button bar ≈ 48dp, gesture pill less) + a gap
						{ paddingBottom: insets.bottom + spacing.lg },
						{ transform: [{ translateY }] },
					]}
					onLayout={(e) => {
						// Live height in a ref (closing reads it); state only for the first measure —
						// a row folding in / out resizes the sheet every frame, and a re-render per
						// frame made that animation stutter
						liveH.current = Math.round(e.nativeEvent.layout.height);
						if (sheetH == null) setSheetH(liveH.current);
					}}
					{...panResponder.panHandlers}
				>
					{behind ? <View style={styles.background}>{behind}</View> : null}
					{/* Hangs below the bottom edge, off-screen: pulling the sheet up past its resting
					    place shows more sheet, not the page under it */}
					<View style={styles.overpull} pointerEvents="none" />
					<View style={styles.handle} />
					<SheetScrollContext.Provider value={scroll}>
						<SheetArtContext.Provider value={!!behind}>{children(close)}</SheetArtContext.Provider>
					</SheetScrollContext.Provider>
				</Animated.View>
			</View>
		</Modal>
	);
}

/** Title logo (its name when there's none) — fixed height so the header never jumps */
/** Wait this long for the logo before falling back to the name — the name flashing in and
 *  then swapping for the logo read as a glitch */
const NAME_DELAY_MS = 2000;

/** Title logo (its name when there's none) in a fixed LOGO_MAX_H slot — the drawer never resizes
 *  while it loads or swaps */
function SheetLogo({
	title,
	tmdbId,
	mediaType,
	logoPath: givenLogo,
	centered,
	maxW,
	fit,
}: {
	title: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	centered: boolean;
	maxW: number;
	/** A line follows it: the logo sits on the slot's bottom edge, right above the line — the
	 *  slot keeps its full height, so the line never moves when the logo arrives (a slot that
	 *  grew to the loaded logo re-centred the header and read as a shake) */
	fit: boolean;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [ratio, setRatio] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	const [waited, setWaited] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setWaited(true), NAME_DELAY_MS);
		return () => clearTimeout(t);
	}, []);
	const showLogo = !!logoPath && !failed;
	// Known to have no logo (or it failed): the name at once; still loading: after the delay
	const showName = logoPath === null || failed || (!ratio && waited);
	const size = ratio ? logoSize(ratio, maxW) : null;
	return (
		<View style={[styles.logoSlot, centered && styles.logoSlotCentered, fit && styles.logoSlotFit]}>
			{showName && (
				<Text style={[styles.name, centered && styles.nameCentered]} numberOfLines={2}>
					{title}
				</Text>
			)}
			{showLogo && (
				<Image
					source={{ uri: tmdbLogoUri(logoPath, LOGO_MAX_W * 2) }}
					style={size ?? styles.logoLoading}
					contentFit="contain"
					contentPosition={centered ? "center" : "left"}
					onLoad={(e) => setRatio(e.source.width / e.source.height)}
					onError={() => setFailed(true)}
					accessibilityLabel={title}
				/>
			)}
		</View>
	);
}

/** Calendar-style square: a small label over a rule over a big value — the right side of a
 *  sheet header, as tall as the logo + line beside it */
function HeaderSquare({
	label,
	value,
	prefix,
	accessibilityLabel,
}: {
	label: string;
	value: string;
	/** Smaller leading unit (the x of x2) so the number reads first */
	prefix?: string;
	accessibilityLabel: string;
}) {
	// Over sheet art: the cards' 80% ground, so the square matches them
	const overArt = useContext(SheetArtContext);
	return (
		<View
			style={[styles.epSquare, overArt && styles.groupTranslucent]}
			accessible
			accessibilityLabel={accessibilityLabel}
		>
			<Text style={styles.epSquareTitle}>{label}</Text>
			<View style={styles.epSquareRule} />
			<Text style={styles.epSquareValue}>
				{prefix ? <Text style={styles.epSquarePrefix}>{prefix}</Text> : null}
				{value}
			</Text>
		</View>
	);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** SEASON xx over a big Exx (watchlist episode sheet) */
export function EpisodeSquare({ season, episode }: { season: number; episode: number }) {
	return (
		<HeaderSquare
			label={`SEASON ${pad2(season)}`}
			value={`E${pad2(episode)}`}
			accessibilityLabel={`Season ${season}, episode ${episode}`}
		/>
	);
}

/** `label` (default WATCHED; info page: SEASON 01 / S01 · E05) over a big xN */
export function WatchCountSquare({ count, label = "WATCHED" }: { count: number; label?: string }) {
	return (
		<HeaderSquare
			label={label}
			value={String(count)}
			prefix="x"
			accessibilityLabel={`Watched ${count} ${count === 1 ? "time" : "times"}`}
		/>
	);
}

/**
 * Logo (name fallback) + what the sheet is about on the left; on the right an optional `aside`
 * (EpisodeSquare / WatchCountSquare). `centered`: the logo alone, centred.
 */
export function SheetHeader({
	title,
	subtitle,
	tmdbId,
	mediaType,
	logoPath,
	aside,
	centered = false,
}: {
	title: string;
	subtitle?: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	aside?: ReactNode;
	centered?: boolean;
}) {
	const right = aside ?? null;
	return (
		// With an aside the row stretches: the square takes the logo + name column's height
		<View style={[styles.header, !!aside && styles.headerStretch]}>
			{/* A square beside it: one fixed height (logo + line), so the square is the same size
			    with or without a line and the logo / logo + line block centres against it */}
			<View style={[styles.headerText, !!aside && !centered && styles.headerTextFixed]}>
				<SheetLogo
					title={title}
					tmdbId={tmdbId}
					mediaType={mediaType}
					logoPath={logoPath}
					centered={centered}
					maxW={centered || !right ? LOGO_MAX_W : LOGO_MAX_W_BESIDE_PILL}
					fit={!!subtitle && !centered}
				/>
				{subtitle ? (
					<Text style={[styles.subtitle, centered && styles.nameCentered]} numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{!centered && right}
		</View>
	);
}

/** Rows grouped in one rounded card, hairlines between them. `textOnly`: rows without an icon
 *  tile — the hairline starts under the text instead of where a tile's text would */
export function SheetGroup({
	children,
	textOnly = false,
	translucent,
}: {
	children: ReactNode;
	textOnly?: boolean;
	/** Over sheet art (BottomSheet `background` / `art`): lets it show through faintly.
	 *  Default: on inside a sheet with art */
	translucent?: boolean;
}) {
	const overArt = useContext(SheetArtContext);
	const rows = React.Children.toArray(children).filter(Boolean);
	return (
		<View style={[styles.group, (translucent ?? overArt) && styles.groupTranslucent]}>
			{rows.map((row, i) => {
				// A collapsing row carries its own hairline, so the line folds away with it
				if (isValidElement(row) && row.type === SheetCollapse) {
					return cloneElement(row as React.ReactElement<SheetCollapseProps>, {
						key: i,
						separator: i > 0,
					});
				}
				return (
					<React.Fragment key={i}>
						{i > 0 && <View style={[styles.separator, textOnly && styles.separatorText]} />}
						{row}
					</React.Fragment>
				);
			})}
		</View>
	);
}

/** Row folding in / out: a morph on screen → ease-in-out (an ease-out front-loads ~80% of the
 *  travel into the first frames and read as a snap) */
const COLLAPSE = { duration: 280, easing: REasing.bezier(0.65, 0, 0.35, 1) };

interface SheetCollapseProps {
	open: boolean;
	children: ReactNode;
	/** Set by SheetGroup: draw the row's top hairline inside the collapsing part */
	separator?: boolean;
}

/**
 * A SheetGroup row that comes and goes (e.g. "Watched Once" from 3 watches up): height + fade
 * instead of the row — and the sheet with it — snapping. Stays mounted until it has closed.
 */
export function SheetCollapse({ open, children, separator = false }: SheetCollapseProps) {
	const [mounted, setMounted] = useState(open);
	// UI thread (Reanimated): height can't use RN's native driver, and a JS-driven height
	// stuttered — every frame round-tripped through JS
	const progress = useSharedValue(open ? 1 : 0);
	const height = useSharedValue(0);
	// Unmount only if it's still meant to be closed when the close lands: the drawer opens on
	// the last session's count for a frame, so a row can close (instantly, already at 0) and
	// reopen at once — the late "closed" callback then unmounted a row that should show
	const openRef = useRef(open);
	openRef.current = open;
	const unmountIfClosed = useCallback(() => {
		if (!openRef.current) setMounted(false);
	}, []);
	useEffect(() => {
		if (open) setMounted(true);
		progress.value = withTiming(open ? 1 : 0, COLLAPSE, (finished) => {
			if (finished && !open) runOnJS(unmountIfClosed)();
		});
	}, [open, progress, unmountIfClosed]);
	// Until measured: 0 tall (the content measures itself, absolutely placed)
	const style = useAnimatedStyle(() => ({
		height: height.value * progress.value,
		opacity: progress.value,
	}));
	if (!mounted) return null;
	return (
		<Reanimated.View style={[styles.collapse, style]}>
			<View
				style={styles.collapseContent}
				onLayout={(e) => {
					height.value = e.nativeEvent.layout.height;
				}}
			>
				{separator && <View style={styles.separator} />}
				{children}
			</View>
		</Reanimated.View>
	);
}

/** Icon tile (tinted), title + hint; scales a touch on press */
export function SheetOption({
	icon,
	color,
	title,
	hint,
	destructive = false,
	onPress,
}: {
	icon: React.ComponentProps<typeof Ionicons>["name"];
	color: `#${string}`;
	title: string;
	hint?: string;
	destructive?: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
		>
			<SheetIcon icon={icon} color={color} />
			<View style={styles.optionContent}>
				<Text style={[styles.optionText, destructive && styles.destructiveText]}>{title}</Text>
				{hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
			</View>
		</Pressable>
	);
}

export function SheetIcon({
	icon,
	color,
}: {
	icon: React.ComponentProps<typeof Ionicons>["name"];
	color: `#${string}`;
}) {
	return (
		<View style={[styles.iconTile, { backgroundColor: tint(color, 0.16) }]}>
			<Ionicons name={icon} size={20} color={color} />
		</View>
	);
}

export const sheetStyles = StyleSheet.create({
	/** Row layout for custom rows inside a SheetGroup (same metrics as SheetOption) */
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
	},
	rowContent: { flex: 1 },
	rowText: { ...typography.subtitle, fontSize: 15 },
	rowHint: { ...typography.caption, fontSize: 12, marginTop: 2 },
});

const styles = StyleSheet.create({
	root: { flex: 1, justifyContent: "flex-end" },
	backdrop: { backgroundColor: colors.overlayLight },
	sheet: {
		backgroundColor: colors.surface,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: spacing.lg,
	},
	// Taller than any upward pull gets (it's damped: √distance × 2)
	overpull: {
		position: "absolute",
		top: "100%",
		left: 0,
		right: 0,
		height: 400,
		backgroundColor: colors.surface,
	},
	background: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	handle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.textMuted,
		alignSelf: "center",
		marginTop: spacing.sm,
		marginBottom: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginBottom: spacing.lg,
	},
	headerText: { flex: 1, minWidth: 0 },
	// Logo + line: the tallest logo + the line, fixed (no resize while the logo loads), the
	// block centred in it — lines up with the square's middle
	headerTextFixed: { height: LOGO_MAX_H + SUBTITLE_GAP + SUBTITLE_LINE, justifyContent: "center" },
	headerStretch: { alignItems: "stretch" },
	// Square as tall as the logo + name column beside it (row stretches; width follows)
	epSquare: {
		aspectRatio: 1,
		borderRadius: 14,
		backgroundColor: colors.surfaceLight,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.sm,
		// Smooch Sans digits leave room under them — nudge the stack down
		paddingTop: 4,
	},
	epSquareTitle: {
		fontFamily: fonts.smoochMedium,
		fontSize: 14,
		letterSpacing: 1.5,
		color: colors.textSecondary,
	},
	// Inset, softer than the text: separates without competing
	epSquareRule: {
		alignSelf: "stretch",
		height: StyleSheet.hairlineWidth * 2,
		marginHorizontal: spacing.xs,
		marginVertical: 5,
		backgroundColor: colors.textMuted,
	},
	epSquarePrefix: { fontSize: 28 },
	epSquareValue: {
		fontFamily: fonts.smoochRegular,
		fontSize: 48,
		lineHeight: 50,
		color: colors.text,
		fontVariant: ["tabular-nums"],
	},
	// Fixed at the tallest a logo gets: the name / loading logo / logo all fill the same box
	logoSlot: { height: LOGO_MAX_H, justifyContent: "center", alignItems: "flex-start" },
	logoSlotCentered: { alignItems: "center" },
	logoSlotFit: { justifyContent: "flex-end" },
	nameCentered: { textAlign: "center" },
	// Full size while loading (so it decodes and reports its true shape), invisible, out of flow
	logoLoading: { position: "absolute", width: LOGO_MAX_W, height: LOGO_MIN_H, opacity: 0 },
	name: { ...typography.subtitle, fontSize: 18 },
	subtitle: {
		...typography.caption,
		fontSize: 13,
		lineHeight: SUBTITLE_LINE,
		color: colors.textSecondary,
		marginTop: SUBTITLE_GAP,
	},
	collapse: { overflow: "hidden" },
	collapseContent: { position: "absolute", top: 0, left: 0, right: 0 },
	// surfaceLight (#252525) at 80%: the art reads through, the text stays on a solid enough ground
	groupTranslucent: { backgroundColor: "rgba(37, 37, 37, 0.8)" },
	group: {
		backgroundColor: colors.surfaceLight,
		borderRadius: 14,
		overflow: "hidden",
	},
	separator: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: colors.border,
		// Starts under the text, not the icon tile
		marginLeft: spacing.md + 36 + spacing.md,
	},
	separatorText: { marginLeft: spacing.md },
	option: sheetStyles.row,
	optionPressed: { backgroundColor: colors.border, transform: [{ scale: 0.98 }] },
	optionContent: sheetStyles.rowContent,
	optionText: sheetStyles.rowText,
	optionHint: sheetStyles.rowHint,
	destructiveText: { color: colors.destructiveRed },
	iconTile: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
});
