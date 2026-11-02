import { FaRegCheckCircle, FaRegPauseCircle } from "react-icons/fa";
import { HistoryPill, ListTagKind } from "@app/enums";
import type { ListTag } from "@app/utils/listCardTags";
import ProgressRing from "./WatchHistory/ProgressRing";
import styles from "./styles/ListDetail.module.scss";

const PILL_BG: Record<HistoryPill, string> = {
	[HistoryPill.WATCHING]: "bg-stop/60",
	[HistoryPill.REWATCHING]: "bg-stop/60",
	[HistoryPill.COMPLETED]: "bg-watched/60",
	[HistoryPill.PAUSED]: "bg-danger/60",
};

/** The tag line under a list card's meta line (app ListCardTags): Watch History's tags, small, one row */
export default function ListCardTags({ tags }: { tags: ListTag[] }) {
	return (
		<span className={styles.tagLine}>
			{tags.map((t) => (
				<Tag key={t.kind} tag={t} />
			))}
		</span>
	);
}

function Tag({ tag }: { tag: ListTag }) {
	switch (tag.kind) {
		case ListTagKind.STATUS:
			return (
				<span className={`${styles.tag} ${PILL_BG[tag.pill as HistoryPill]}`}>
					{tag.label}
					{tag.count != null && <span className={styles.tagCount}>{tag.count}</span>}
				</span>
			);
		case ListTagKind.PERCENT:
			return (
				<span className={`${styles.tag} bg-warning text-surface`}>
					<span className={styles.tagRing}>
						<ProgressRing percent={tag.percent ?? 0} />
					</span>
					{tag.label}
				</span>
			);
		case ListTagKind.UP_TO_DATE:
			return (
				<span className={`${styles.tag} bg-watched`}>
					<FaRegCheckCircle size={14} className="block shrink-0" />
					{tag.label}
				</span>
			);
		case ListTagKind.PAUSED:
			return (
				<span className={`${styles.tag} bg-movie`}>
					<FaRegPauseCircle size={14} className="block shrink-0" />
					{tag.label}
				</span>
			);
		case ListTagKind.WATCH_COUNT:
			return (
				<span className={`${styles.tag} ${styles.tagGrey}`}>
					{tag.label}
					<span className={styles.tagCount}>{tag.count}</span>
				</span>
			);
		default:
			return <span className={`${styles.tag} ${styles.tagGrey}`}>{tag.label}</span>;
	}
}
