import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { HistoryPill, HistoryProgress, ListTagKind } from "../../enums";
import type { ListTag } from "../../utils";
import { colors, spacing } from "../../theme";
import ProgressPill from "./WatchHistory/ProgressPill";
import WatchCountPill from "../../components/WatchCountPill";
import StatusPill from "../../components/StatusPill";
import { PILL_COLOR } from "./WatchHistory/HistoryCardView";

const GREY = `${colors.textSecondary}59`;

/** The tag line under a list card's meta line: Watch History's tags, small, always one row */
export default function ListCardTags({
	tags,
	flush = false,
}: Readonly<{
	tags: ListTag[];
	/** No space above: the caller lines the row up itself */ flush?: boolean;
}>) {
	return (
		<View style={[styles.line, flush && styles.lineFlush]}>
			{tags.map((t) => (
				<Tag key={t.kind} tag={t} />
			))}
		</View>
	);
}

function Tag({ tag }: Readonly<{ tag: ListTag }>) {
	switch (tag.kind) {
		case ListTagKind.STATUS:
			return (
				<StatusPill
					label={tag.label}
					color={PILL_COLOR[tag.pill as HistoryPill]}
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
			return <StatusPill label={tag.label} color={PILL_COLOR[HistoryPill.PAUSED]} compact />;
		default:
			// Ongoing / Ended / Not Watched: plain grey
			return (
				<View style={[styles.tag, { backgroundColor: GREY }]}>
					<Text style={styles.text}>{tag.label}</Text>
				</View>
			);
	}
}

const styles = StyleSheet.create({
	line: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs + 2,
		marginTop: spacing.sm,
		overflow: "hidden",
	},
	lineFlush: { marginTop: 0 },
	tag: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 999,
		paddingHorizontal: 8,
		// 26 tall, like the status / progress / count pills on the line
		paddingVertical: 5,
	},
	text: { color: colors.text, fontSize: 11, lineHeight: 16, fontWeight: "700" },
	countCircle: {
		minWidth: 14,
		height: 14,
		borderRadius: 7,
		paddingHorizontal: 3,
		backgroundColor: colors.text,
		alignItems: "center",
		justifyContent: "center",
	},
	countText: { color: colors.surface, fontSize: 10, fontWeight: "700" },
});
