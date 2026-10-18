import ConfirmModal from "../ConfirmModal";
import { ModalArt, SPEEDSTER_ART, SPEEDSTER_RATIO } from "../ModalArt";
import { colors } from "../../../theme";
import { SKIP_AHEAD_TITLE, skipAheadConfirm, skipAheadHint } from "../../../utils/format";

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
		<ConfirmModal
			visible={visible}
			title={SKIP_AHEAD_TITLE}
			image={<ModalArt source={SPEEDSTER_ART} ratio={SPEEDSTER_RATIO} />}
			hint={skipAheadHint(confirmLabel)}
			confirmLabel={skipAheadConfirm(confirmLabel)}
			confirmColor={colors.watchedGreen}
			loading={loading}
			onConfirm={onConfirm}
			secondaryLabel="Just This One"
			onSecondary={onDecline}
			onClose={onCancel}
		/>
	);
}
