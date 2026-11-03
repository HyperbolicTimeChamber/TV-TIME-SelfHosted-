import { useEffect, useRef, useState, type ReactNode } from "react";
import { Spin } from "antd";
import { IoCloseCircle } from "react-icons/io5";
import { CUSTOM_LIST_NAME_MAX } from "@app/enums";
import AnimatedModal from "./AnimatedModal";
import styles from "./styles/ui.module.scss";
import nameStyles from "./styles/ListNameModal.module.scss";

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

/** Past this many characters the field shows how many are left */
const COUNTER_FROM = Math.floor(CUSTOM_LIST_NAME_MAX * 0.8);

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

	const showCounter = name.length >= COUNTER_FROM;
	const showUnder = !!error || showCounter;
	const blank = name.trim().length === 0;
	// Rename with the name untouched: nothing to save
	const unchanged = initialName.length > 0 && name.trim() === initialName.trim();
	const disabled = blank || unchanged || loading;
	const submit = () => {
		if (!disabled) onSubmit(name);
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
				<div
					className={`${nameStyles.field} ${showUnder ? nameStyles.fieldTight : ""} ${error ? nameStyles.fieldError : ""}`}
				>
					<input
						ref={inputRef}
						className={nameStyles.input}
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="List name"
						maxLength={CUSTOM_LIST_NAME_MAX}
						aria-label="List name"
					/>
					{name.length > 0 && !loading && (
						<button
							type="button"
							className={nameStyles.clear}
							aria-label="Clear name"
							onClick={() => {
								setName("");
								inputRef.current?.focus();
							}}
						>
							<IoCloseCircle size={20} />
						</button>
					)}
				</div>
				{/* Error and the character count share a line under the field — only when there is one */}
				{showUnder && (
					<div className={nameStyles.under}>
						{error ? (
							<p className={nameStyles.error}>{error}</p>
						) : (
							<span className={nameStyles.spacer} />
						)}
						{showCounter && (
							<span className={nameStyles.counter}>
								{name.length}/{CUSTOM_LIST_NAME_MAX}
							</span>
						)}
					</div>
				)}
				<div className={nameStyles.buttons}>
					{!loading && (
						<button
							type="button"
							className={`${styles.button} ${styles.cancelOutline}`}
							onClick={onClose}
						>
							Cancel
						</button>
					)}
					<button
						type="submit"
						className={styles.button}
						disabled={disabled}
						style={disabled && !loading ? { opacity: 0.5 } : undefined}
					>
						{loading ? <Spin size="small" /> : confirmLabel}
					</button>
				</div>
			</form>
		</AnimatedModal>
	);
}
