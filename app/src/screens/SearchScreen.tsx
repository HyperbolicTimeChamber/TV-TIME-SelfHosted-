import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSearch } from "../hooks/useSearch";
import { useTrending } from "../hooks/useTrending";
import { colors, spacing, typography, posterSize } from "../theme";
import { TMDBShow, SearchStackParamList, MediaType } from "../types";

type NavProp = NativeStackNavigationProp<SearchStackParamList, "SearchMain">;

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const navigation = useNavigation<NavProp>();

  const {
    data: searchData,
    isLoading: searchLoading,
    fetchNextPage,
    hasNextPage,
  } = useSearch(query);

  const { data: trending, isLoading: trendingLoading } = useTrending("tv");

  const displayData = query.length > 0 ? searchData?.results : trending;
  const isLoading = query.length > 0 ? searchLoading : trendingLoading;

  const handlePress = useCallback(
    (item: TMDBShow) => {
      const mediaType: MediaType =
        item.media_type || (item.title ? "movie" : "tv");
      navigation.navigate("ShowDetail", {
        tmdbId: item.id,
        mediaType,
      });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: TMDBShow }) => {
      const title = item.name || item.title || "";
      const year = (item.first_air_date || item.release_date || "").substring(
        0,
        4
      );

      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => handlePress(item)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: `${posterSize.medium}${item.poster_path}` }}
            style={styles.poster}
            contentFit="cover"
          />
          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>
          {year ? <Text style={styles.cardYear}>{year}</Text> : null}
        </TouchableOpacity>
      );
    },
    [handlePress]
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search shows & movies..."
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      {!query && (
        <Text style={styles.sectionTitle}>Trending</Text>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayData || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          onEndReached={() => {
            if (query && hasNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchInput: {
    ...typography.body,
    backgroundColor: colors.surfaceLight,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    borderRadius: 8,
  },
  sectionTitle: {
    ...typography.subtitle,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  grid: {
    paddingHorizontal: spacing.sm,
  },
  row: {
    justifyContent: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  card: {
    flex: 1,
    maxWidth: "32%",
  },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: 6,
    backgroundColor: colors.surface,
    width: "100%",
  },
  cardTitle: {
    ...typography.caption,
    color: colors.text,
    marginTop: spacing.xs,
  },
  cardYear: {
    ...typography.caption,
    fontSize: 11,
  },
});
