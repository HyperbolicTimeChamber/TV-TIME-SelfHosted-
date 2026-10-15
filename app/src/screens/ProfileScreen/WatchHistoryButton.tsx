import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { styles } from "./WatchHistory/styles";

/** Red "Hall of Shame" button (left of the Settings gear) → Watch History page */
export default function WatchHistoryButton({ onPress }: { onPress: () => void }) {
	return (
		<TouchableOpacity style={styles.historyButton} onPress={onPress} activeOpacity={0.85}>
			<Text style={styles.historyButtonText}>Hall of Shame</Text>
			<Text style={styles.historyButtonSub}>Where did all the time go</Text>
		</TouchableOpacity>
	);
}
