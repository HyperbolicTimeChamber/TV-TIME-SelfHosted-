import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import LoadingSpinner from "../components/LoadingSpinner";
import { LegendList } from "@legendapp/list/react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSearch } from "../hooks/useSearch";
import { useTrending } from "../hooks/useTrending";
import { useWatchlist } from "../hooks/useWatchlist";
import { useAuthStore } from "../stores/authStore";
import { addToTracking } from "../services/firestore";
import { colors, spacing, typography, posterSize } from "../theme";
import { TMDBShow, SearchStackParamList, MediaType } from "../types";

type NavProp = NativeStackNavigationProp<SearchStackParamList, "SearchMain">;

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const { items: watchlist } = useWatchlist(user?.uid);

  const watchlistIds = useMemo(
    () => new Set(watchlist.map((w) => w.tmdbId)),
    [watchlist]
  );

  const handleAddToWatchlist = useCallback(
    async (item: TMDBShow) => {
      if (!user?.uid) return;
      const mediaType: MediaType =
        item.media_type || (item.title ? "movie" : "tv");
      await addToTracking(user.uid, item.id, mediaType);
    },
    [user?.uid]
  );

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
      const isInWatchlist = watchlistIds.has(item.id);

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
          <TouchableOpacity
            style={[
              styles.watchlistBadge,
              isInWatchlist && styles.watchlistBadgeActive,
            ]}
            onPress={(e) => {
              e.stopPropagation?.();
              if (!isInWatchlist) handleAddToWatchlist(item);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.watchlistBadgeText,
                isInWatchlist && styles.watchlistBadgeTextActive,
              ]}
            >
              {isInWatchlist ? "✓" : "+"}
            </Text>
          </TouchableOpacity>
          <View style={styles.banner}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {title}
            </Text>
            {year ? <Text style={styles.cardYear}>{year}</Text> : null}
          </View>
        </TouchableOpacity>
      );
    },
    [handlePress, watchlistIds, handleAddToWatchlist]
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
          <LoadingSpinner />
        </View>
      ) : (
        <LegendList
          data={displayData || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          extraData={watchlistIds}
          numColumns={3}
          estimatedItemSize={200}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          onEndReached={() => {
            if (query && hasNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          recycleItems={false}
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
    paddingHorizontal: spacing.xs,
  },
  row: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  card: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 6,
  },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: 6,
    backgroundColor: colors.surface,
    width: "100%",
  },
  banner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cardTitle: {
    ...typography.caption,
    color: colors.text,
  },
  cardYear: {
    ...typography.caption,
    fontSize: 11,
  },
  watchlistBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  watchlistBadgeActive: {
    backgroundColor: colors.watchedGreen,
    borderColor: colors.watchedGreen,
  },
  watchlistBadgeText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.text,
    lineHeight: 18,
  },
  watchlistBadgeTextActive: {
    fontSize: 14,
  },
});
