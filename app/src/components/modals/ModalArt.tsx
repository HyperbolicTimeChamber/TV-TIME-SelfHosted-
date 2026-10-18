import React, { useState } from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";
import { tmdbLogoUri, tmdbPosterUri } from "../../hooks/useTmdbImage";
import { colors, typography } from "../../theme";

/** Art for ConfirmModal's image slot (between the title and the hint) */

/** "Whoa there Speedster!" — skipped-ahead popups */
export const SPEEDSTER_ART = require("../../../assets/speedster.webp");
const SPEEDSTER_RATIO = 568 / 480;

const ART_H = 140;
const LOGO_MAX_W = 240;
const LOGO_MAX_H = 90;
const BADGE = 36;
/** Share of the pause badge that sits outside the logo (the rest overlaps it) */
const BADGE_OUT = 0.35;
const POSTER_H = 150;

/** Bootstrap's BsFillPauseCircleFill in pause blue, the bars filled white */
function PauseBadge({ style }: { style?: ViewStyle }) {
	return (
		<View style={style} pointerEvents="none">
			<Svg width={BADGE} height={BADGE} viewBox="0 0 16 16">
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

/** Static character art, fit to the slot */
export function ModalArt({ source, ratio = SPEEDSTER_RATIO }: { source: number; ratio?: number }) {
	return (
		<Image source={source} style={{ height: ART_H, width: ART_H * ratio }} contentFit="contain" />
	);
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

/** A season (or show) poster */
export function ModalPoster({ posterPath }: { posterPath: string }) {
	return (
		<Image
			source={{ uri: tmdbPosterUri(posterPath, (POSTER_H * 2) / 3) }}
			style={styles.poster}
			contentFit="cover"
		/>
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
	poster: {
		height: POSTER_H,
		width: (POSTER_H * 2) / 3,
		borderRadius: 8,
		backgroundColor: colors.surfaceLight,
	},
});
