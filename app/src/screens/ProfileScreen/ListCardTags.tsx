import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HistoryPill, ListTagKind } from "../../enums";
import type { ListTag } from "../../utils";
import { colors, spacing } from "../../theme";
import ProgressRing from "./WatchHistory/ProgressRing";
import { RING_SIZE } from "./WatchHistory/styles";
import { PILL_COLOR } from "./WatchHistory/HistoryCardView";

/** Icon / ring size on the tag line */
const ICON = 14;

const GREY = `${colors.textSecondary}59`;

/** The tag line under a list card's meta line: Watch History's tags, small, always one row */
export default function ListCardTags({
	tags,
	flush = false,
}: Readonly<{ tags: ListTag[]; /** No space above: the caller lines the row up itself */ flush?: boolean }>) {
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
				<View style={[styles.tag, { backgroundColor: PILL_COLOR[tag.pill as HistoryPill] }]}>
					<Text style={styles.text}>{tag.label}</Text>
					{tag.count != null && (
						<View style={styles.countCircle}>
							<Text style={styles.countText}>{tag.count}</Text>
						</View>
					)}
				</View>
			);
		case ListTagKind.PERCENT:
			return (
				<View style={[styles.tag, { backgroundColor: colors.warningAmber }]}>
					<View style={styles.ring}>
						<View style={styles.ringScale}>
							<ProgressRing percent={tag.percent ?? 0} />
						</View>
					</View>
					<Text style={[styles.text, { color: colors.surface }]}>{tag.label}</Text>
				</View>
			);
		case ListTagKind.UP_TO_DATE:
		case ListTagKind.PAUSED: {
			const upToDate = tag.kind === ListTagKind.UP_TO_DATE;
			return (
				<View
					style={[
						styles.tag,
						{ backgroundColor: upToDate ? colors.watchedGreen : colors.moviePurple },
					]}
				>
					<Ionicons
						name={upToDate ? "checkmark-circle-outline" : "pause-circle-outline"}
						size={ICON}
						color={colors.text}
					/>
					<Text style={styles.text}>{tag.label}</Text>
				</View>
			);
		}
		case ListTagKind.WATCH_COUNT:
			return (
				<View style={[styles.tag, { backgroundColor: GREY }]}>
					<Text style={styles.text}>{tag.label}</Text>
					<View style={styles.countCircle}>
						<Text style={styles.countText}>{tag.count}</Text>
					</View>
				</View>
			);
		default:
			// Ongoing / Ended / Not Started / Not Watched: plain grey
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
		paddingVertical: 3,
	},
	text: { color: colors.text, fontSize: 11, fontWeight: "700" },
	// ProgressRing is RING_SIZE wide: scaled down to the tag line
	ring: { width: ICON, height: ICON, alignItems: "center", justifyContent: "center" },
	ringScale: { transform: [{ scale: ICON / RING_SIZE }] },
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
