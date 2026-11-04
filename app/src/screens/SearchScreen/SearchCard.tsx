import { memo, type ReactNode } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";
import { TMDBShow, MediaType } from "../../types";
import PosterImage from "../../components/PosterImage";
import { styles } from "./styles";

interface Props {
	item: TMDBShow;
	isInWatchlist: boolean;
	isAdding: boolean;
	/** In at least one custom list */
	isListed?: boolean;
	onPress: (item: TMDBShow) => void;
	/** Without these the card has no watchlist badge (Hall of Shame: everything there is tracked) */
	onAdd?: (item: TMDBShow) => void;
	onRemove?: (item: TMDBShow) => void;
	/** Pills over the poster's top-left (a list's own grid: the title's state tags) */
	overlay?: ReactNode;
	/** In place of the title / year banner (Hall of Shame's grid: title + its stats) */
	footer?: ReactNode;
	/** Without it the card has no Add to List button (a list's own grid) */
	onAddToList?: (item: TMDBShow) => void;
	onLongPress?: (item: TMDBShow) => void;
}

function SearchCard({
	item,
	isInWatchlist,
	isAdding,
	isListed = false,
	onPress,
	onAdd,
	onRemove,
	onAddToList,
	onLongPress,
	overlay,
	footer,
}: Readonly<Props>) {
	const title = item.name || item.title || "";
	const year = (item.first_air_date || item.release_date || "").substring(0, 4);
	const mediaType: MediaType =
		item.media_type ||
		(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE);

	return (
		<TouchableOpacity
			style={styles.card}
			onPress={() => onPress(item)}
			onLongPress={onLongPress ? () => onLongPress(item) : undefined}
			delayLongPress={350}
			activeOpacity={0.7}
		>
			<PosterImage posterPath={item.poster_path} mediaType={mediaType} style={styles.poster} />
			{onAdd && onRemove && (
				<TouchableOpacity
					style={[styles.watchlistBadge, isInWatchlist && styles.watchlistBadgeActive]}
					onPress={(e) => {
						e.stopPropagation?.();
						if (isAdding) return;
						if (isInWatchlist) {
							onRemove(item);
						} else {
							onAdd(item);
						}
					}}
					hitSlop={{ top: 5, bottom: 5, left: 8, right: 8 }}
					activeOpacity={0.7}
					disabled={isAdding}
					accessibilityLabel={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
				>
					{isAdding ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						// Vector glyphs sit in the middle of their box — a text "+" rode high and off centre
						<Ionicons name={isInWatchlist ? "checkmark" : "add"} size={18} color={colors.text} />
					)}
				</TouchableOpacity>
			)}
			{onAddToList && (
				<TouchableOpacity
					style={[
						styles.listBadge,
						!onAdd && styles.listBadgeTop,
						isListed && styles.listBadgeActive,
					]}
					onPress={(e) => {
						e.stopPropagation?.();
						onAddToList(item);
					}}
					hitSlop={{ top: 5, bottom: 5, left: 8, right: 8 }}
					activeOpacity={0.7}
					accessibilityLabel="Add to List"
				>
					<Ionicons
						name={isListed ? "bookmark" : "bookmark-outline"}
						size={14}
						color={colors.text}
					/>
				</TouchableOpacity>
			)}
			{overlay && (
				<View style={styles.overlayTags} pointerEvents="none">
					{overlay}
				</View>
			)}
			{footer ?? (
				<View style={styles.banner}>
					<View style={styles.bannerTop}>
						<Text style={styles.cardTitle} numberOfLines={1}>
							{title}
						</Text>
						<View
							style={[styles.typeBadge, mediaType === MediaType.MOVIE && styles.typeBadgeMovie]}
						>
							<Text style={styles.typeBadgeText}>
								{mediaType === MediaType.TV ? "TV" : "MOVIE"}
							</Text>
						</View>
					</View>
					{year ? <Text style={styles.cardYear}>{year}</Text> : null}
				</View>
			)}
		</TouchableOpacity>
	);
}

export default memo(SearchCard);
