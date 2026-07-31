import { useState } from "react";
import {
	View,
	Text,
	ScrollView,
	TouchableOpacity,
	Animated,
	StyleSheet,
	ActivityIndicator,
	Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import AnimatedModal from "./AnimatedModal";
import { useSharedShimmer } from "../SkeletonLine";
import { colors, spacing, typography } from "../../theme";
import { tmdbStillUri, tmdbBackdropUri, tmdbPosterUri } from "../../hooks/useTmdbImage";

const MODAL_WIDTH = Math.min(Dimensions.get("window").width * 0.8, 320);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(dateStr: string): string {
	const [y, m, d] = dateStr.split("-");
	return `${Number.parseInt(d, 10)} ${MONTHS[Number.parseInt(m, 10) - 1]} ${y}`;
}

interface Props {
	visible: boolean;
	showTitle: string;
	season: number;
	episode: number;
	episodeTitle: string | null;
	overview: string | null;
	stillPath: string | null;
	showBackdropPath?: string | null;
	showPosterPath?: string | null;
	airDate: string | null;
	runtime: number | null;
	loadingDetails?: boolean;
	markingWatched?: boolean;
	onMarkWatched?: () => void;
	onShowPress?: () => void;
	onClose: () => void;
}

export default function EpisodeDetailModal({
	visible,
	showTitle,
	season,
	episode,
	episodeTitle,
	overview,
	stillPath,
	showBackdropPath,
	showPosterPath,
	airDate,
	runtime,
	loadingDetails,
	markingWatched,
	onMarkWatched,
	onShowPress,
	onClose,
}: Readonly<Props>) {
	const label = `S${String(season).padStart(2, "0")} | E${String(episode).padStart(2, "0")}`;
	const shimmer = useSharedShimmer();
	const [imageLoaded, setImageLoaded] = useState(false);

	return (
		<AnimatedModal visible={visible} onClose={onClose}>
			<View style={styles.content}>
				<View style={styles.imageContainer}>
					{!imageLoaded && <Animated.View style={[styles.imageSkeleton, { opacity: shimmer }]} />}
					{loadingDetails ? (
						<Animated.View
							style={[styles.still, { opacity: shimmer, backgroundColor: colors.border }]}
						/>
					) : stillPath ? (
						<Image
							source={{ uri: tmdbStillUri(stillPath, MODAL_WIDTH) }}
							style={styles.still}
							contentFit="cover"
							transition={300}
							onLoad={() => setImageLoaded(true)}
						/>
					) : showBackdropPath ? (
						<Image
							source={{ uri: tmdbBackdropUri(showBackdropPath, MODAL_WIDTH) }}
							style={styles.still}
							contentFit="cover"
							transition={300}
							onLoad={() => setImageLoaded(true)}
						/>
					) : showPosterPath ? (
						<Image
							source={{ uri: tmdbPosterUri(showPosterPath, MODAL_WIDTH) }}
							style={styles.still}
							contentFit="cover"
							transition={300}
							onLoad={() => setImageLoaded(true)}
						/>
					) : (
						<View style={styles.stillPlaceholder}>
							<Text style={styles.stillPlaceholderText}>E{String(episode).padStart(2, "0")}</Text>
						</View>
					)}
					<LinearGradient colors={["transparent", colors.surface]} style={styles.imageGradient} />
				</View>
				<ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
					{/* Show name pill */}
					<TouchableOpacity style={styles.titlePill} onPress={onShowPress} disabled={!onShowPress}>
						<Text style={styles.titlePillText} numberOfLines={1}>
							{showTitle.toUpperCase()}
						</Text>
						{onShowPress && <Text style={styles.titlePillArrowText}>›</Text>}
					</TouchableOpacity>

					{episodeTitle ? <Text style={styles.episodeTitle}>{episodeTitle}</Text> : null}

					<Text style={styles.label}>{label}</Text>

					{/* Meta */}
					<View style={styles.metaRow}>
						{airDate ? <Text style={styles.meta}>{formatDate(airDate)}</Text> : null}
						{runtime ? (
							<Text style={styles.meta}>
								{airDate ? " · " : ""}
								{runtime} min
							</Text>
						) : null}
					</View>

					{/* Description */}
					{loadingDetails ? (
						<View style={styles.overviewSkeletonWrap}>
							<Animated.View style={[styles.overviewSkeletonLine, { opacity: shimmer }]} />
							<Animated.View style={[styles.overviewSkeletonLineShort, { opacity: shimmer }]} />
							<Animated.View style={[styles.overviewSkeletonLine, { opacity: shimmer }]} />
						</View>
					) : overview ? (
						<Text style={styles.overview}>{overview}</Text>
					) : null}
				</ScrollView>
				{onMarkWatched && (
					<TouchableOpacity
						style={[styles.watchButton, markingWatched && { opacity: 0.6 }]}
						onPress={onMarkWatched}
						disabled={markingWatched}
					>
						{markingWatched ? (
							<ActivityIndicator size="small" color={colors.text} />
						) : (
							<Text style={styles.watchButtonText}>Mark as Watched</Text>
						)}
					</TouchableOpacity>
				)}
			</View>
		</AnimatedModal>
	);
}

const styles = StyleSheet.create({
	content: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		overflow: "hidden",
		maxHeight: Dimensions.get("window").height * 0.8,
	},
	imageContainer: {
		height: 160,
	},
	imageSkeleton: {
		...(StyleSheet.absoluteFill as object),
		backgroundColor: colors.surfaceLight,
	},
	still: {
		width: "100%",
		height: 160,
	},
	imageGradient: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: 80,
	},
	stillPlaceholder: {
		width: "100%",
		height: 160,
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		alignItems: "center",
	},
	stillPlaceholderText: {
		fontSize: 40,
		fontWeight: "700",
		color: colors.textMuted,
		letterSpacing: 2,
	},
	scroll: {
		flexGrow: 1,
		flexShrink: 1,
		padding: spacing.lg,
		marginTop: -50,
	},
	titlePill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderColor: colors.text,
		borderRadius: 14,
		paddingHorizontal: spacing.sm,
		paddingVertical: 3,
		marginBottom: spacing.sm,
	},
	titlePillText: {
		fontSize: 11,
		fontWeight: "600",
		color: colors.text,
		flexShrink: 1,
		letterSpacing: 0.5,
	},
	titlePillArrowText: {
		fontSize: 14,
		color: colors.text,
		marginLeft: spacing.xs,
	},
	label: {
		...typography.subtitle,
		fontSize: 16,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 1,
		paddingHorizontal: spacing.sm,
	},
	episodeTitle: {
		...typography.title,
		color: colors.text,
		marginBottom: spacing.xs,
		fontSize: 18,
		paddingHorizontal: spacing.sm,
	},
	metaRow: {
		flexDirection: "row",
		marginTop: spacing.md,
		paddingHorizontal: spacing.sm,
	},
	meta: {
		...typography.caption,
		color: colors.textSecondary,
	},
	overviewSkeletonWrap: {
		marginTop: spacing.md,
		gap: spacing.sm,
		paddingHorizontal: spacing.sm,
	},
	overviewSkeletonLine: {
		height: 12,
		borderRadius: 4,
		backgroundColor: colors.border,
	},
	overviewSkeletonLineShort: {
		height: 12,
		width: "70%",
		borderRadius: 4,
		backgroundColor: colors.border,
	},
	overview: {
		...typography.body,
		color: colors.textSecondary,
		marginTop: spacing.md,
		lineHeight: 20,
		fontSize: 13,
		paddingHorizontal: spacing.sm,
		textAlign: "justify",
	},
	watchButton: {
		backgroundColor: colors.watchedGreen,
		paddingVertical: spacing.md,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.lg,
		borderRadius: 8,
		alignItems: "center",
	},
	watchButtonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
});
