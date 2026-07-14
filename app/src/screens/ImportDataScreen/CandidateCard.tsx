import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { TMDBMatch } from "../../services/tvtimeImport";
import { posterSize } from "../../theme";
import { importStyles as styles } from "./styles";

interface Props {
  item: TMDBMatch;
  onPress: () => void;
}

export default function CandidateCard({ item, onPress }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.candidateRow}
      onPress={onPress}
      onLongPress={() => setExpanded((v) => !v)}
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
        <Text style={styles.candidateYear}>
          {item.year || "N/A"}
          {item.mediaType === "tv" && item.totalSeasons
            ? ` · ${item.totalSeasons} season${item.totalSeasons !== 1 ? "s" : ""}`
            : ""}
          {item.mediaType === "tv" && item.totalEpisodes
            ? ` · ${item.totalEpisodes} ep${item.totalEpisodes !== 1 ? "s" : ""}`
            : ""}
        </Text>
        <Text
          style={styles.candidateOverview}
          numberOfLines={expanded ? undefined : 2}
        >
          {item.overview || "No description available"}
        </Text>
        {!expanded && (
          <Text style={styles.expandHint}>Long press for full details</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
