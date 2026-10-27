import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from "react-native";
import { Image } from "expo-image";
import { colors } from "../../theme";
import { tmdbBackdropUri } from "../../hooks/useTmdbImage";
import { useCountUp } from "../../hooks/useCountUp";
import { styles, BLUR_RADIUS } from "./styles";
import StatLabel from "./StatLabel";

interface Props {
	value: number;
	/** Applied to every counted frame, so the card keeps its "26.1K" / "1y 265d" shape */
	format: (value: number) => string;
	/** Count up from zero (the Profile screen's first appearance after launch) */
	countUp?: boolean;
	label: string;
	flex: number;
	backdrop?: string | null;
	align?: "left" | "right";
	loading?: boolean;
}

export default function StatCard({
	value,
	format,
	countUp = false,
	label,
	flex,
	backdrop,
	align = "left",
	loading = false,
}: Readonly<Props>) {
	const side = align === "right" ? "flex-end" : "flex-start";
	const shown = useCountUp(value, countUp);
	return (
		<View style={[styles.statCard, { flex, alignItems: side }]}>
			{backdrop && (
				<Image
					source={{ uri: tmdbBackdropUri(backdrop, Dimensions.get("window").width / 2) }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					blurRadius={BLUR_RADIUS}
				/>
			)}
			{backdrop && <View style={[StyleSheet.absoluteFill, styles.statCardOverlay]} />}
			<StatLabel label={label} />
			{loading ? (
				<ActivityIndicator size="small" color={colors.text} style={styles.statLoader} />
			) : (
				<Text style={styles.statNumber}>{format(shown)}</Text>
			)}
		</View>
	);
}
