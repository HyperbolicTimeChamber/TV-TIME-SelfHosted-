import React, { useRef } from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { useTitleExtras } from "../hooks/useTitleExtras";
import { useCountryName } from "../hooks/useWatchProviders";
import { localReleaseLine } from "../utils/localRelease";
import { MediaType } from "../enums";
import { colors, typography } from "../theme";

/** The line arriving after it opened: quick, so it never reads as a pop */
const FADE_MS = 160;

interface Props {
	tmdbId: number;
	style?: StyleProp<TextStyle>;
}

/** A movie's release in the viewer's country (info page, info drawer). Nothing when there's no date */
export default function LocalReleaseLine({ tmdbId, style }: Readonly<Props>) {
	const { data, region } = useTitleExtras(tmdbId, MediaType.MOVIE);
	const country = useCountryName(region);
	const line = localReleaseLine(data?.localRelease, country);
	const hadLineAtOpen = useRef(line !== null).current;
	if (!line) return null;
	return (
		<Reanimated.Text
			entering={hadLineAtOpen ? undefined : FadeIn.duration(FADE_MS)}
			style={[styles.line, style]}
		>
			{line}
		</Reanimated.Text>
	);
}

const styles = StyleSheet.create({
	line: { ...typography.caption, color: colors.text },
});
