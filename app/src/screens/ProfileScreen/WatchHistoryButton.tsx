import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";
import { styles } from "./WatchHistory/styles";

/** Red pill under Watch Statistics → Watch History */
export default function WatchHistoryButton({ onPress }: { onPress: () => void }) {
	return (
		<TouchableOpacity style={styles.historyButton} onPress={onPress} activeOpacity={0.85}>
			<Text style={styles.historyButtonText}>Watch History</Text>
			<View style={styles.historyButtonArrow}>
				<Ionicons name="arrow-forward" size={20} color={colors.primary} />
			</View>
		</TouchableOpacity>
	);
}
