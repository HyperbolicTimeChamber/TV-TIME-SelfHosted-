import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CARD_WIDTH, epKey, formatDate } from "./constants";
import { styles } from "./styles";
import type { CarouselEpisode } from "../../../types/episodeCarousel";

/**
 * Invisible copies of every episode's text block (title pill, name, S/E label, date, full
 * description) at the card's width: their heights let the carousel size every card to the
 * longest one, so no description is cut and all cards stay one height
 */
export const CardMeasure = memo(function CardMeasure({
	episodes,
	showTitle,
	onMeasure,
}: Readonly<{
	episodes: CarouselEpisode[];
	showTitle: string;
	onMeasure: (key: string, height: number) => void;
}>) {
	return (
		<View style={measureStyles.root} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			{episodes.map((ep) => {
				const key = epKey(ep.season, ep.episode);
				return (
					<View
						key={key}
						style={measureStyles.card}
						onLayout={(e) => onMeasure(key, e.nativeEvent.layout.height)}
					>
						<View style={styles.measureMeta}>
							<View style={styles.titlePill}>
								<Text style={styles.titlePillText} numberOfLines={1}>
									{showTitle.toUpperCase()}
								</Text>
							</View>
							{ep.title ? <Text style={styles.episodeTitle}>{ep.title}</Text> : null}
							<Text style={styles.label}>S00 | E00</Text>
						</View>
						<View style={styles.overviewContainer}>
							<View style={styles.metaRow}>
								<Text style={styles.meta}>{ep.airDate ? formatDate(ep.airDate) : " "}</Text>
							</View>
							<Text style={[styles.overview, !ep.overview && styles.overviewEmpty]}>
								{ep.overview || "No description available yet."}
							</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
});

const measureStyles = StyleSheet.create({
	// Off screen and invisible, but laid out at the card's width
	root: { position: "absolute", left: -10000, top: 0, width: CARD_WIDTH, opacity: 0 },
	card: { width: CARD_WIDTH },
});
