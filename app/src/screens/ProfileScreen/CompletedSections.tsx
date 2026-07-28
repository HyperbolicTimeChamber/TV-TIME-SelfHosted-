import React from "react";
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import { colors, spacing } from "../../theme";
import { MediaType } from "../../types";
import PosterImage from "../../components/PosterImage";
import { styles } from "./styles";
import type { CompletedSection } from "../../hooks/useCompletedShows";

interface Props {
	sections: CompletedSection[];
	loading: boolean;
	onItemPress?: (tmdbId: number, mediaType: MediaType) => void;
}

export default function CompletedSections({ sections, loading, onItemPress }: Readonly<Props>) {
	if (loading) {
		return (
			<View style={styles.completedLoader}>
				<ActivityIndicator size="small" color={colors.primary} />
			</View>
		);
	}

	if (sections.length === 0) return null;

	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>Recently Completed</Text>
			{sections.map((section) => (
				<View key={section.title} style={styles.genreSection}>
					<Text style={styles.genreTitle}>{section.title}</Text>
					<FlatList
						horizontal
						data={section.items}
						keyExtractor={(item) => `${item.tmdbId}`}
						showsHorizontalScrollIndicator={false}
						renderItem={({ item }) => (
							<TouchableOpacity
								activeOpacity={0.7}
								onPress={() => onItemPress?.(item.tmdbId, item.mediaType)}
								disabled={!onItemPress}
							>
								<PosterImage
									posterPath={item.posterPath}
									mediaType={item.mediaType}
									style={styles.completedPoster}
									title={!item.posterPath ? item.title : undefined}
								/>
							</TouchableOpacity>
						)}
						ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
					/>
				</View>
			))}
		</View>
	);
}
