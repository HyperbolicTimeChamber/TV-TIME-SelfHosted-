import { memo } from "react";
import { Animated } from "react-native";
import { SNAP_INTERVAL, SIDE_SCALE, SIDE_ROTATE, SIDE_OPACITY } from "./constants";
import { styles } from "./styles";

export const Card3DWrapper = memo(function Card3DWrapper({
	index,
	scrollX,
	children,
}: {
	index: number;
	scrollX: Animated.Value;
	children: React.ReactNode;
}) {
	const inputRange = [
		(index - 1) * SNAP_INTERVAL,
		index * SNAP_INTERVAL,
		(index + 1) * SNAP_INTERVAL,
	];

	const scale = scrollX.interpolate({
		inputRange,
		outputRange: [SIDE_SCALE, 1, SIDE_SCALE],
		extrapolate: "clamp",
	});
	const rotateY = scrollX.interpolate({
		inputRange,
		outputRange: [SIDE_ROTATE, "0deg", `-${SIDE_ROTATE.replace("-", "")}`],
		extrapolate: "clamp",
	});
	const opacity = scrollX.interpolate({
		inputRange,
		outputRange: [SIDE_OPACITY, 1, SIDE_OPACITY],
		extrapolate: "clamp",
	});

	return (
		<Animated.View
			style={[
				styles.cardWrapper,
				{
					transform: [{ perspective: 800 }, { scale }, { rotateY }],
					opacity,
				},
			]}
		>
			{children}
		</Animated.View>
	);
});
