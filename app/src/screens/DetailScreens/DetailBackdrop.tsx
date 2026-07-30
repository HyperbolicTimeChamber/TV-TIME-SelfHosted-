import React from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { colors, spacing, backdropSize, posterSize } from "../../theme";

const BACKDROP_HEIGHT = 350;

interface Props {
	backdropPath: string | null;
	posterPath: string | null;
	imageTranslateY: number;
	children: React.ReactNode;
}

export default function DetailBackdrop({ backdropPath, posterPath, imageTranslateY, children }: Props) {
	return (
		<>
			<View style={[styles.backdrop, { height: BACKDROP_HEIGHT }]}>
				<View style={[StyleSheet.absoluteFill, styles.backdropSkeleton]} />
				<Image
					source={{
						uri: backdropPath
							? `${backdropSize.medium}${backdropPath}`
							: `${posterSize.large}${posterPath}`,
					}}
					style={[StyleSheet.absoluteFill, { transform: [{ translateY: imageTranslateY }] }]}
					contentFit="cover"
					transition={300}
				/>
			</View>

			<LinearGradient
				colors={["transparent", "rgba(13,13,13,0.7)", colors.background]}
				locations={[0, 0.6, 0.9]}
				style={[styles.gradientIsland, { marginTop: -280 }]}
			>
				<BlurView intensity={15} tint="light" style={styles.island}>
					{children}
				</BlurView>
			</LinearGradient>
		</>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		overflow: "hidden",
	},
	backdropSkeleton: {
		backgroundColor: colors.surfaceLight,
	},
	gradientIsland: {
		paddingHorizontal: spacing.lg,
		paddingTop: 180,
		paddingBottom: spacing.md,
	},
	island: {
		backgroundColor: "rgba(0,0,0,0.25)",
		borderRadius: 20,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.lg,
		overflow: "hidden",
	},
});
