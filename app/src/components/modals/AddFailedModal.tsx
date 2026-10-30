import { View } from "react-native";
import ConfirmModal from "./ConfirmModal";
import { DEFEATED_ART, DEFEATED_RATIO, ModalArt } from "./ModalArt";
import type { AddFailure } from "../../types";
import { spacing } from "../../theme";

/**
 * "Couldn't add" popup — the same ConfirmModal every other choice uses, so a failed add is an
 * in-app dialog the user sees while they're still on the page, not a native Alert that queues
 * up and fires the next time the app is opened.
 */
export default function AddFailedModal({
	failure,
	retrying = false,
	onRetry,
	onClose,
}: {
	failure: AddFailure | null;
	/** Spinner in Retry while the second attempt runs */
	retrying?: boolean;
	onRetry: () => void;
	onClose: () => void;
}) {
	return (
		<ConfirmModal
			visible={!!failure}
			title="Well that add was a failure"
			image={
				// Yamcha's hair reaches up to the art's top edge: a gap so he isn't touching the title
				<View style={{ paddingTop: spacing.md }}>
					<ModalArt source={DEFEATED_ART} ratio={DEFEATED_RATIO} />
				</View>
			}
			hint={failure ? `${failure.title} is still not on your watch list.` : undefined}
			error={failure?.message ?? null}
			confirmLabel="Retry"
			loading={retrying}
			onConfirm={onRetry}
			onClose={onClose}
		/>
	);
}
