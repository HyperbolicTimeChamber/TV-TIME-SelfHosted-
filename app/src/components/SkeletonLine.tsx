import { useEffect } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";
import { colors } from "../theme";

// Shared animation value — all skeletons pulse together. Created once and never replaced:
// nulling it on last unmount handed later mounts a fresh value no loop was driving (static skeletons)
const sharedAnim = new Animated.Value(0);
const sharedOpacity = sharedAnim.interpolate({
	inputRange: [0, 0.5, 1],
	outputRange: [0.3, 0.6, 0.3],
});
let refCount = 0;
let animLoop: Animated.CompositeAnimation | null = null;

export function useSharedShimmer() {
	useEffect(() => {
		refCount++;
		if (refCount === 1) {
			// Restart from the top — a stopped loop leaves the value mid-pulse
			sharedAnim.setValue(0);
			animLoop = Animated.loop(
				Animated.timing(sharedAnim, {
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
			}
		};
	}, []);

	return sharedOpacity;
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
