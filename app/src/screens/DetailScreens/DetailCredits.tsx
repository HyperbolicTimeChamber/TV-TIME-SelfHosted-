import React, { useState } from "react";
import { Animated, View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { tmdbPosterUri } from "../../hooks/useTmdbImage";
import { useSharedShimmer } from "../../components/SkeletonLine";
import PhotoTrigger from "../../components/PhotoViewer";
import { personSubject } from "../../utils/subjectLink";
import type { MediaType } from "../../enums";
import type { CrewMember } from "../../types";
import { colors, spacing, typography, themedStyles } from "../../theme";

const AVATAR = 44;
const PHOTO_FADE_MS = 200;

interface Props {
	tmdbId: number;
	mediaType: MediaType;
	/** Names from the page's details — shown (with a person icon) until the photos arrive */
	directors: string[];
	writers: string[];
	/** With photos (titleExtras CF); replace the names once here */
	directorPeople?: CrewMember[];
	writerPeople?: CrewMember[];
	/** The photos are still being fetched (shimmer, not a person icon that looks final) */
	photosPending?: boolean;
}

type Person = CrewMember & { key: string };

const people = (names: string[], withPhotos?: CrewMember[]): Person[] =>
	withPhotos && withPhotos.length > 0
		? withPhotos.map((p) => ({ ...p, key: String(p.id) }))
		: names.map((name) => ({ id: 0, key: name, name, profile: null }));

/** Shimmers until there's something to show; a person icon only when they really have no photo */
function Avatar({ profile, pending }: Readonly<{ profile: string | null; pending: boolean }>) {
	const shimmer = useSharedShimmer();
	const [loaded, setLoaded] = useState(false);
	const shimmering = pending || (!!profile && !loaded);
	return (
		<View style={styles.avatar}>
			{shimmering ? (
				<Animated.View style={[StyleSheet.absoluteFill, styles.avatarShimmer, { opacity: shimmer }]} />
			) : null}
			{profile ? (
				<Image
					source={{ uri: tmdbPosterUri(profile, AVATAR) }}
					style={styles.avatarPhoto}
					contentFit="cover"
					transition={PHOTO_FADE_MS}
					onLoad={() => setLoaded(true)}
					onError={() => setLoaded(true)}
					accessibilityIgnoresInvertColors
				/>
			) : shimmering ? null : (
				<Ionicons name="person" size={22} color={colors.textMuted} />
			)}
		</View>
	);
}

/** One credit: its red label over its people — photo + name each, two to a row */
function CreditGroup({
	label,
	members,
	pending,
	title,
}: Readonly<{
	label: string;
	members: Person[];
	pending: boolean;
	title: { tmdbId: number; mediaType: MediaType };
}>) {
	return (
		<View>
			<Text style={styles.creditLabel}>{label}</Text>
			<View style={styles.grid}>
				{members.map((m) => (
					<View key={m.key} style={styles.person}>
						<PhotoTrigger
							subject={m.profile ? personSubject(m, title) : null}
							radius={AVATAR / 2}
							thumbWidth={AVATAR}
							style={styles.avatarSlot}
						>
							<Avatar profile={m.profile} pending={pending} />
						</PhotoTrigger>
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
	tmdbId,
	mediaType,
	directors,
	writers,
	directorPeople,
	writerPeople,
	photosPending = false,
}: Readonly<Props>) {
	const directing = people(directors, directorPeople);
	const writing = people(writers, writerPeople);
	if (directing.length === 0 && writing.length === 0) return null;

	return (
		<View style={styles.creditsSection}>
			{directing.length > 0 && (
				<CreditGroup
					label={directing.length === 1 ? "Director" : "Directors"}
					members={directing}
					pending={photosPending}
					title={{ tmdbId, mediaType }}
				/>
			)}
			{writing.length > 0 && (
				<CreditGroup
					label="Screenplay"
					members={writing}
					pending={photosPending}
					title={{ tmdbId, mediaType }}
				/>
			)}
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
	avatarSlot: { width: AVATAR, height: AVATAR },
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
	avatarShimmer: { backgroundColor: colors.border },
	name: { ...typography.body, color: colors.textSecondary, flexShrink: 1 },
}));
