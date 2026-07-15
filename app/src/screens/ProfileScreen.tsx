import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { useUserStats } from "../hooks/useUserStats";
import { useWatchlist } from "../hooks/useWatchlist";
import { colors, spacing, typography, posterSize } from "../theme";
import { ProfileStackParamList } from "../types";

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const hasCompletedImport = useAuthStore((s) => s.hasCompletedImport);
  const signOut = useAuthStore((s) => s.signOut);
  const { stats } = useUserStats(user?.uid);
  const { items: watchlist } = useWatchlist(user?.uid);

  const completedShows = useMemo(
    () => watchlist.filter((w) => w.status === "completed"),
    [watchlist]
  );

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const handleSignOut = () => {
    Alert.alert("Log Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {user?.photoURL ? (
          <Image
            source={{ uri: user.photoURL }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {(user?.displayName || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.name}>{user?.displayName || "User"}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.episodesWatched}</Text>
          <Text style={styles.statLabel}>Episodes</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.showsTracking}</Text>
          <Text style={styles.statLabel}>Tracking</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.moviesWatched}</Text>
          <Text style={styles.statLabel}>Movies</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>
            {formatTime(stats.totalMinutes)}
          </Text>
          <Text style={styles.statLabel}>Watch Time</Text>
        </View>
      </View>

      {completedShows.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Completed ({completedShows.length})
          </Text>
          <View style={styles.completedGrid}>
            {completedShows.map((show) => (
              <Image
                key={show.id}
                source={{ uri: `${posterSize.small}${show.posterPath}` }}
                style={styles.completedPoster}
                contentFit="cover"
              />
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.importButton}
        onPress={() => navigation.navigate("ImportData")}
      >
        <Text style={styles.importText}>{hasCompletedImport ? "Re-sync TV Time Data" : "Import TV Time Data"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...typography.title,
    fontSize: 32,
  },
  name: {
    ...typography.title,
    marginTop: spacing.md,
  },
  email: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  statBox: {
    alignItems: "center",
  },
  statNumber: {
    ...typography.title,
    fontSize: 20,
  },
  statLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.subtitle,
    marginBottom: spacing.md,
  },
  completedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  completedPoster: {
    width: 70,
    height: 105,
    borderRadius: 4,
  },
  importButton: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  importText: {
    ...typography.subtitle,
    color: colors.accent,
  },
  signOutButton: {
    marginTop: spacing.xxl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xxl * 2,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 8,
    alignItems: "center",
  },
  signOutText: {
    ...typography.subtitle,
    color: colors.destructiveRed,
  },
});
