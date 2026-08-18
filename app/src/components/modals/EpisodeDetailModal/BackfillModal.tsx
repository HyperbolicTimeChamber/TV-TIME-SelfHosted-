import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import AnimatedModal from "../AnimatedModal";
import { colors } from "../../../theme";
import { styles } from "./styles";

interface BackfillModalProps {
	visible: boolean;
	confirmLabel: string;
	loading: boolean;
	onConfirm: () => void;
	onDecline: () => void;
	onCancel: () => void;
}

export function BackfillModal({
	visible,
	confirmLabel,
	loading,
	onConfirm,
	onDecline,
	onCancel,
}: BackfillModalProps) {
	return (
		<AnimatedModal visible={visible} onClose={onCancel}>
			<View style={styles.backfillContent}>
				<Text style={styles.backfillTitle}>Mark Previous Episodes?</Text>
				<Text style={styles.backfillHint}>Mark episodes {confirmLabel} as watched?</Text>
				<TouchableOpacity
					style={[
						styles.backfillButton,
						{ backgroundColor: colors.watchedGreen },
						loading && { opacity: 0.6 },
					]}
					onPress={onConfirm}
					disabled={loading}
				>
					{loading ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						<Text style={styles.backfillButtonText}>Mark All</Text>
					)}
				</TouchableOpacity>
				<TouchableOpacity
					style={[styles.backfillButtonOutline, loading && { opacity: 0.6 }]}
					onPress={onDecline}
					disabled={loading}
				>
					<Text style={styles.backfillButtonOutlineText}>Just This One</Text>
				</TouchableOpacity>
				{!loading && (
					<TouchableOpacity style={styles.backfillCancel} onPress={onCancel}>
						<Text style={styles.backfillCancelText}>Cancel</Text>
					</TouchableOpacity>
				)}
			</View>
		</AnimatedModal>
	);
}
