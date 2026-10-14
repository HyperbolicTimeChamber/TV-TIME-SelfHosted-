import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { importStyles as styles } from "./styles";

interface Props {
	insetTop: number;
	onPickFile: () => void;
	onSkip: () => void;
}

export default function PickPhase({ insetTop, onPickFile, onSkip }: Props) {
	return (
		<View style={[styles.centered, { paddingTop: insetTop }]}>
			<Text style={styles.title}>Import TV Time Data</Text>
			<Text style={styles.desc}>
				Select your TV Time GDPR export (.zip) to import your watch history.
			</Text>
			<TouchableOpacity style={styles.primaryButton} onPress={onPickFile}>
				<Text style={styles.buttonText}>Select ZIP File</Text>
			</TouchableOpacity>
			<TouchableOpacity style={styles.skipButton} onPress={onSkip}>
				<Text style={styles.skipText}>Skip</Text>
			</TouchableOpacity>
		</View>
	);
}
