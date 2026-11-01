import { useEffect, useRef, useState, type ReactNode } from "react";
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
	/** Art between the title and the hint (ModalArt), as in ConfirmModal */
	image?: ReactNode;
	/** Line under the art; a list → one of them, picked each time the popup opens */
	hint?: string | readonly string[];
}

const pickHint = (hint: Props["hint"]) =>
	typeof hint === "string" || hint === undefined
		? hint
		: hint[Math.floor(Math.random() * hint.length)];

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
	image,
	hint,
}: Props) {
	const [name, setName] = useState(initialName);
	const [shownHint, setShownHint] = useState(() => pickHint(hint));
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (visible) setName(initialName);
	}, [visible, initialName]);
	// A fresh line per opening, not per render (it'd change as the user types)
	useEffect(() => {
		if (visible) setShownHint(pickHint(hint));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible]);

	// Cursor in the field as soon as the popup is up (rename: old name selected, so typing replaces it);
	// after a beat, the popup's own enter animation is still mounting the input
	useEffect(() => {
		if (!visible) return;
		const t = window.setTimeout(() => {
			inputRef.current?.focus();
			if (initialName) inputRef.current?.select();
		}, 60);
		return () => window.clearTimeout(t);
	}, [visible, initialName]);

	const blank = name.trim().length === 0;
	const submit = () => {
		if (!blank && !loading) onSubmit(name);
	};

	return (
		<AnimatedModal visible={visible} onClose={() => !loading && onClose()}>
			<p className={styles.modalTitle}>{title}</p>
			{image != null && <div className={styles.modalImage}>{image}</div>}
			{shownHint && <p className={styles.modalHint}>{shownHint}</p>}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<input
					ref={inputRef}
					className={styles.textInput}
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="List name"
					maxLength={CUSTOM_LIST_NAME_MAX}
					aria-label="List name"
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
