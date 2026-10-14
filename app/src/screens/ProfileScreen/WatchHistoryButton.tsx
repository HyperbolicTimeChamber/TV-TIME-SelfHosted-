import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import ArrowDropRightCircle from "../../components/icons/ArrowDropRightCircle";
import { colors } from "../../theme";
import { styles } from "./WatchHistory/styles";

/** Red pill under Watch Statistics → Watch History */
export default function WatchHistoryButton({ onPress }: { onPress: () => void }) {
	return (
		<TouchableOpacity style={styles.historyButton} onPress={onPress} activeOpacity={0.85}>
			{/* Mirrors the icon so the label is centred on the whole pill */}
			<View style={styles.historyButtonSpacer} />
			<Text style={styles.historyButtonText}>Watch History</Text>
			<ArrowDropRightCircle size={48} color={colors.text} />
		</TouchableOpacity>
	);
}
