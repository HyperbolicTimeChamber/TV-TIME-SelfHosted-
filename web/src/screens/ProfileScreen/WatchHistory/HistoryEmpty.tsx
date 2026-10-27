import { MediaType } from "@app/enums";
import styles from "./styles/WatchHistory.module.scss";

/** Hall of Shame with nothing in it: Squidward on the left, his take on the right (app HistoryEmpty) */
export default function HistoryEmpty({
	mediaType,
	filtered,
}: {
	mediaType: MediaType;
	filtered: boolean;
}) {
	const kind = mediaType === MediaType.MOVIE ? "movies" : "shows";
	return (
		<div className={styles.emptyRow}>
			<img className={styles.emptyArt} src="/history-empty.webp" alt="" />
			<div>
				<p className={styles.emptyTitle}>
					{filtered ? "Oh, look. Nothing." : "What did you expect to find here?"}
				</p>
				<p className={styles.emptyBody}>
					{filtered
						? `Not one of your ${kind} fits these filters. Shocking, I know.`
						: `You haven't watched any ${kind} yet. Truly a cruel reminder of how empty this place is.`}
				</p>
			</div>
		</div>
	);
}
