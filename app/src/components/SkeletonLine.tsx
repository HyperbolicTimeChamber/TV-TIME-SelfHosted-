import { useEffect } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";
import { colors } from "../theme";

// Shared animation value — all SkeletonLine instances pulse together
let sharedAnim: Animated.Value | null = null;
let refCount = 0;
let animLoop: Animated.CompositeAnimation | null = null;

function getSharedAnim() {
	if (!sharedAnim) {
		sharedAnim = new Animated.Value(0);
	}
	return sharedAnim;
}

function useSharedShimmer() {
	const anim = getSharedAnim();

	useEffect(() => {
		refCount++;
		if (refCount === 1) {
			animLoop = Animated.loop(
				Animated.timing(anim, {
					toValue: 1,
					duration: 1200,
					useNativeDriver: true,
				}),
			);
			animLoop.start();
		}
		return () => {
			refCount--;
			if (refCount === 0) {
				animLoop?.stop();
				animLoop = null;
				sharedAnim = null;
			}
		};
	}, [anim]);

	return anim.interpolate({
		inputRange: [0, 0.5, 1],
		outputRange: [0.3, 0.6, 0.3],
	});
}

interface Props {
	width?: number | string;
	height?: number;
	style?: ViewStyle;
}

export default function SkeletonLine({ width = "60%", height = 12, style }: Props) {
	const shimmer = useSharedShimmer();

	return (
		<Animated.View
			style={[styles.base, { width: width as any, height, opacity: shimmer }, style]}
		/>
	);
}

const styles = StyleSheet.create({
	base: {
		borderRadius: 4,
		backgroundColor: colors.border,
	},
});
