import { memo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { colors, posterSize } from "../../theme";
import { TMDBShow, MediaType } from "../../types";
import { styles } from "./styles";

interface Props {
	item: TMDBShow;
	isInWatchlist: boolean;
	isAdding: boolean;
	onPress: (item: TMDBShow) => void;
	onAdd: (item: TMDBShow) => void;
	onRemove: (item: TMDBShow) => void;
}

function SearchCard({ item, isInWatchlist, isAdding, onPress, onAdd, onRemove }: Props) {
	const title = item.name || item.title || "";
	const year = (item.first_air_date || item.release_date || "").substring(0, 4);
	const mediaType: MediaType =
		item.media_type ||
		(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE);

	return (
		<TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.7}>
			<Image
				source={{ uri: `${posterSize.medium}${item.poster_path}` }}
				style={styles.poster}
				contentFit="cover"
			/>
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
				hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				activeOpacity={0.7}
				disabled={isAdding}
			>
				{isAdding ? (
					<ActivityIndicator size="small" color={colors.text} />
				) : (
					<Text
						style={[styles.watchlistBadgeText, isInWatchlist && styles.watchlistBadgeTextActive]}
					>
						{isInWatchlist ? "✓" : "+"}
					</Text>
				)}
			</TouchableOpacity>
			<View style={styles.banner}>
				<View style={styles.bannerTop}>
					<Text style={styles.cardTitle} numberOfLines={1}>
						{title}
					</Text>
					<View style={[styles.typeBadge, mediaType === MediaType.MOVIE && styles.typeBadgeMovie]}>
						<Text style={styles.typeBadgeText}>{mediaType === MediaType.TV ? "TV" : "MOVIE"}</Text>
					</View>
				</View>
				{year ? <Text style={styles.cardYear}>{year}</Text> : null}
			</View>
		</TouchableOpacity>
	);
}

export default memo(SearchCard);
