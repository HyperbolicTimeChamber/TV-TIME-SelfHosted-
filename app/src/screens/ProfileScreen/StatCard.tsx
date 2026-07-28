import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { colors, backdropSize } from "../../theme";
import { styles, BLUR_RADIUS } from "./styles";

interface Props {
	value: string | number;
	label: string;
	flex: number;
	backdrop?: string | null;
	align?: "left" | "right";
	loading?: boolean;
}

export default function StatCard({
	value,
	label,
	flex,
	backdrop,
	align = "left",
	loading = false,
}: Readonly<Props>) {
	const side = align === "right" ? "flex-end" : "flex-start";
	return (
		<View style={[styles.statCard, { flex, alignItems: side }]}>
			{backdrop && (
				<Image
					source={{ uri: `${backdropSize.medium}${backdrop}` }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					blurRadius={BLUR_RADIUS}
				/>
			)}
			{backdrop && <View style={[StyleSheet.absoluteFill, styles.statCardOverlay]} />}
			<Text style={styles.statLabel}>{label}</Text>
			{loading ? (
				<ActivityIndicator size="small" color={colors.primary} style={styles.statLoader} />
			) : (
				<Text style={styles.statNumber}>{value}</Text>
			)}
		</View>
	);
}
