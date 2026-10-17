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

			<LinearGradient
				colors={["transparent", "rgba(13,13,13,0.7)", colors.background]}
				locations={[0, 0.2, 0.8]}
				style={[styles.gradientIsland, { marginTop: -280 }]}
			>
				<View style={styles.island}>{children}</View>
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
		paddingHorizontal: spacing.sm,
		paddingTop: 200,
		paddingBottom: spacing.sm,
	},
	island: {
		borderRadius: 20,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		overflow: "hidden",
	},
});
