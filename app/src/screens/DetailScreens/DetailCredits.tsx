import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { tmdbPosterUri } from "../../hooks/useTmdbImage";
import type { CrewMember } from "../../types";
import { colors, spacing, typography, themedStyles } from "../../theme";

const AVATAR = 44;
const PHOTO_FADE_MS = 200;

interface Props {
	/** Names from the page's details — shown (with a person icon) until the photos arrive */
	directors: string[];
	writers: string[];
	/** With photos (titleExtras CF); replace the names once here */
	directorPeople?: CrewMember[];
	writerPeople?: CrewMember[];
}

type Person = { key: string; name: string; profile: string | null };

const people = (names: string[], withPhotos?: CrewMember[]): Person[] =>
	withPhotos && withPhotos.length > 0
		? withPhotos.map((p) => ({ key: String(p.id), name: p.name, profile: p.profile }))
		: names.map((name) => ({ key: name, name, profile: null }));

/** One credit: its red label over its people — photo + name each, two to a row */
function CreditGroup({ label, members }: Readonly<{ label: string; members: Person[] }>) {
	return (
		<View>
			<Text style={styles.creditLabel}>{label}</Text>
			<View style={styles.grid}>
				{members.map((m) => (
					<View key={m.key} style={styles.person}>
						<View style={styles.avatar}>
							{m.profile ? (
								<Image
									source={{ uri: tmdbPosterUri(m.profile, AVATAR) }}
									style={styles.avatarPhoto}
									contentFit="cover"
									transition={PHOTO_FADE_MS}
									accessibilityIgnoresInvertColors
								/>
							) : (
								<Ionicons name="person" size={22} color={colors.textMuted} />
							)}
						</View>
						<Text style={styles.name} numberOfLines={2}>
							{m.name}
						</Text>
					</View>
				))}
			</View>
		</View>
	);
}

/** Movie credits: directors and writers, each with their photo, in a two-column grid */
export default function DetailCredits({
	directors,
	writers,
	directorPeople,
	writerPeople,
}: Readonly<Props>) {
	const directing = people(directors, directorPeople);
	const writing = people(writers, writerPeople);
	if (directing.length === 0 && writing.length === 0) return null;

	return (
		<View style={styles.creditsSection}>
			{directing.length > 0 && (
				<CreditGroup label={directing.length === 1 ? "Director" : "Directors"} members={directing} />
			)}
			{writing.length > 0 && <CreditGroup label="Screenplay" members={writing} />}
		</View>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	creditsSection: {
		marginTop: spacing.xl,
		gap: spacing.lg,
		paddingHorizontal: spacing.sm,
	},
	creditLabel: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.primary,
		marginBottom: spacing.sm,
	},
	// Two columns: each person takes half the row
	grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.md },
	person: { width: "50%", flexDirection: "row", alignItems: "center", gap: spacing.md, paddingRight: spacing.sm },
	avatar: {
		width: AVATAR,
		height: AVATAR,
		borderRadius: AVATAR / 2,
		overflow: "hidden",
		backgroundColor: colors.surface,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarPhoto: { width: AVATAR, height: AVATAR },
	name: { ...typography.body, color: colors.textSecondary, flexShrink: 1 },
}));
