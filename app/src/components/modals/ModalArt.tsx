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
 *  the popup (no side padding); `paused` lays a big translucent pause icon over all of it.
 *  ConfirmModal pulls it up to the popup's top edge and passes its title as `heading` */
export function ModalBackdrop({
	backdropPath,
	logoPath: givenLogo,
	tmdbId,
	mediaType,
	title,
	paused = false,
	nameDelay = 0,
	heading,
}: {
	backdropPath: string;
	logoPath?: string | null;
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
	/** Wait this long (ms) for the logo before showing the name — 0: name right away */
	nameDelay?: number;
	/** Popup title over the top (set by ConfirmModal) */
	heading?: string;
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
	const w = useContentWidth() + spacing.lg * 2;
	const h = (w * 9) / 16;
	// Skeleton until the banner image is in; its overlays come in with it
	const [loaded, setLoaded] = useState(false);
	return (
		<View style={[styles.backdrop, { width: w, height: h }]}>
			<Image
				source={{ uri: tmdbBackdropUri(backdropPath, CONTENT_W) }}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
				onLoad={() => setLoaded(true)}
				onError={() => setLoaded(true)}
			/>
			{!loaded && <SkeletonLine width={w} height={h} style={styles.backdropSkeleton} />}
			{loaded && (
				<>
					{/* Darkens the bottom so the logo reads on any backdrop */}
					<LinearGradient
						colors={["transparent", "rgba(0,0,0,0.85)"]}
						style={styles.backdropShade}
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
					{paused && (
						<View style={styles.backdropPause} pointerEvents="none">
							<PauseBars size={h - PAUSE_INSET * 2} />
						</View>
					)}
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
	backdropName: {
		...typography.title,
		fontSize: 20,
		fontWeight: "800",
		textAlign: "center",
		color: colors.text,
	},
});
