import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { colors } from "../../theme";
import { tmdbPosterUri } from "../../hooks/useTmdbImage";
import { styles, BLUR_RADIUS } from "./styles";

const POSTER_W = 55;
const POSTER_H = 82;
const SCATTER_THRESHOLD = 10;

interface PosterLayout {
	left: number;
	top: number;
	rotate: number;
	zIndex: number;
}

function generateLayout(count: number, seed: number): PosterLayout[] {
	let s = seed;
	const rand = () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return (s % 1000) / 1000;
	};

	const cols = Math.ceil(Math.sqrt(count * 1.5));
	const rows = Math.ceil(count / cols);
	const cellW = 100 / cols;
	const cellH = 100 / rows;

	const layouts: PosterLayout[] = [];
	for (let i = 0; i < count; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		layouts.push({
			left: col * cellW * 1.1 + rand() * cellW * 0.3 - 10,
			top: row * cellH + rand() * cellH * 0.5 - 15,
			rotate: rand() * 24 - 12,
			zIndex: Math.floor(rand() * count),
		});
	}
	return layouts;
}

interface Props {
	value: string | number;
	label: string;
	flex: number;
	posters?: string[];
	align?: "left" | "right";
	loading?: boolean;
	seed?: number;
}

export default function CollageCard({
	value,
	label,
	flex,
	posters = [],
	align = "left",
	loading = false,
	seed = 42,
}: Readonly<Props>) {
	const side = align === "right" ? "flex-end" : "flex-start";
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
			<Text style={styles.statLabel}>{label}</Text>
			{loading ? (
				<ActivityIndicator size="small" color={colors.primary} style={styles.statLoader} />
			) : (
				<Text style={styles.statNumber}>{value}</Text>
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
