import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { ShowDrawer } from "../../components";
import type { ShowDrawerData } from "../../components/ShowDrawer";
import { TMDBMatch } from "../../services/tvtimeImport";
import { getShowDetails } from "../../services/tmdb";
import { posterSize } from "../../theme";
import { importStyles as styles } from "./styles";

interface Props {
  item: TMDBMatch;
  apiKey: string;
  onPress: () => void;
}

export default function CandidateCard({ item, apiKey, onPress }: Props) {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerData, setDrawerData] = useState<ShowDrawerData | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const handleLongPress = async () => {
    setDrawerVisible(true);
    if (!drawerData) {
      setDrawerLoading(true);
      try {
        const data = await getShowDetails(apiKey, item.tmdbId, item.mediaType) as any;
        const seasonCount = data?.number_of_seasons;
        const episodeCount = data?.number_of_episodes;
        const runtime = data?.runtime ?? data?.episode_run_time?.[0];
        const genres = data?.genres?.map((g: any) => g.name).join(", ");
        setDrawerData({
          title: item.tmdbName,
          posterPath: item.posterPath,
          backdropPath: data?.backdrop_path ?? null,
          overview: data?.overview || item.overview || null,
          mediaType: item.mediaType,
          year: item.year || null,
          totalSeasons: seasonCount ?? item.totalSeasons,
          totalEpisodes: episodeCount ?? item.totalEpisodes,
          runtime: runtime ?? null,
          status: data?.status ?? null,
          genres: genres || null,
        });
      } catch {
        setDrawerData({
          title: item.tmdbName,
          posterPath: item.posterPath,
          backdropPath: null,
          overview: item.overview || null,
          mediaType: item.mediaType,
          year: item.year || null,
          totalSeasons: item.totalSeasons,
          totalEpisodes: item.totalEpisodes,
        });
      } finally {
        setDrawerLoading(false);
      }
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.candidateRow}
        onPress={onPress}
        onLongPress={handleLongPress}
      >
        {item.posterPath ? (
          <Image
            source={{ uri: `${posterSize.small}${item.posterPath}` }}
            style={styles.poster}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.poster, styles.noPoster]}>
            <Text style={styles.noPosterText}>?</Text>
          </View>
        )}
        <View style={styles.candidateInfo}>
          <View style={styles.candidateHeader}>
            <Text style={styles.candidateName}>{item.tmdbName}</Text>
            <View
              style={[
                styles.typeBadge,
                item.mediaType === "movie" && styles.typeBadgeMovie,
              ]}
            >
              <Text style={styles.typeBadgeText}>
                {item.mediaType === "tv" ? "TV" : "MOVIE"}
              </Text>
            </View>
          </View>
          <Text style={styles.candidateYear}>{item.year || "N/A"}</Text>
          <Text style={styles.candidateOverview} numberOfLines={2}>
            {item.overview || "No description available"}
          </Text>
          <Text style={styles.expandHint}>Long press for details</Text>
        </View>
      </TouchableOpacity>

      <ShowDrawer
        visible={drawerVisible}
        show={drawerData}
        loading={drawerLoading}
        onClose={() => setDrawerVisible(false)}
      />
    </>
  );
}
