import React from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, posterSize } from "../../theme";
import { styles } from "./styles";
import type { CompletedSection } from "../../hooks/useCompletedShows";

interface Props {
	sections: CompletedSection[];
	loading: boolean;
}

export default function CompletedSections({ sections, loading }: Readonly<Props>) {
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
							<Image
								source={
									item.posterPath
										? { uri: `${posterSize.small}${item.posterPath}` }
										: undefined
								}
								style={styles.completedPoster}
								contentFit="cover"
							/>
						)}
						ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
					/>
				</View>
			))}
		</View>
	);
}
