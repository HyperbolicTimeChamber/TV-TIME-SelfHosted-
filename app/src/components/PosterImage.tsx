import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography } from "../theme";
import { tmdbPosterUri } from "../hooks/useTmdbImage";
import { MediaType } from "../enums";

const POSTER_WIDTH = 100;

interface Props {
	posterPath: string | null | undefined;
	mediaType?: MediaType | string;
	style?: StyleProp<ViewStyle>;
	contentFit?: "cover" | "contain";
	title?: string;
}

export default function PosterImage({
	posterPath,
	mediaType,
	style,
	contentFit = "cover",
	title,
}: Props) {
	if (posterPath) {
		return (
			<Image
				source={{ uri: tmdbPosterUri(posterPath, POSTER_WIDTH) }}
				style={style as any}
				contentFit={contentFit}
				recyclingKey={posterPath}
			/>
		);
	}

	const isMovie = mediaType === MediaType.MOVIE || mediaType === "movie";

	return (
		<View style={[style, styles.placeholder]}>
			<Ionicons
				name={isMovie ? "film-outline" : "tv-outline"}
				size={title ? 22 : 28}
				color={colors.textMuted}
			/>
			{title && (
				<Text style={styles.title} numberOfLines={3}>
					{title}
				</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	placeholder: {
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		alignItems: "center",
		padding: 4,
	},
	title: {
		...typography.caption,
		fontSize: 9,
		color: colors.textMuted,
		textAlign: "center",
		marginTop: 2,
	},
});
