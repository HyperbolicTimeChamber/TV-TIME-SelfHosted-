import { HistoryPill, HistoryProgress, ListTagKind } from "@app/enums";
import type { ListTag } from "@app/utils/listCardTags";
import ProgressPill from "./WatchHistory/ProgressPill";
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
			return <ProgressPill kind={HistoryProgress.PERCENT} percent={tag.percent ?? 0} compact />;
		case ListTagKind.UP_TO_DATE:
			return <ProgressPill kind={HistoryProgress.UP_TO_DATE} compact />;
		case ListTagKind.PAUSED:
			return <ProgressPill kind={HistoryProgress.PAUSED} compact />;
		case ListTagKind.WATCH_COUNT:
			return <WatchCountPill count={tag.count ?? 0} label={tag.label} compact />;
		case ListTagKind.NOT_STARTED:
			// Red, like the Incomplete status pill
			return <StatusPill label={tag.label} bgClass={PILL_BG[HistoryPill.PAUSED]} compact />;
		default:
			return <span className={`${styles.tag} ${styles.tagGrey}`}>{tag.label}</span>;
	}
}
