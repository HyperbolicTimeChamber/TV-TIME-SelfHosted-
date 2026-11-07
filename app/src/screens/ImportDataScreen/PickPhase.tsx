import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { importStyles as styles } from "./styles";

interface Props {
	insetTop: number;
	onPick: () => void;
	/** Only on first launch (onboarding) — from Settings the header's back arrow leaves */
	onSkip?: () => void;
}

/** One button for both kinds of file: a TV Time export (.zip) or a Watchloom backup (.json) */
export default function PickPhase({ insetTop, onPick, onSkip }: Props) {
	return (
		<View style={[styles.centered, { paddingTop: insetTop }]}>
			<Text style={styles.title}>Import Data</Text>
			<Text style={styles.desc}>
				Pick your TV Time GDPR export (.zip) to bring over your watch history, or a Watchloom backup
				(.json) made with Export My Data to restore it.
			</Text>
			<TouchableOpacity style={styles.primaryButton} onPress={onPick}>
				<Text style={styles.buttonText}>Import Data</Text>
			</TouchableOpacity>
			{onSkip && (
				<TouchableOpacity style={styles.skipButton} onPress={onSkip}>
					<Text style={styles.skipText}>Skip</Text>
				</TouchableOpacity>
			)}
		</View>
	);
}
