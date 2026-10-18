import React, { useState } from "react";
import { View, Animated, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import Reanimated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSharedShimmer } from "../../components/SkeletonLine";
import { colors, spacing } from "../../theme";
import { tmdbBackdropUri, tmdbPosterUri } from "../../hooks/useTmdbImage";

const SCREEN_WIDTH = Dimensions.get("window").width;

const BACKDROP_HEIGHT = 350;
/** How far the title island rides up over the image — also the fade's height */
const ISLAND_OVERLAP = 280;

interface Props {
	backdropPath: string | null;
	posterPath: string | null;
	/** Parallax offset (UI thread) */
	imageTranslateY: SharedValue<number>;
	children: React.ReactNode;
}

export default function DetailBackdrop({
	backdropPath,
	posterPath,
	imageTranslateY,
	children,
}: Readonly<Props>) {
	const shimmer = useSharedShimmer();
	const [imageLoaded, setImageLoaded] = useState(false);
	const parallax = useAnimatedStyle(() => ({ transform: [{ translateY: imageTranslateY.value }] }));
	return (
		<>
			<View style={[styles.backdrop, { height: BACKDROP_HEIGHT }]}>
				{!imageLoaded && (
					<Animated.View
						style={[StyleSheet.absoluteFill, styles.backdropSkeleton, { opacity: shimmer }]}
					/>
				)}
				<Reanimated.View style={[StyleSheet.absoluteFill, parallax]}>
					<Image
						source={{
							uri: backdropPath
								? tmdbBackdropUri(backdropPath, SCREEN_WIDTH)
								: tmdbPosterUri(posterPath!, SCREEN_WIDTH),
						}}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						transition={300}
						onLoad={() => setImageLoaded(true)}
					/>
				</Reanimated.View>
			</View>

			<View style={[styles.gradientIsland, { marginTop: -ISLAND_OVERLAP }]}>
				{/* Fixed-height fade that turns fully black exactly at the image's bottom edge, however
				    tall the island (logo) is — eased, so there's no visible start line */}
				<LinearGradient
					colors={[
						"rgba(0,0,0,0)",
						"rgba(0,0,0,0.08)",
						"rgba(0,0,0,0.25)",
						"rgba(0,0,0,0.5)",
						"rgba(0,0,0,0.75)",
						colors.background,
					]}
					locations={[0, 0.15, 0.32, 0.52, 0.75, 1]}
					style={styles.fade}
					pointerEvents="none"
				/>
				<View style={styles.island}>{children}</View>
			</View>
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
		paddingHorizontal: spacing.sm,
		paddingTop: 200,
		paddingBottom: spacing.sm,
	},
	fade: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: ISLAND_OVERLAP,
	},
	island: {
		borderRadius: 20,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		overflow: "hidden",
	},
});
