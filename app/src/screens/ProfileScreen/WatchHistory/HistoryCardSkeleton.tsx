import React from "react";
import { Animated } from "react-native";
import { CARD_ASPECT, styles } from "./styles";

/** Placeholder card — every skeleton shares one shimmer value (one animation total) */
export default function HistoryCardSkeleton({ shimmer }: { shimmer: Animated.AnimatedInterpolation<number> | Animated.Value }) {
	return <Animated.View style={[styles.card, { aspectRatio: CARD_ASPECT, opacity: shimmer }]} />;
}
