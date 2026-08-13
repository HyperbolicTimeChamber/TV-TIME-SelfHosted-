import { memo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Animated, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { useSharedShimmer } from "../../SkeletonLine";
import { colors, spacing } from "../../../theme";
import { tmdbStillUri, tmdbBackdropUri, tmdbPosterUri } from "../../../hooks/useTmdbImage";
import { CARD_WIDTH, formatDate } from "./constants";
import { styles } from "./styles";
import type { CarouselEpisode } from "../../../types/episodeCarousel";

export const EpisodeCard = memo(function EpisodeCard({
	ep,
	showTitle,
	showPosterPath,
	showBackdropPath,
	isWatched,
	watchCount,
	isLoaded,
	isMarking,
	onMarkWatched,
	onUnwatch,
	onRewatch,
	onShowPress,
}: {
	ep: CarouselEpisode;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath: string | null;
	isWatched: boolean;
	watchCount: number;
	isLoaded: boolean;
	isMarking: boolean;
	onMarkWatched: () => void;
	onUnwatch: () => void;
	onRewatch: () => void;
	onShowPress?: () => void;
}) {
	const shimmer = useSharedShimmer();
	const [imageLoaded, setImageLoaded] = useState(false);
	const label = `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`;

	if (!isLoaded) {
		return (
			<View style={styles.cardContent}>
				<Animated.View
					style={[
						styles.imageContainer,
						{ opacity: shimmer, backgroundColor: colors.surfaceLight },
					]}
				/>
				<View style={styles.skeletonBody}>
					<Animated.View style={[styles.skeletonTitle, { opacity: shimmer }]} />
					<Animated.View style={[styles.skeletonLine, { opacity: shimmer }]} />
					<Animated.View style={[styles.skeletonLineShort, { opacity: shimmer }]} />
				</View>
			</View>
		);
	}

	return (
		<View style={styles.cardContent}>
			{/* Image section */}
			<View style={styles.imageContainer}>
				{!imageLoaded && <Animated.View style={[styles.imageSkeleton, { opacity: shimmer }]} />}
				{ep.stillPath ? (
					<Image
						source={{ uri: tmdbStillUri(ep.stillPath, CARD_WIDTH) }}
						style={styles.still}
						contentFit="cover"
						transition={300}
						onLoad={() => setImageLoaded(true)}
					/>
				) : showBackdropPath ? (
					<Image
						source={{ uri: tmdbBackdropUri(showBackdropPath, CARD_WIDTH) }}
						style={styles.still}
						contentFit="cover"
						transition={300}
						onLoad={() => setImageLoaded(true)}
					/>
				) : showPosterPath ? (
					<Image
						source={{ uri: tmdbPosterUri(showPosterPath, CARD_WIDTH) }}
						style={styles.still}
						contentFit="cover"
						transition={300}
						onLoad={() => setImageLoaded(true)}
					/>
				) : (
					<View style={styles.stillPlaceholder}>
						<Text style={styles.stillPlaceholderText}>E{String(ep.episode).padStart(2, "0")}</Text>
					</View>
				)}
				<LinearGradient colors={["transparent", colors.surface]} style={styles.imageGradient} />
			</View>

			<View style={styles.metaSection}>
				<TouchableOpacity style={styles.titlePill} onPress={onShowPress} disabled={!onShowPress}>
					<Text style={styles.titlePillText} numberOfLines={1}>
						{showTitle.toUpperCase()}
					</Text>
					{onShowPress && <Text style={styles.titlePillArrowText}>›</Text>}
				</TouchableOpacity>
				{ep.title ? <Text style={styles.episodeTitle}>{ep.title}</Text> : null}
				<Text style={styles.label}>{label}</Text>
			</View>
			<View style={styles.overviewContainer}>
				<ScrollView showsVerticalScrollIndicator={false}>
					<View style={styles.metaRow}>
						{ep.airDate ? <Text style={styles.meta}>{formatDate(ep.airDate)}</Text> : null}
						{ep.runtime ? (
							<Text style={styles.meta}>
								{ep.airDate ? " · " : ""}
								{ep.runtime} min
							</Text>
						) : null}
					</View>
					{ep.overview ? <Text style={styles.overview}>{ep.overview}</Text> : null}
				</ScrollView>
			</View>

			{/* Button row */}
			{isWatched ? (
				<View style={styles.watchedButtonRow}>
					<TouchableOpacity
						style={[styles.unwatchButton, isMarking && { opacity: 0.6 }]}
						onPress={onUnwatch}
						disabled={isMarking}
					>
						<Text style={styles.actionButtonText}>Unwatch</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[styles.rewatchButton, isMarking && { opacity: 0.6 }]}
						onPress={onRewatch}
						disabled={isMarking}
					>
						{isMarking ? (
							<ActivityIndicator size="small" color={colors.text} />
						) : (
							<View style={styles.buttonInner}>
								<Text style={styles.actionButtonText}>Rewatch</Text>
								{watchCount > 1 && (
									<View style={styles.buttonBadge}>
										<Text style={[styles.buttonBadgeText, { color: colors.stopBlue }]}>
											{watchCount}
										</Text>
									</View>
								)}
							</View>
						)}
					</TouchableOpacity>
				</View>
			) : (
				<TouchableOpacity
					style={[styles.watchButton, isMarking && { opacity: 0.6 }]}
					onPress={onMarkWatched}
					disabled={isMarking}
				>
					{isMarking ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						<Text style={styles.actionButtonText}>Mark as Watched</Text>
					)}
				</TouchableOpacity>
			)}
		</View>
	);
});
