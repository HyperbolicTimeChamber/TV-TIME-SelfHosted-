import React, { useRef } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { useTitleExtras } from "../hooks/useTitleExtras";
import { useCountryName } from "../hooks/useWatchProviders";
import { isSameRelease, localReleaseSentence, localReleaseText } from "../utils/localRelease";
import { MediaType } from "../enums";
import { colors, fonts, typography, themedStyles } from "../theme";

/** Arriving after it opened: quick, so it never reads as a pop */
const FADE_MS = 160;

function useLocalRelease(tmdbId: number) {
	const { data, region } = useTitleExtras(tmdbId, MediaType.MOVIE);
	const country = useCountryName(region);
	const text = localReleaseText(data?.localRelease, country);
	const hadTextAtOpen = useRef(text !== null).current;
	return { text, date: data?.localRelease, entering: hadTextAtOpen ? undefined : FadeIn.duration(FADE_MS) };
}

/**
 * Info page: a movie's release in the viewer's country, as a red label like the credits' over the
 * date in the stats' big numeral face. Nothing when there's no date, or it's the global one
 */
export default function LocalReleaseLine({
	tmdbId,
	globalRelease,
	style,
}: Readonly<{ tmdbId: number; globalRelease: string | null | undefined; style?: StyleProp<ViewStyle> }>) {
	const { text, date, entering } = useLocalRelease(tmdbId);
	if (!text || isSameRelease(date, globalRelease)) return null;
	return (
		<Reanimated.View
			entering={entering}
			style={style}
			accessible
			accessibilityLabel={`${text.title} ${text.date}`}
		>
			<Text style={styles.label}>{text.title}</Text>
			<Text style={styles.date}>{text.date}</Text>
		</Reanimated.View>
	);
}

/** Info drawer: the same, as one line of text beside the runtime */
export function LocalReleaseInline({
	tmdbId,
	style,
}: Readonly<{ tmdbId: number; style?: StyleProp<TextStyle> }>) {
	const { text, entering } = useLocalRelease(tmdbId);
	if (!text) return null;
	return (
		<Reanimated.Text entering={entering} style={style} numberOfLines={2}>
			{localReleaseSentence(text)}
		</Reanimated.Text>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	label: { ...typography.subtitle, fontSize: 14, color: colors.primary },
	date: { fontFamily: fonts.smoochMedium, fontSize: 24, letterSpacing: 0.5, color: colors.text },
}));
