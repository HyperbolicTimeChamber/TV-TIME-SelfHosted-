import ConfirmModal from "../ConfirmModal";
import { colors } from "../../../theme";

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
			title="Mark Previous Episodes?"
			hint={`Mark episodes ${confirmLabel} as watched?`}
			confirmLabel="Mark All"
			confirmColor={colors.watchedGreen}
			loading={loading}
			onConfirm={onConfirm}
			secondaryLabel="Just This One"
			onSecondary={onDecline}
			onClose={onCancel}
		/>
	);
}
