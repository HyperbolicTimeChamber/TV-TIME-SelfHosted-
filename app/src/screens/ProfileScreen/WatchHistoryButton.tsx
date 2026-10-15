import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import ArrowDropRightCircle from "../../components/icons/ArrowDropRightCircle";
import { colors } from "../../theme";
import { styles } from "./WatchHistory/styles";

/** Red "Hall of Shame" pill (left of the Settings gear) → Watch History page */
export default function WatchHistoryButton({ onPress }: { onPress: () => void }) {
	return (
		<TouchableOpacity style={styles.historyButton} onPress={onPress} activeOpacity={0.85}>
			{/* Mirrors the icon so the label is centred on the whole pill */}
			<View style={styles.historyButtonSpacer} />
			<Text style={styles.historyButtonText}>Hall of Shame</Text>
			<ArrowDropRightCircle size={48} color={colors.text} />
		</TouchableOpacity>
	);
}
