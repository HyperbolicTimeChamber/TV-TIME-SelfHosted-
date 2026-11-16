import { useMovieSheetDetails } from "@app/hooks/useMovieSheetDetails";
import { directorLabel, movieSheetMeta } from "@app/utils/movieSheet";
import SkeletonBlock from "../../components/SkeletonBlock";
import styles from "./styles/MovieSheetInfo.module.scss";

interface Props {
	tmdbId: number;
	/** From the search item — shown at once ("2010") */
	year: string | null;
}

/** Under the add sheet's title (app MovieSheetInfo): year · runtime, director, overview; placeholders while loading */
export default function MovieSheetInfo({ tmdbId, year }: Props) {
	const { data, isPending } = useMovieSheetDetails(tmdbId);
	const meta = movieSheetMeta(year, data?.runtime ?? null);
	const directors = data?.directors ?? [];
	const overview = data?.overview ?? "";
	return (
		<div className={styles.wrap}>
			{meta && <p className={styles.meta}>{meta}</p>}
			{isPending ? (
				<div className={styles.skeletons} role="status" aria-label="Loading details">
					<SkeletonBlock className={styles.skeletonDirector} />
					<SkeletonBlock className={styles.skeletonLine} />
					<SkeletonBlock className={styles.skeletonLineShort} />
				</div>
			) : (
				<>
					{directors.length > 0 && (
						<p className={styles.director}>
							<span className={styles.label}>{directorLabel(directors.length)}</span>
							{directors.join(", ")}
						</p>
					)}
					{overview && <p className={styles.overview}>{overview}</p>}
				</>
			)}
		</div>
	);
}
