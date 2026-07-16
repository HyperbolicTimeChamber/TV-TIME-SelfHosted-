import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { AnimatedModal } from "../../components";
import { TMDBMatch } from "../../services/tvtimeImport";
import { getShowDetails } from "../../services/tmdb";
import { colors, spacing, posterSize } from "../../theme";
import { importStyles as styles } from "./styles";

interface Props {
  item: TMDBMatch;
  apiKey: string;
  onPress: () => void;
}

export default function CandidateCard({ item, apiKey, onPress }: Props) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleLongPress = async () => {
    setDetailsVisible(true);
    if (!details) {
      setLoading(true);
      try {
        const data = await getShowDetails(apiKey, item.tmdbId, item.mediaType);
        setDetails(data);
      } catch {
        setDetails(null);
      } finally {
        setLoading(false);
      }
    }
  };

  const seasonCount = details?.number_of_seasons;
  const episodeCount = details?.number_of_episodes;
  const runtime = details?.runtime ?? details?.episode_run_time?.[0];
  const genres = details?.genres?.map((g: any) => g.name).join(", ");
  const status = details?.status;

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

      <AnimatedModal
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
      >
        <View style={[styles.modalContent, { maxHeight: "80%" }]}>
          {loading ? (
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={{ marginVertical: spacing.xl }}
            />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {item.posterPath && (
                <Image
                  source={{ uri: `${posterSize.medium}${item.posterPath}` }}
                  style={{
                    width: "100%",
                    height: 200,
                    borderRadius: 8,
                    marginBottom: spacing.md,
                  }}
                  contentFit="cover"
                />
              )}
              <View style={[styles.candidateHeader, { marginBottom: spacing.sm }]}>
                <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>
                  {item.tmdbName}
                </Text>
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

              <Text style={styles.candidateYear}>
                {item.year || "N/A"}
                {seasonCount ? ` \u00b7 ${seasonCount} season${seasonCount !== 1 ? "s" : ""}` : ""}
                {episodeCount ? ` \u00b7 ${episodeCount} episode${episodeCount !== 1 ? "s" : ""}` : ""}
                {runtime ? ` \u00b7 ${runtime} min` : ""}
              </Text>

              {status && (
                <Text style={[styles.candidateYear, { marginTop: 2 }]}>
                  Status: {status}
                </Text>
              )}

              {genres && (
                <Text style={[styles.candidateYear, { marginTop: 2 }]}>
                  {genres}
                </Text>
              )}

              <Text style={[styles.modalBody, { marginTop: spacing.md }]}>
                {details?.overview || item.overview || "No description available"}
              </Text>
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.modalButton}
            onPress={() => setDetailsVisible(false)}
          >
            <Text style={styles.modalButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </AnimatedModal>
    </>
  );
}
