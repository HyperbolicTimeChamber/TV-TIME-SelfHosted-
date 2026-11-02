import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { importStyles as styles } from "./styles";

interface Props {
	insetTop: number;
	onPickFile: () => void;
	onPickBackup: () => void;
	onSkip: () => void;
}

export default function PickPhase({ insetTop, onPickFile, onPickBackup, onSkip }: Props) {
	return (
		<View style={[styles.centered, { paddingTop: insetTop }]}>
			<Text style={styles.title}>Import TV Time Data</Text>
			<Text style={styles.desc}>
				Select your TV Time GDPR export (.zip) to import your watch history.
			</Text>
			<TouchableOpacity style={styles.primaryButton} onPress={onPickFile}>
				<Text style={styles.buttonText}>Select ZIP File</Text>
			</TouchableOpacity>
			<Text style={[styles.desc, { marginTop: 24 }]}>
				Or restore a Watchloom export (.json) made with Export My Data.
			</Text>
			<TouchableOpacity style={styles.primaryButton} onPress={onPickBackup}>
				<Text style={styles.buttonText}>Select Watchloom Export</Text>
			</TouchableOpacity>
			<TouchableOpacity style={styles.skipButton} onPress={onSkip}>
				<Text style={styles.skipText}>Skip</Text>
			</TouchableOpacity>
		</View>
	);
}
