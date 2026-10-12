import { useState } from "react";
import { Checkbox } from "antd";
import { hideUnreleasedModal } from "@app/services/unreleasedModalPref";
import { useAppSelector } from "../store";
import AnimatedModal from "./AnimatedModal";
import styles from "../styles/components/ui.module.scss";

interface Props {
	visible: boolean;
	onClose: () => void;
	movieTitle: string;
}

export default function UnreleasedMovieModal({ visible, onClose, movieTitle }: Props) {
	const [dontShowAgain, setDontShowAgain] = useState(false);
	const uid = useAppSelector((s) => s.auth.user?.uid);

	const handleOk = async () => {
		if (dontShowAgain && uid) await hideUnreleasedModal(uid);
		onClose();
	};

	return (
		<AnimatedModal visible={visible} onClose={onClose}>
			<p className={styles.modalTitle}>Added to Watchlist</p>
			<p className={styles.modalHint}>
				{movieTitle} hasn't released yet. It will appear on your watchlist when it airs.
			</p>
			<Checkbox
				checked={dontShowAgain}
				onChange={(e) => setDontShowAgain(e.target.checked)}
				style={{ marginBottom: 16 }}
			>
				Don't show this again
			</Checkbox>
			<button className={styles.button} onClick={handleOk}>
				OK
			</button>
		</AnimatedModal>
	);
}
