import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { useAuthStore } from "../stores/authStore";
import { useWatchlist } from "../hooks/useWatchlist";
import { useUpcomingEpisodes } from "../hooks/useUpcomingEpisodes";
import { colors, spacing, typography, posterSize } from "../theme";
import { UpcomingEpisode, CalendarStackParamList } from "../types";

type NavProp = NativeStackNavigationProp<CalendarStackParamList, "CalendarMain">;

export default function CalendarScreen() {
  const user = useAuthStore((s) => s.user);
  const { items: watchlist } = useWatchlist(user?.uid);
  const navigation = useNavigation<NavProp>();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const tvShowIds = useMemo(
    () =>
      watchlist
        .filter(
          (w) =>
            w.mediaType === "tv" &&
            (w.status === "watching" || w.status === "rewatching")
        )
        .map((w) => w.tmdbId),
    [watchlist]
  );

  const { data: episodes } = useUpcomingEpisodes(tvShowIds);

  const markedDates = useMemo(() => {
    const marks: Record<
      string,
      { marked: boolean; dotColor: string; selected?: boolean; selectedColor?: string }
    > = {};
    if (!episodes) return marks;

    for (const ep of episodes) {
      marks[ep.airDate] = {
        marked: true,
        dotColor: colors.primary,
      };
    }

    if (selectedDate && marks[selectedDate]) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
        selectedColor: colors.primary,
      };
    } else if (selectedDate) {
      marks[selectedDate] = {
        marked: false,
        dotColor: colors.primary,
        selected: true,
        selectedColor: colors.surfaceLight,
      };
    }

    return marks;
  }, [episodes, selectedDate]);

  const selectedEpisodes = useMemo(() => {
    if (!selectedDate || !episodes) return [];
    return episodes.filter((ep) => ep.airDate === selectedDate);
  }, [episodes, selectedDate]);

  const handleDayPress = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
  }, []);

  const renderEpisode = useCallback(
    ({ item }: { item: UpcomingEpisode }) => (
      <TouchableOpacity
        style={styles.episodeRow}
        onPress={() =>
          navigation.navigate("ShowDetail", {
            tmdbId: item.tmdbShowId,
            mediaType: "tv",
          })
        }
      >
        <Image
          source={{ uri: `${posterSize.small}${item.posterPath}` }}
          style={styles.poster}
          contentFit="cover"
        />
        <View style={styles.epInfo}>
          <Text style={styles.showTitle} numberOfLines={1}>
            {item.showTitle}
          </Text>
          <Text style={styles.epLabel}>
            S{String(item.season).padStart(2, "0")}E
            {String(item.episode).padStart(2, "0")}
          </Text>
          <Text style={styles.epTitle} numberOfLines={1}>
            {item.episodeTitle}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [navigation]
  );

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={handleDayPress}
        markedDates={markedDates}
        theme={{
          backgroundColor: colors.background,
          calendarBackground: colors.background,
          textSectionTitleColor: colors.textSecondary,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: colors.text,
          todayTextColor: colors.primary,
          dayTextColor: colors.text,
          textDisabledColor: colors.textMuted,
          monthTextColor: colors.text,
          arrowColor: colors.primary,
        }}
      />

      {selectedDate && (
        <View style={styles.episodeList}>
          <Text style={styles.dateHeader}>
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          {selectedEpisodes.length === 0 ? (
            <Text style={styles.noEps}>No episodes on this day</Text>
          ) : (
            <FlatList
              data={selectedEpisodes}
              keyExtractor={(item) =>
                `${item.tmdbShowId}_${item.season}_${item.episode}`
              }
              renderItem={renderEpisode}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  episodeList: {
    flex: 1,
    paddingTop: spacing.md,
  },
  dateHeader: {
    ...typography.subtitle,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  noEps: {
    ...typography.caption,
    paddingHorizontal: spacing.lg,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  poster: {
    width: 45,
    height: 67,
    borderRadius: 4,
  },
  epInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  showTitle: {
    ...typography.subtitle,
    fontSize: 14,
  },
  epLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  epTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: 13,
  },
});
