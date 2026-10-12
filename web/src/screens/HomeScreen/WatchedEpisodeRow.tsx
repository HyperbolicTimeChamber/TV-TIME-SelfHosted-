import { memo } from "react";
import type { WatchedEpisode } from "@app/types";
import type { EnrichedTrackingItem } from "@app/hooks/useWatchlist";
import SwipeableCard from "../../components/SwipeableCard";
import CheckmarkButton from "../../components/CheckmarkButton";
import PosterImage from "../../components/PosterImage";
import card from "../../styles/components/ShowCard.module.scss";

interface Props {
	episode: WatchedEpisode;
	show: EnrichedTrackingItem;
	onPress: (tmdbShowId: number) => void;
	onCheckmarkPress: (episode: WatchedEpisode) => void;
	onSwipeLeft: (episode: WatchedEpisode) => Promise<void>;
	onSwipeRight: (episode: WatchedEpisode) => Promise<void>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "Previously Watched" row — muted card, swipe to rewatch / unwatch */
export default memo(function WatchedEpisodeRow({ episode, show, onPress, onCheckmarkPress, onSwipeLeft, onSwipeRight }: Props) {
	return (
		<SwipeableCard
			onSwipeLeft={() => onSwipeLeft(episode)}
			onSwipeRight={() => onSwipeRight(episode)}
			leftLabel="Rewatch"
			rightLabel={episode.watchCount > 1 ? "−1" : "Unwatch"}
			persistAfterSwipe={{ left: true, right: episode.watchCount > 1 }}
		>
			<div className={card.container} style={{ opacity: 0.5 }} onClick={() => onPress(episode.tmdbShowId)} role="button">
				<PosterImage posterPath={show.posterPath} mediaType="tv" className={card.poster} style={{ opacity: 0.6 }} />
				<div className={card.info}>
					<span className={card.titlePill}>
						<span className={card.titleText}>{show.title.toUpperCase()}</span>
					</span>
					<span className={card.episode}>
						S{pad(episode.season)} | E{pad(episode.episode)}
					</span>
					{episode.episodeTitle && <span className={card.episodeName}>{episode.episodeTitle}</span>}
				</div>
				<div className={card.checkmarkWrap} onClick={(e) => e.stopPropagation()}>
					<CheckmarkButton
						size={38}
						watched
						label={episode.watchCount > 1 ? `${episode.watchCount}` : undefined}
						onPress={() => onCheckmarkPress(episode)}
					/>
				</div>
			</div>
		</SwipeableCard>
	);
});
