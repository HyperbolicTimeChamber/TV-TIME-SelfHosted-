import { memo, useEffect, useRef, useState } from "react";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
	View,
	Text,
	ScrollView,
	TouchableOpacity,
	Animated,
	ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { useSharedShimmer } from "../../SkeletonLine";
import { colors, spacing } from "../../../theme";
import { tmdbStillUri, tmdbBackdropUri, tmdbPosterUri } from "../../../hooks/useTmdbImage";
import { CARD_WIDTH, POSTER_FALLBACK_DELAY_MS, formatDate } from "./constants";
import { styles } from "./styles";
import type { CarouselEpisode } from "../../../types/episodeCarousel";
import { WhereToWatchCompact, WhereToWatchPlacement } from "../../WhereToWatch";
import { MediaType } from "../../../enums";

/** Cards growing / shrinking to a new shared height: an on-screen morph → ease-in-out */
const HEIGHT_MS = 260;
const HEIGHT_EASE = Easing.bezier(0.77, 0, 0.175, 1);

export const EpisodeCard = memo(function EpisodeCard({
	ep,
	showTitle,
	showPosterPath,
	showBackdropPath,
	isWatched,
	watchCount,
	isLoaded,
	isMarking,
	readOnly,
	markLabel,
	onMarkWatched,
	onUnwatch,
	onRewatch,
	onSkip,
	onShowPress,
	tmdbId,
	cardHeight,
	onBottomLayout,
}: {
	/** The carousel's shared card height (every card the same: fits the longest description) */
	cardHeight: number;
	/** Height of the "Watch on" row + buttons, for the carousel's card height */
	onBottomLayout?: (height: number) => void;
	/** The show's TMDB id: its Where to Watch row above the buttons */
	tmdbId?: number;
	ep: CarouselEpisode;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath: string | null;
	isWatched: boolean;
	watchCount: number;
	isLoaded: boolean;
	isMarking: boolean;
	/** Info only: no watch / unwatch / skip buttons */
	readOnly?: boolean;
	/** Green button text ("Mark as Watched" / "Mark 2nd Rewatch") */
	markLabel: string;
	onMarkWatched: () => void;
	onUnwatch: () => void;
	onRewatch: () => void;
	/** Rewatch only: move past this episode without watching it */
	onSkip?: () => void;
	onShowPress?: () => void;
}) {
	const skipButton = onSkip ? (
		<TouchableOpacity
			style={[styles.skipButton, isMarking && { opacity: 0.6 }]}
			onPress={onSkip}
			disabled={isMarking}
		>
			<Text style={styles.actionButtonText}>Skip</Text>
		</TouchableOpacity>
	) : null;
	const shimmer = useSharedShimmer();
	const [imageLoaded, setImageLoaded] = useState(false);
	// Poster fallback only after a wait, the shimmer showing meanwhile (was a flash of poster)
	const [posterWaited, setPosterWaited] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setPosterWaited(true), POSTER_FALLBACK_DELAY_MS);
		return () => clearTimeout(t);
	}, []);
	const label = `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`;

	// The carousel's shared height: when a longer description loads (another season), every card
	// grows to it smoothly instead of jumping
	const height = useSharedValue(cardHeight);
	useEffect(() => {
		height.value = withTiming(cardHeight, { duration: HEIGHT_MS, easing: HEIGHT_EASE });
	}, [cardHeight, height]);
	const animatedHeight = useAnimatedStyle(() => ({ height: height.value }));

	// "Watch on" + buttons heights, summed for the carousel's card height
	const chrome = useRef({ watchOn: 0, buttons: 0 });
	const reportChrome = (part: "watchOn" | "buttons", h: number) => {
		chrome.current[part] = h;
		onBottomLayout?.(chrome.current.watchOn + chrome.current.buttons);
	};

	if (!isLoaded) {
		return (
			<View style={[styles.cardContent, { height: cardHeight }]}>
				<Animated.View
					style={[styles.imageContainer, { opacity: shimmer, backgroundColor: colors.border }]}
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
		<Reanimated.View style={[styles.cardContent, animatedHeight]}>
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
				) : showPosterPath && posterWaited ? (
					<Image
						source={{ uri: tmdbPosterUri(showPosterPath, CARD_WIDTH) }}
						style={styles.still}
						contentFit="cover"
						transition={300}
						onLoad={() => setImageLoaded(true)}
					/>
				) : showPosterPath ? null : (
					<View style={styles.stillPlaceholder}>
						<Text style={styles.stillPlaceholderText}>E{String(ep.episode).padStart(2, "0")}</Text>
					</View>
				)}
				<LinearGradient colors={["transparent", colors.background]} style={styles.imageGradient} />
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
					{ep.overview ? (
						<Text style={styles.overview}>{ep.overview}</Text>
					) : (
						<Text style={[styles.overview, styles.overviewEmpty]}>
							No description available yet.
						</Text>
					)}
				</ScrollView>
			</View>

			{/* "Watch on": the show's services, small, right under the description (nothing when none) */}
			{tmdbId != null ? (
				// Measured on an outer view: a view's own margins aren't part of its layout height
				<View onLayout={(e) => reportChrome("watchOn", e.nativeEvent.layout.height)}>
					<View style={styles.watchOn}>
						<WhereToWatchCompact
							tmdbId={tmdbId}
							mediaType={MediaType.TV}
							title={showTitle}
							placement={WhereToWatchPlacement.MODAL}
						/>
					</View>
				</View>
			) : null}

			{/* Free space of a card shorter than the carousel's height: between the text and the buttons */}
			<View style={styles.cardSpacer} />

			{/* Buttons (measured for the shared card height) */}
			<View onLayout={(e) => reportChrome("buttons", e.nativeEvent.layout.height)}>
				{/* Button row */}
				{readOnly ? null : isWatched ? (
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
						{skipButton}
					</View>
				) : skipButton ? (
					// Rewatch: Skip first, then "Mark Nth Rewatch"
					<View style={styles.watchedButtonRow}>
						{skipButton}
						<TouchableOpacity
							style={[styles.markInRow, isMarking && { opacity: 0.6 }]}
							onPress={onMarkWatched}
							disabled={isMarking}
						>
							{isMarking ? (
								<ActivityIndicator size="small" color={colors.text} />
							) : (
								<Text style={styles.actionButtonText}>{markLabel}</Text>
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
							<Text style={styles.actionButtonText}>{markLabel}</Text>
						)}
					</TouchableOpacity>
				)}
			</View>
		</Reanimated.View>
	);
});
