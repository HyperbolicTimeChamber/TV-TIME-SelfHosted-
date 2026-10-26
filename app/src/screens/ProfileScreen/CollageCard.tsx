import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { colors } from "../../theme";
import { tmdbPosterUri } from "../../hooks/useTmdbImage";
import { useCountUp } from "../../hooks/useCountUp";
import { styles, BLUR_RADIUS } from "./styles";
import StatLabel from "./StatLabel";
import { generateCollageLayout as generateLayout } from "../../utils";

const POSTER_W = 55;
const POSTER_H = 82;
const SCATTER_THRESHOLD = 10;

interface Props {
	value: number;
	/** Applied to every counted frame, so the card keeps its "26.1K" / "1y 265d" shape */
	format: (value: number) => string;
	/** Count up from zero (the Profile screen's first appearance after launch) */
	countUp?: boolean;
	label: string;
	flex: number;
	posters?: string[];
	align?: "left" | "right";
	loading?: boolean;
	seed?: number;
}

export default function CollageCard({
	value,
	format,
	countUp = false,
	label,
	flex,
	posters = [],
	align = "left",
	loading = false,
	seed = 42,
}: Readonly<Props>) {
	const side = align === "right" ? "flex-end" : "flex-start";
	const shown = useCountUp(value, countUp);
	const isScattered = posters.length >= SCATTER_THRESHOLD;
	const layouts = useMemo(
		() => (isScattered ? generateLayout(posters.length, seed) : []),
		[posters.length, seed, isScattered],
	);

	return (
		<View style={[styles.statCard, { flex, alignItems: side }]}>
			{posters.length > 0 &&
				(isScattered ? (
					<View style={[StyleSheet.absoluteFill, local.container]}>
						{posters.map((p, i) => {
							const l = layouts[i];
							return (
								<Image
									key={i}
									source={{ uri: tmdbPosterUri(p, POSTER_W) }}
									style={[
										local.scatterPoster,
										{
											left: `${l.left}%` as any,
											top: `${l.top}%` as any,
											transform: [{ rotate: `${l.rotate}deg` }],
											zIndex: l.zIndex,
										},
									]}
									contentFit="cover"
								/>
							);
						})}
					</View>
				) : (
					<View style={[StyleSheet.absoluteFill, local.gridContainer]}>
						{posters.map((p, i) => {
							const cols =
								posters.length <= 2
									? posters.length
									: posters.length <= 5
										? Math.ceil(posters.length / 2)
										: 3;
							const rows = Math.ceil(posters.length / cols);
							return (
								<Image
									key={i}
									source={{ uri: tmdbPosterUri(p, POSTER_W) }}
									style={{ width: `${100 / cols}%` as any, height: `${100 / rows}%` as any }}
									contentFit="cover"
									blurRadius={BLUR_RADIUS}
								/>
							);
						})}
					</View>
				))}
			{posters.length > 0 && <View style={[StyleSheet.absoluteFill, styles.statCardOverlay]} />}
			<StatLabel label={label} />
			{loading ? (
				<ActivityIndicator size="small" color={colors.text} style={styles.statLoader} />
			) : (
				<Text style={styles.statNumber}>{format(shown)}</Text>
			)}
		</View>
	);
}

const local = StyleSheet.create({
	container: {
		overflow: "hidden",
	},
	scatterPoster: {
		position: "absolute",
		width: POSTER_W,
		height: POSTER_H,
		borderRadius: 3,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.15)",
	},
	gridContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		overflow: "hidden",
	},
	gridPoster: {
		width: "33.33%",
		height: "50%",
	},
});
