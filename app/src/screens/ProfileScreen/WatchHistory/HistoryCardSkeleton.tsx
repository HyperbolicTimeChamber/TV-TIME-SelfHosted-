import React from "react";
import { Animated } from "react-native";
import { useSharedShimmer } from "../../../components/SkeletonLine";
import { CARD_ASPECT, styles } from "./styles";

/** Placeholder card. It runs its own shimmer rather than taking one from the screen: the grid
 *  is virtualised, so a card handed a value whose loop started with the screen would mount
 *  late and never animate (see useSharedShimmer). */
export default function HistoryCardSkeleton() {
	const shimmer = useSharedShimmer();
	return <Animated.View style={[styles.card, { aspectRatio: CARD_ASPECT, opacity: shimmer }]} />;
}
