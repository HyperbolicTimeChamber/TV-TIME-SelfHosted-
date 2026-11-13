import React, { useState } from "react";
import { View, Animated, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import Reanimated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSharedShimmer } from "../../components/SkeletonLine";
import { colors, spacing, themedStyles, tint } from "../../theme";
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
				{/* Fixed-height fade into the page colour, ending exactly at the image's bottom edge however
				    tall the island (logo) is — eased, so there's no visible start line. Built from the
				    background itself: black on dark (unchanged), white on light (a black scrim ending in
				    white left a dark band with a hard edge) */}
				<LinearGradient
					colors={FADE_ALPHAS.map((a) => tint(colors.background, a)) as [string, string, ...string[]]}
					locations={[0, 0.15, 0.32, 0.52, 0.75, 1]}
					style={styles.fade}
					pointerEvents="none"
				/>
				<View style={styles.island}>{children}</View>
			</View>
		</>
	);
}

/** Eased fade stops (alpha of the page colour) — matches `locations` */
const FADE_ALPHAS = [0, 0.08, 0.25, 0.5, 0.75, 1];

const styles = themedStyles(() => StyleSheet.create({
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
}));
