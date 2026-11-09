import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, useWindowDimensions, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { tmdbBackdropUri, tmdbLogoUri } from "../../hooks/useTmdbImage";
import { useTitleLogo } from "../../hooks/useTitleLogo";
import SkeletonLine from "../SkeletonLine";
import type { MediaType } from "../../types";
import { colors, spacing, typography } from "../../theme";

/** Art for ConfirmModal's image slot (between the title and the hint) */

/** "Whoa there Speedster!" — skipped-ahead popups */
export const SPEEDSTER_ART = require("../../../assets/speedster.webp");
export const SPEEDSTER_RATIO = 568 / 480;
/** Rewatch floor hit — Mr. Mime, palms on the invisible wall */
export const HIT_A_WALL_ART = require("../../../assets/hit-a-wall.webp");
export const HIT_A_WALL_RATIO = 1;
/** Log Out — Straw Hats, fists up */
export const LOGOUT_ART = require("../../../assets/logout.webp");
export const LOGOUT_RATIO = 900 / 397;
/** Delete Account — crying Pikachu */
export const FAREWELL_ART = require("../../../assets/farewell.webp");
export const FAREWELL_RATIO = 666 / 420;
/** New List — Light Yagami, Death Note in hand */
export const NEW_LIST_ART = require("../../../assets/new-list.webp");
export const NEW_LIST_RATIO = 600 / 499;
/** Import this file? — Luffy, dreaming of meat */
export const IMPORT_CONFIRM_ART = require("../../../assets/import-confirm.webp");
export const IMPORT_CONFIRM_RATIO = 423 / 447;
/** Import complete — Luffy, stuffed after a feast */
export const IMPORT_DONE_ART = require("../../../assets/import-done.webp");
export const IMPORT_DONE_RATIO = 652 / 501;
/** Import had nothing new — Luffy, unimpressed */
export const IMPORT_NOTHING_ART = require("../../../assets/import-nothing.webp");
export const IMPORT_NOTHING_RATIO = 682 / 763;
/** Before an import — Luffy, not so sure about this */
export const IMPORT_WARNING_ART = require("../../../assets/import-warning.webp");
export const IMPORT_WARNING_RATIO = 467 / 537;
/** Import cancelled, all put back — Luffy, sulking */
export const IMPORT_CANCELLED_ART = require("../../../assets/import-cancelled.webp");
export const IMPORT_CANCELLED_RATIO = 700 / 744;
/** Couldn't add — Yamcha, down for the count */
export const DEFEATED_ART = require("../../../assets/defeated.webp");
export const DEFEATED_RATIO = 557 / 709;

const ART_H = 140;
const LOGO_MAX_W = 240;
const LOGO_MAX_H = 90;
const BADGE = 36;
/** Share of the pause badge that sits outside the logo (the rest overlaps it) */
const BADGE_OUT = 0.35;
/** Popup content width (modal minus padding) — image request size */
const CONTENT_W = 300;
/** Gap above and below the big pause icon on a paused backdrop */
const PAUSE_INSET = 12;
/** Big pause icon on a paused backdrop — translucent, the backdrop shows through */
const PAUSE_OPACITY = 0.6;
/** Gray wash over the whole backdrop when it's paused */
const PAUSE_MASK = "rgba(160, 160, 160, 0.45)";
/** Red wash over the whole backdrop when it's being removed */
const REMOVE_MASK = "rgba(229, 9, 20, 0.45)";
/** The cross is bulkier than the pause bars: it takes this share of the free height */
const REMOVE_ICON_SCALE = 0.6;
/** IcoMoon's ImCross (react-icons/im), 16×16 */
const IM_CROSS_PATH =
	"M15.854 12.854c-0-0-0-0-0-0l-4.854-4.854 4.854-4.854c0-0 0-0 0-0 0.052-0.052 0.090-0.113 0.114-0.178 0.066-0.178 0.028-0.386-0.114-0.529l-2.293-2.293c-0.143-0.143-0.351-0.181-0.529-0.114-0.065 0.024-0.126 0.062-0.178 0.114 0 0-0 0-0 0l-4.854 4.854-4.854-4.854c-0-0-0-0-0-0-0.052-0.052-0.113-0.090-0.178-0.114-0.178-0.066-0.386-0.029-0.529 0.114l-2.293 2.293c-0.143 0.143-0.181 0.351-0.114 0.529 0.024 0.065 0.062 0.126 0.114 0.178 0 0 0 0 0 0l4.854 4.854-4.854 4.854c-0 0-0 0-0 0-0.052 0.052-0.090 0.113-0.114 0.178-0.066 0.178-0.029 0.386 0.114 0.529l2.293 2.293c0.143 0.143 0.351 0.181 0.529 0.114 0.065-0.024 0.126-0.062 0.178-0.114 0-0 0-0 0-0l4.854-4.854 4.854 4.854c0 0 0 0 0 0 0.052 0.052 0.113 0.090 0.178 0.114 0.178 0.066 0.386 0.029 0.529-0.114l2.293-2.293c0.143-0.143 0.181-0.351 0.114-0.529-0.024-0.065-0.062-0.126-0.114-0.178z";
/** Dark shade behind a title laid over the top of a backdrop */
const BACKDROP_HEADING_SHADE = "45%";
/** Logo strip at the bottom of a backdrop (logo height + bottom inset) */
const BACKDROP_LOGO_H = 48;
const BACKDROP_LOGO_BOTTOM = 10;

/** Heroicons' HiPauseCircle in gray, the bars filled black */
function PauseBadge({ style, size = BADGE }: { style?: ViewStyle; size?: number }) {
	return (
		<View style={style} pointerEvents="none">
			<Svg width={size} height={size} viewBox="2.25 2.25 19.5 19.5">
				<Circle cx={12} cy={12} r={6.5} fill={colors.background} />
				<Path
					fillRule="evenodd"
					clipRule="evenodd"
					fill={colors.textSecondary}
					d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z"
				/>
			</Svg>
		</View>
	);
}

/** Two black pause bars (no circle), larger and closer together than HiPauseCircle's — the big
 *  icon on a paused backdrop */
function PauseBars({ size }: { size: number }) {
	return (
		<Svg width={size} height={size} viewBox="0 0 100 100">
			<Rect
				x={26}
				y={22}
				width={20}
				height={56}
				rx={5}
				fill={colors.background}
				opacity={PAUSE_OPACITY}
			/>
			<Rect
				x={54}
				y={22}
				width={20}
				height={56}
				rx={5}
				fill={colors.background}
				opacity={PAUSE_OPACITY}
			/>
		</Svg>
	);
}

/** ImCross in the pause bars' colour — the big icon on a backdrop being removed */
function RemoveCross({ size }: { size: number }) {
	return (
		<Svg width={size} height={size} viewBox="0 0 16 16">
			<Path d={IM_CROSS_PATH} fill={colors.background} opacity={PAUSE_OPACITY} />
		</Svg>
	);
}

const badgeCorner: ViewStyle = {
	position: "absolute",
	right: -BADGE * BADGE_OUT,
	bottom: -BADGE * BADGE_OUT,
};

/** Popup content width: AnimatedModal's dialog (80%, max 320) minus ConfirmModal's padding */
const useContentWidth = () => Math.min(useWindowDimensions().width * 0.8, 320) - spacing.lg * 2;

/** Static character art: 140pt tall, or the popup's full width for wide art (no letterboxing) */
export function ModalArt({ source, ratio }: { source: number; ratio: number }) {
	const w = Math.min(ART_H * ratio, useContentWidth());
	return <Image source={source} style={{ width: w, height: w / ratio }} contentFit="contain" />;
}

/** The show / movie title logo (TMDB), its name when there's none; optional pause badge */
export function ModalLogo({
	logoPath: givenLogo,
	tmdbId,
	mediaType,
	title,
	paused = false,
	nameDelay = 0,
}: {
	logoPath?: string | null;
	/** Lets a title with no cached logo (not in the library) fetch it from TMDB */
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
	/** Wait this long (ms) for the logo before showing the name — 0: name right away */
	nameDelay?: number;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	// Logo's own width / height, so the box (and the badge's corner) hugs the visible logo
	const [ratio, setRatio] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	const [waited, setWaited] = useState(nameDelay <= 0);
	useEffect(() => {
		if (nameDelay <= 0) return;
		const t = setTimeout(() => setWaited(true), nameDelay);
		return () => clearTimeout(t);
	}, [nameDelay]);
	// Fixed-height slot (tallest logo + the badge overhang): the popup keeps one size while the
	// logo is fetched / loaded. The name shows until the logo image is actually in
	const slot = [styles.logoSlot, { minHeight: LOGO_MAX_H + (paused ? BADGE * BADGE_OUT : 0) }];
	const name = (
		<View style={[styles.nameBox, paused && { marginBottom: BADGE * BADGE_OUT }]}>
			<Text style={styles.name} numberOfLines={2}>
				{title}
			</Text>
			{paused && <PauseBadge style={badgeCorner} />}
		</View>
	);

	// Known to have no logo (or it failed): the name straight away
	if (logoPath === null || failed) return <View style={slot}>{name}</View>;
	// Still on its way: the name only once nameDelay has passed
	if (logoPath === undefined) return <View style={slot}>{waited && name}</View>;
	if (ratio == null) {
		return (
			<View style={slot}>
				{waited && name}
				{/* Loads invisibly; swaps in for the name once it has its size */}
				<Image
					source={{ uri: tmdbLogoUri(logoPath, LOGO_MAX_W) }}
					style={styles.logoLoading}
					onLoad={(e) => setRatio(e.source.width / e.source.height)}
					onError={() => setFailed(true)}
				/>
			</View>
		);
	}
	const w = Math.min(LOGO_MAX_W, LOGO_MAX_H * ratio);
	const h = w / ratio;
	return (
		<View style={slot}>
			{/* Room under the logo for the part of the badge hanging below it */}
			<View style={{ width: w, height: h, marginBottom: paused ? BADGE * BADGE_OUT : 0 }}>
				<Image
					source={{ uri: tmdbLogoUri(logoPath, LOGO_MAX_W) }}
					style={{ width: w, height: h }}
					contentFit="contain"
				/>
				{paused && <PauseBadge style={badgeCorner} />}
			</View>
		</View>
	);
}

/** Show backdrop with its title logo (name as the fallback) over the bottom, edge to edge across
 *  the popup (no side padding); `paused` lays a big translucent pause icon over all of it,
 *  `removed` a red wash with a cross (removing it from tracking).
 *  ConfirmModal pulls it up to the popup's top edge and passes its title as `heading` */
export function ModalBackdrop({
	backdropPath,
	logoPath: givenLogo,
	tmdbId,
	mediaType,
	title,
	paused = false,
	removed = false,
	fadeTo,
	nameDelay = 0,
	heading,
	width,
}: {
	backdropPath: string;
	logoPath?: string | null;
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
	removed?: boolean;
	/** Fade the bottom into this colour (a drawer's surface, as the info drawer's art) instead of
	 *  a dark shade */
	fadeTo?: string;
	/** Wait this long (ms) for the logo before showing the name — 0: name right away */
	nameDelay?: number;
	/** Popup title over the top (set by ConfirmModal) */
	heading?: string;
	/** Banner width (a drawer's content width); default: the popup's full width */
	width?: number;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [logoFailed, setLogoFailed] = useState(false);
	const [logoLoaded, setLogoLoaded] = useState(false);
	const [waited, setWaited] = useState(nameDelay <= 0);
	useEffect(() => {
		if (nameDelay <= 0) return;
		const t = setTimeout(() => setWaited(true), nameDelay);
		return () => clearTimeout(t);
	}, [nameDelay]);
	// Known to have no logo (or it failed): the name straight away; still coming: after nameDelay
	const showName = logoPath === null || logoFailed || (!logoLoaded && waited);
	// Bleeds over ConfirmModal's side padding
	const popupW = useContentWidth() + spacing.lg * 2;
	const w = width ?? popupW;
	const h = (w * 9) / 16;
	// Skeleton until the banner image is in; its overlays come in with it
	const [loaded, setLoaded] = useState(false);
	// Pause bars on a gray wash / a cross on a red one, over the whole banner
	const overlay = (
		<>
			{paused && (
				<View style={styles.backdropPause} pointerEvents="none">
					<PauseBars size={h - PAUSE_INSET * 2} />
				</View>
			)}
			{removed && (
				<View style={[styles.backdropPause, styles.backdropRemove]} pointerEvents="none">
					<RemoveCross size={(h - PAUSE_INSET * 2) * REMOVE_ICON_SCALE} />
				</View>
			)}
		</>
	);
	return (
		<View style={[styles.backdrop, { width: w, height: h }]}>
			<Image
				source={{ uri: tmdbBackdropUri(backdropPath, w) }}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
				onLoad={() => setLoaded(true)}
				onError={() => setLoaded(true)}
			/>
			{!loaded && <SkeletonLine width={w} height={h} style={styles.backdropSkeleton} />}
			{loaded && (
				<>
					{/* In a drawer the wash goes under the fade: the art still melts into the sheet */}
					{fadeTo && overlay}
					{/* Darkens the bottom so the logo reads on any backdrop — or fades it into the drawer */}
					<LinearGradient
						colors={["transparent", fadeTo ?? "rgba(0,0,0,0.85)"]}
						style={fadeTo ? styles.backdropFade : styles.backdropShade}
					/>
					<View style={styles.backdropLogo}>
						{/* Name until the logo image is in (or when there's none) */}
						{showName && (
							<Text style={styles.backdropName} numberOfLines={2}>
								{title}
							</Text>
						)}
						{!!logoPath && !logoFailed && (
							<Image
								source={{ uri: tmdbLogoUri(logoPath, CONTENT_W * 0.6) }}
								style={[styles.backdropLogoImg, !logoLoaded && styles.hiddenWhileLoading]}
								contentFit="contain"
								onLoad={() => setLogoLoaded(true)}
								onError={() => setLogoFailed(true)}
							/>
						)}
					</View>
					{!fadeTo && overlay}
				</>
			)}
			{/* Title on a top shade (mirrors the logo's bottom one), there from the skeleton on */}
			{!!heading && (
				<>
					<LinearGradient
						colors={["rgba(0,0,0,0.85)", "transparent"]}
						style={styles.backdropHeadingShade}
						pointerEvents="none"
					/>
					<Text style={styles.backdropHeading} pointerEvents="none">
						{heading}
					</Text>
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	logoSlot: {
		justifyContent: "center",
		alignItems: "center",
	},
	// Loading logo: full size (so it decodes at a real size and reports its true shape) but
	// invisible and out of the flow
	logoLoading: {
		position: "absolute",
		width: LOGO_MAX_W,
		height: LOGO_MAX_H,
		opacity: 0,
	},
	hiddenWhileLoading: {
		position: "absolute",
		opacity: 0,
	},
	nameBox: {
		maxWidth: LOGO_MAX_W,
		paddingVertical: 4,
	},
	name: {
		...typography.title,
		fontSize: 26,
		lineHeight: 30,
		fontWeight: "800",
		textAlign: "center",
		color: colors.text,
	},
	backdrop: {
		overflow: "hidden",
		backgroundColor: colors.surfaceLight,
	},
	backdropSkeleton: {
		position: "absolute",
		top: 0,
		left: 0,
		borderRadius: 0,
	},
	// Into the drawer's surface (info drawer imageGradient): a touch past the edge, no seam
	backdropFade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: -1,
		height: "70%",
	},
	backdropShade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "60%",
	},
	backdropHeadingShade: {
		position: "absolute",
		left: 0,
		right: 0,
		top: 0,
		height: BACKDROP_HEADING_SHADE,
	},
	// ConfirmModal's title type, on the backdrop's top
	backdropHeading: {
		...typography.subtitle,
		position: "absolute",
		top: spacing.md,
		left: spacing.lg,
		right: spacing.lg,
		fontSize: 16,
		textAlign: "center",
		color: colors.text,
	},
	backdropLogo: {
		position: "absolute",
		left: 12,
		right: 12,
		bottom: BACKDROP_LOGO_BOTTOM,
		alignItems: "center",
	},
	backdropLogoImg: {
		width: "60%",
		height: BACKDROP_LOGO_H,
	},
	// Gray wash over the whole backdrop (logo included), the bars centred on it
	backdropPause: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: PAUSE_MASK,
	},
	backdropRemove: { backgroundColor: REMOVE_MASK },
	backdropName: {
		...typography.title,
		fontSize: 20,
		fontWeight: "800",
		textAlign: "center",
		color: colors.text,
	},
});
