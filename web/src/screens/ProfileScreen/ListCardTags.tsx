import { FaRegCheckCircle, FaRegPauseCircle } from "react-icons/fa";
import { HistoryPill, ListTagKind } from "@app/enums";
import type { ListTag } from "@app/utils/listCardTags";
import ProgressRing from "./WatchHistory/ProgressRing";
import WatchCountPill from "../../components/WatchCountPill";
import StatusPill from "../../components/StatusPill";
import styles from "./styles/ListDetail.module.scss";

const PILL_BG: Record<HistoryPill, string> = {
	[HistoryPill.WATCHING]: "bg-stop/60",
	[HistoryPill.REWATCHING]: "bg-stop/60",
	[HistoryPill.COMPLETED]: "bg-watched/60",
	[HistoryPill.PAUSED]: "bg-danger/60",
};

/** The tag line under a list card's meta line (app ListCardTags): Watch History's tags, small, one row */
export default function ListCardTags({
	tags,
	flush = false,
}: {
	tags: ListTag[];
	/** No space above: the caller lines the row up itself */
	flush?: boolean;
}) {
	return (
		<span className={`${styles.tagLine} ${flush ? styles.tagLineFlush : ""}`}>
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
				<StatusPill
					label={tag.label}
					bgClass={PILL_BG[tag.pill as HistoryPill]}
					count={tag.count}
					compact
				/>
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
			return <WatchCountPill count={tag.count ?? 0} label={tag.label} compact />;
		default:
			return <span className={`${styles.tag} ${styles.tagGrey}`}>{tag.label}</span>;
	}
}
