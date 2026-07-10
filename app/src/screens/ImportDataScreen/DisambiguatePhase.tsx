import React, { useState } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	ActivityIndicator,
	Modal,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import CandidateCard from "./CandidateCard";
import { TMDBMatch, AmbiguousMatch } from "../../services/tvtimeImport";
import { colors, spacing } from "../../theme";
import { importStyles as styles } from "./styles";

interface Props {
	insetTop: number;
	current: AmbiguousMatch;
	disambigIndex: number;
	totalAmbiguous: number;
	candidates: TMDBMatch[];
	loadingMore: boolean;
	onSelect: (match: TMDBMatch) => void;
	onSkip: () => void;
	onBack: () => void;
	onLoadMore: () => void;
}

export default function DisambiguatePhase({
	insetTop,
	current,
	disambigIndex,
	totalAmbiguous,
	candidates,
	loadingMore,
	onSelect,
	onSkip,
	onBack,
	onLoadMore,
}: Props) {
	const [showInfo, setShowInfo] = useState(disambigIndex === 0);

	return (
		<View style={[styles.container, { paddingTop: insetTop + spacing.lg }]}>
			{/* Info modal */}
			<Modal
				visible={showInfo}
				transparent
				animationType="fade"
				onRequestClose={() => setShowInfo(false)}>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>Duplicate Results</Text>
						<Text style={styles.modalBody}>
							Some shows or movies from your TV Time export matched multiple
							results on TMDB. This can happen when names are shared across
							different shows, movies, remakes, or regional versions.
						</Text>
						<Text style={styles.modalBody}>
							Pick the correct match for each one so your watch history imports
							accurately. You can also skip any you don't want to import.
						</Text>
						<TouchableOpacity
							style={styles.modalButton}
							onPress={() => setShowInfo(false)}>
							<Text style={styles.modalButtonText}>Resolve</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			{/* Header */}
			<View style={styles.disambigHeader}>
				<Text style={[styles.sectionTitle, { marginBottom: 0, flexShrink: 1 }]}>
					Resolve {disambigIndex + 1}/{totalAmbiguous}: "{current.tvTimeName}"
				</Text>
				<TouchableOpacity
					onPress={() => setShowInfo(true)}
					style={{ flexShrink: 0 }}
				>
					<Text style={styles.infoButton}>?</Text>
				</TouchableOpacity>
			</View>
			<View style={styles.expectedRow}>
				<Text style={styles.expectedLabel}>Expected </Text>
				<View
					style={[
						styles.typeBadge,
						current.mediaType === "movie" && styles.typeBadgeMovie,
					]}>
					<Text style={styles.typeBadgeText}>
						{current.mediaType === "tv" ? "TV" : "MOVIE"}
					</Text>
				</View>
				<Text style={styles.expectedHint}>
					{" "}
					· Tap to select, long press for details
				</Text>
			</View>

			{/* List */}
			<LegendList
				data={candidates}
				keyExtractor={(item) => String(item.tmdbId)}
				renderItem={({ item }) => (
					<CandidateCard item={item} onPress={() => onSelect(item)} />
				)}
				onEndReached={onLoadMore}
				onEndReachedThreshold={0.5}
				contentContainerStyle={{ paddingBottom: 80 }}
				ListFooterComponent={
					loadingMore ? (
						<ActivityIndicator
							size="small"
							color={colors.primary}
							style={{ marginVertical: spacing.md }}
						/>
					) : null
				}
			/>

			{/* Fixed footer */}
			<View style={styles.disambigFooter}>
				{disambigIndex > 0 ? (
					<TouchableOpacity style={styles.disambigBackBtn} onPress={onBack}>
						<Text style={styles.disambigBackText}>&lt; Back</Text>
					</TouchableOpacity>
				) : (
					<View />
				)}
				<TouchableOpacity style={styles.disambigSkipBtn} onPress={onSkip}>
					<Text style={styles.disambigSkipText}>Skip &gt;</Text>
				</TouchableOpacity>
			</View>
		</View>
	);
}
