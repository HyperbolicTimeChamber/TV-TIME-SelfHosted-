import { View, Text, TouchableOpacity } from "react-native";
import { AnimatedModal, ConfirmModal, UnreleasedMovieModal } from "../../components";
import { colors, spacing } from "../../theme";
import { TMDBShow } from "../../types";
import { styles } from "./styles";

interface Props {
	movieModal: TMDBShow | null;
	onMovieModalClose: () => void;
	onMovieAddOnly: () => void;
	onMovieAddAndWatch: () => void;
	removeModal: TMDBShow | null;
	removeError: string | null;
	removing: boolean;
	onConfirmRemove: () => void;
	onRemoveModalClose: () => void;
	unreleasedModal: { title: string } | null;
	onUnreleasedClose: () => void;
	resumeModal: {
		item: TMDBShow;
		highestEp: { season: number; episode: number };
		nextEp: { season: number; episode: number };
	} | null;
	onResumeFromWhere: () => void;
	onStartFresh: () => void;
	onResumeModalClose: () => void;
}

export default function SearchModals({
	movieModal,
	onMovieModalClose,
	onMovieAddOnly,
	onMovieAddAndWatch,
	removeModal,
	removeError,
	removing,
	onConfirmRemove,
	onRemoveModalClose,
	unreleasedModal,
	onUnreleasedClose,
	resumeModal,
	onResumeFromWhere,
	onStartFresh,
	onResumeModalClose,
}: Props) {
	return (
		<>
			<AnimatedModal visible={!!movieModal} onClose={onMovieModalClose}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>{movieModal?.title || movieModal?.name}</Text>
					<TouchableOpacity style={styles.modalButton} onPress={onMovieAddOnly}>
						<Text style={styles.modalButtonText}>Add to Watchlist</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[styles.modalButton, styles.modalButtonWatched]}
						onPress={onMovieAddAndWatch}
					>
						<Text style={styles.modalButtonText}>Add & Mark as Watched</Text>
					</TouchableOpacity>
					<TouchableOpacity style={styles.modalCancel} onPress={onMovieModalClose}>
						<Text style={styles.modalCancelText}>Cancel</Text>
					</TouchableOpacity>
				</View>
			</AnimatedModal>

			<ConfirmModal
				visible={!!removeModal}
				title={`Remove "${removeModal?.name || removeModal?.title}"?`}
				hint="This will remove it from your watchlist. Your watch history will be kept."
				error={removeError}
				confirmLabel="Remove"
				loading={removing}
				onConfirm={onConfirmRemove}
				onClose={onRemoveModalClose}
			/>

			<UnreleasedMovieModal
				visible={!!unreleasedModal}
				onClose={onUnreleasedClose}
				movieTitle={unreleasedModal?.title ?? ""}
			/>

			<AnimatedModal visible={!!resumeModal} onClose={onResumeModalClose}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>
						{resumeModal?.item?.name || resumeModal?.item?.title}
					</Text>
					<Text style={[styles.modalCancelText, { marginBottom: spacing.lg, textAlign: "center" }]}>
						You've previously watched up to S
						{String(resumeModal?.highestEp?.season).padStart(2, "0")}E
						{String(resumeModal?.highestEp?.episode).padStart(2, "0")}
					</Text>
					<TouchableOpacity style={styles.modalButton} onPress={onResumeFromWhere}>
						<Text style={styles.modalButtonText}>
							Resume from S{String(resumeModal?.nextEp?.season).padStart(2, "0")}E
							{String(resumeModal?.nextEp?.episode).padStart(2, "0")}
						</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[styles.modalButton, { backgroundColor: colors.surfaceLight }]}
						onPress={onStartFresh}
					>
						<Text style={styles.modalButtonText}>Start from Beginning</Text>
					</TouchableOpacity>
					<TouchableOpacity style={styles.modalCancel} onPress={onResumeModalClose}>
						<Text style={styles.modalCancelText}>Cancel</Text>
					</TouchableOpacity>
				</View>
			</AnimatedModal>
		</>
	);
}
