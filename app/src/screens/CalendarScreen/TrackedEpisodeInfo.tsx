import { useEffect, useRef } from "react";
import EpisodeDetailModal from "../../components/modals/EpisodeDetailModal";
import { useSeasonActions } from "../../components/useSeasonActions";
import { useShowDetailActions } from "../DetailScreens/useShowDetailActions";
import { MediaType } from "../../types";
import type { CalendarEpisode } from "../useCalendarScreen";

interface Props {
	episode: CalendarEpisode;
	onShowPress: () => void;
	onClose: () => void;
	/** The episode can't be opened for marking (show / season data missing) */
	onUnavailable: () => void;
}

/**
 * Info card of an aired episode with real watch buttons: the season list's own marking logic
 * (tracking advance, rewatch rules, "Whoa there Speedster!" backfill) driven for one episode.
 * Renders nothing until the show, its tracking doc and watched counts are in.
 */
export default function TrackedEpisodeInfo({ episode, onShowPress, onClose, onUnavailable }: Props) {
	const { show, episodesBySeason, watchlistItem, trackingLoading, seasonLayout } =
		useShowDetailActions(episode.tmdbShowId, MediaType.TV);
	const season = show?.seasons?.find((s) => s.season_number === episode.season);
	if (!show || !season) {
		return <Unavailable ready={!!show} onUnavailable={onUnavailable} />;
	}
	return (
		<Opener
			key={`${episode.tmdbShowId}_${episode.season}_${episode.episode}`}
			episode={episode}
			show={show}
			season={season}
			episodesBySeason={episodesBySeason}
			watchlistItem={watchlistItem}
			trackingLoading={trackingLoading}
			seasonLayout={seasonLayout}
			onShowPress={onShowPress}
			onClose={onClose}
			onUnavailable={onUnavailable}
		/>
	);
}

/** Show loaded but without this season → give up; show still loading → wait */
function Unavailable({ ready, onUnavailable }: { ready: boolean; onUnavailable: () => void }) {
	useEffect(() => {
		if (ready) onUnavailable();
	}, [ready, onUnavailable]);
	return null;
}

function Opener({
	episode,
	show,
	season,
	episodesBySeason,
	watchlistItem,
	trackingLoading,
	seasonLayout,
	onShowPress,
	onClose,
	onUnavailable,
}: Props & {
	show: NonNullable<ReturnType<typeof useShowDetailActions>["show"]>;
	season: NonNullable<NonNullable<typeof show.seasons>[number]>;
	episodesBySeason: ReturnType<typeof useShowDetailActions>["episodesBySeason"];
	watchlistItem: any;
	trackingLoading: boolean;
	seasonLayout: ReturnType<typeof useShowDetailActions>["seasonLayout"];
}) {
	const a = useSeasonActions({
		tmdbId: episode.tmdbShowId,
		season,
		showTitle: episode.showTitle,
		showPosterPath: episode.posterPath,
		showBackdropPath: episode.backdropPath,
		isTracked: !!watchlistItem,
		preloadedEpisodes: episodesBySeason.get(season.season_number),
		trackingItem: watchlistItem,
		seasonLayout,
		episodesBySeason,
	});
	const opened = useRef(false);
	const ready = !trackingLoading && !a.isLoading && !a.watchedLoading;
	useEffect(() => {
		if (opened.current || !ready) return;
		const tmdbEp = a.episodes.find((e: any) => e.episode_number === episode.episode);
		if (!tmdbEp) {
			opened.current = true;
			onUnavailable();
			return;
		}
		opened.current = true;
		a.handleEpisodePress(tmdbEp);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ready]);

	const d = a.epInfoData;
	if (!d) return null;
	return (
		<EpisodeDetailModal
			visible={a.epInfoVisible}
			tmdbId={d.tmdbId}
			showTitle={d.showTitle}
			showPosterPath={d.showPosterPath}
			showBackdropPath={d.showBackdropPath}
			episodes={d.episodes}
			initialIndex={d.initialIndex}
			watchedKeys={d.watchedKeys}
			currentNextEpisode={d.currentNextEpisode}
			rewatchCount={d.rewatchCount}
			onMarkWatched={a.handleCarouselMark}
			onMarkWatchedThrough={a.handleCarouselMarkThrough}
			onUnmarkWatched={a.handleCarouselUnmark}
			onShowPress={onShowPress}
			onClose={onClose}
		/>
	);
}
