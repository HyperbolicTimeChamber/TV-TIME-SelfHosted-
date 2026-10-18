import React, { useState } from "react";
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
/** Log Out — Straw Hats, fists up */
export const LOGOUT_ART = require("../../../assets/logout.webp");
export const LOGOUT_RATIO = 900 / 397;
/** Delete Account — crying Pikachu */
export const FAREWELL_ART = require("../../../assets/farewell.webp");
export const FAREWELL_RATIO = 762 / 480;

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
}: {
	logoPath?: string | null;
	/** Lets a title with no cached logo (not in the library) fetch it from TMDB */
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	// Logo's own width / height, so the box (and the badge's corner) hugs the visible logo
	const [ratio, setRatio] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	// Fixed-height slot (tallest logo + the badge overhang): the popup keeps one size while the
	// logo is fetched / loaded, whether it ends up a logo, the name, or nothing
	const slot = [styles.logoSlot, { minHeight: LOGO_MAX_H + (paused ? BADGE * BADGE_OUT : 0) }];

	if (logoPath === undefined) return <View style={slot} />;
	if (!logoPath || failed) {
		return (
			<View style={slot}>
				<View style={[styles.nameBox, paused && { marginBottom: BADGE * BADGE_OUT }]}>
					<Text style={styles.name} numberOfLines={2}>
						{title}
					</Text>
					{paused && <PauseBadge style={badgeCorner} />}
				</View>
			</View>
		);
	}
	const w = ratio ? Math.min(LOGO_MAX_W, LOGO_MAX_H * ratio) : LOGO_MAX_W;
	const h = ratio ? w / ratio : LOGO_MAX_H;
	return (
		<View style={slot}>
			{/* Room under the logo for the part of the badge hanging below it */}
			<View style={{ width: w, height: h, marginBottom: paused ? BADGE * BADGE_OUT : 0 }}>
				<Image
					source={{ uri: tmdbLogoUri(logoPath, LOGO_MAX_W) }}
					style={{ width: w, height: h }}
					contentFit="contain"
					onLoad={(e) => setRatio(e.source.width / e.source.height)}
					onError={() => setFailed(true)}
				/>
				{paused && ratio != null && <PauseBadge style={badgeCorner} />}
			</View>
		</View>
	);
}

/** Show backdrop with its title logo (name as the fallback) over the bottom, edge to edge across
 *  the popup (no side padding); `paused` lays a big translucent pause icon over all of it */
export function ModalBackdrop({
	backdropPath,
	logoPath: givenLogo,
	tmdbId,
	mediaType,
	title,
	paused = false,
}: {
	backdropPath: string;
	logoPath?: string | null;
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [logoFailed, setLogoFailed] = useState(false);
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
						{logoPath === undefined ? null : logoPath && !logoFailed ? (
							<Image
								source={{ uri: tmdbLogoUri(logoPath, CONTENT_W * 0.6) }}
								style={styles.backdropLogoImg}
								contentFit="contain"
								onError={() => setLogoFailed(true)}
							/>
						) : (
							<Text style={styles.backdropName} numberOfLines={2}>
								{title}
							</Text>
						)}
					</View>
					{paused && (
						<View style={styles.backdropPause} pointerEvents="none">
							<PauseBars size={h - PAUSE_INSET * 2} />
						</View>
					)}
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
