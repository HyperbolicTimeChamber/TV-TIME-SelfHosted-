import React, { useState } from "react";
import { View, Text, StyleSheet, useWindowDimensions, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import { tmdbBackdropUri, tmdbLogoUri } from "../../hooks/useTmdbImage";
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
/** Centre pause icon on a paused backdrop */
const PAUSE_CENTER = 56;
/** Logo strip at the bottom of a backdrop (logo height + bottom inset) */
const BACKDROP_LOGO_H = 48;
const BACKDROP_LOGO_BOTTOM = 10;

/** Bootstrap's BsFillPauseCircleFill in pause blue, the bars filled white */
function PauseBadge({ style, size = BADGE }: { style?: ViewStyle; size?: number }) {
	return (
		<View style={style} pointerEvents="none">
			<Svg width={size} height={size} viewBox="0 0 16 16">
				<Circle cx={8} cy={8} r={6} fill={colors.text} />
				<Path
					fill={colors.stopBlue}
					d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M6.25 5C5.56 5 5 5.56 5 6.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C7.5 5.56 6.94 5 6.25 5m3.5 0c-.69 0-1.25.56-1.25 1.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C11 5.56 10.44 5 9.75 5"
				/>
			</Svg>
		</View>
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
	logoPath,
	title,
	paused = false,
}: {
	logoPath?: string | null;
	title: string;
	paused?: boolean;
}) {
	// Logo's own width / height, so the box (and the badge's corner) hugs the visible logo
	const [ratio, setRatio] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);

	if (!logoPath || failed) {
		return (
			<View style={[styles.nameBox, paused && { marginBottom: BADGE * BADGE_OUT }]}>
				<Text style={styles.name} numberOfLines={2}>
					{title}
				</Text>
				{paused && <PauseBadge style={badgeCorner} />}
			</View>
		);
	}
	const w = ratio ? Math.min(LOGO_MAX_W, LOGO_MAX_H * ratio) : LOGO_MAX_W;
	const h = ratio ? w / ratio : LOGO_MAX_H;
	return (
		// Room under the logo for the part of the badge hanging below it
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
	);
}

/** Show backdrop with its title logo (name as the fallback) over the bottom; `paused` adds a
 *  pause icon in the middle of the space above the logo */
export function ModalBackdrop({
	backdropPath,
	logoPath,
	title,
	paused = false,
}: {
	backdropPath: string;
	logoPath?: string | null;
	title: string;
	paused?: boolean;
}) {
	const [logoFailed, setLogoFailed] = useState(false);
	return (
		<View style={styles.backdrop}>
			<Image
				source={{ uri: tmdbBackdropUri(backdropPath, CONTENT_W) }}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
			/>
			{/* Darkens the bottom so the logo reads on any backdrop */}
			<LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.backdropShade} />
			{paused && (
				<View style={styles.backdropPause} pointerEvents="none">
					<PauseBadge size={PAUSE_CENTER} />
				</View>
			)}
			<View style={styles.backdropLogo}>
				{logoPath && !logoFailed ? (
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
		</View>
	);
}

const styles = StyleSheet.create({
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
		width: "100%",
		aspectRatio: 16 / 9,
		borderRadius: 8,
		overflow: "hidden",
		backgroundColor: colors.surfaceLight,
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
	// Centred in the space above the logo strip, so the logo never sits under it
	backdropPause: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: BACKDROP_LOGO_H + BACKDROP_LOGO_BOTTOM,
		alignItems: "center",
		justifyContent: "center",
	},
	backdropName: {
		...typography.title,
		fontSize: 20,
		fontWeight: "800",
		textAlign: "center",
		color: colors.text,
	},
});
