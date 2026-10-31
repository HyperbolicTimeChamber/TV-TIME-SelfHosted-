import { useEffect, useState } from "react";
import { Spin } from "antd";
import { CUSTOM_LIST_NAME_MAX } from "@app/enums";
import AnimatedModal from "./AnimatedModal";
import styles from "./styles/ui.module.scss";

interface Props {
	visible: boolean;
	/** "New List" / "Rename List" */
	title: string;
	/** Text the field starts with (rename) */
	initialName?: string;
	confirmLabel?: string;
	/** Why the last try was refused (name taken, write failed…) */
	error?: string | null;
	loading?: boolean;
	onSubmit: (name: string) => void;
	onClose: () => void;
}

/** One text field + confirm / cancel, in the popup look (app ListNameModal) */
export default function ListNameModal({
	visible,
	title,
	initialName = "",
	confirmLabel = "Save",
	error,
	loading = false,
	onSubmit,
	onClose,
}: Props) {
	const [name, setName] = useState(initialName);
	useEffect(() => {
		if (visible) setName(initialName);
	}, [visible, initialName]);

	const blank = name.trim().length === 0;
	const submit = () => {
		if (!blank && !loading) onSubmit(name);
	};

	return (
		<AnimatedModal visible={visible} onClose={() => !loading && onClose()}>
			<p className={styles.modalTitle}>{title}</p>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<input
					className={styles.textInput}
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="List name"
					maxLength={CUSTOM_LIST_NAME_MAX}
					aria-label="List name"
					// eslint-disable-next-line jsx-a11y/no-autofocus
					autoFocus
				/>
				{error && <p className={styles.modalError}>{error}</p>}
				<button
					type="submit"
					className={styles.button}
					disabled={blank || loading}
					style={blank && !loading ? { opacity: 0.5 } : undefined}
				>
					{loading ? <Spin size="small" /> : confirmLabel}
				</button>
			</form>
			{!loading && (
				<button className={`${styles.button} ${styles.cancelOutline}`} onClick={onClose}>
					Cancel
				</button>
			)}
		</AnimatedModal>
	);
}
