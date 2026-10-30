import { memo } from "react";
import { Animated, View } from "react-native";
import { useSharedShimmer } from "../../components/SkeletonLine";
import { styles } from "./styles";

/**
 * A results card's placeholder — rendered by the results list itself, so it sits exactly where
 * a card will: while a search runs (the searchTitles CF takes longer than one TMDB page did)
 * and as a row under the list while more batches are still to load
 */
function SearchSkeleton() {
	const shimmer = useSharedShimmer();
	return (
		<View style={styles.card}>
			<Animated.View style={[styles.poster, styles.skeletonPoster, { opacity: shimmer }]} />
		</View>
	);
}

export default memo(SearchSkeleton);
