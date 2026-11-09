import type { AddFailure } from "@app/types";
import ConfirmModal from "./ConfirmModal";
import { DEFEATED_ART, ModalArt } from "./ModalArt";
import styles from "./styles/ui.module.scss";

/** "Couldn't add" popup (app AddFailedModal) — Yamcha down, the title still off the list */
export default function AddFailedModal({
	failure,
	retrying = false,
	onRetry,
	onClose,
}: Readonly<{
	failure: AddFailure | null;
	/** Spinner in Retry while the second attempt runs */
	retrying?: boolean;
	onRetry: () => void;
	onClose: () => void;
}>) {
	return (
		<ConfirmModal
			visible={!!failure}
			title="Well that add was a failure"
			// Yamcha's hair reaches up to the art's top edge: a gap so he isn't touching the title
			image={
				<div className={styles.defeatedArt}>
					<ModalArt src={DEFEATED_ART} />
				</div>
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
