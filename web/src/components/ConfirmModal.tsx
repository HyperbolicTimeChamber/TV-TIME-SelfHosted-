import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Spin } from "antd";
import AnimatedModal from "./AnimatedModal";
import BottomSheet from "./BottomSheet";
import { ModalBackdrop } from "./ModalArt";
import SlideToConfirm from "./SlideToConfirm";
import styles from "./styles/ui.module.scss";
import { cssVars } from "../utils/cssVars";

interface Props {
	visible: boolean;
	title: string;
	/** Art between the title and the hint (see ModalArt: logo, poster, character art) */
	image?: ReactNode;
	hint?: string;
	error?: string | null;
	confirmLabel: string;
	confirmColor?: string;
	/** Spinner in the confirm button; the other buttons are locked while it runs */
	loading?: boolean;
	onConfirm: () => void;
	/** Optional choice ABOVE the confirm button (e.g. "Export My Data First" over a destructive Delete) */
	leadLabel?: string;
	leadColor?: string;
	onLead?: () => void;
	/** Optional second choice under the confirm button (e.g. "Just This One") */
	secondaryLabel?: string;
	secondaryColor?: string;
	onSecondary?: () => void;
	/** Optional third choice under the secondary one (e.g. "Just Mark It") */
	tertiaryLabel?: string;
	onTertiary?: () => void;
	cancelLabel?: string;
	/** Image flush with the top of the popup (full-bleed art); a shown title is laid over it in black.
	 *  Automatic for a ModalBackdrop, which hosts the title itself over a top shade */
	imageAtTop?: boolean;
	/** No title (the image / hint say it all) */
	hideTitle?: boolean;
	/** No Cancel button (tapping outside still closes) */
	hideCancel?: boolean;
	/** A bottom drawer instead of a centred popup (the banner confirms: backdrop art on top) */
	drawer?: boolean;
	/** Drawer only: the question under the art ("Do you want to pause this show?") */
	question?: string;
	/** Drawer only: one slide-to-confirm bar replaces every button, Cancel included (pull the drawer down / tap outside to cancel) */
	slideLabel?: string;
	onClose: () => void;
}

/** Every confirm / choice popup (app ConfirmModal): title, image, hint, one or two actions, outlined Cancel */
export default function ConfirmModal({
	visible,
	title,
	image,
	hint,
	error,
	confirmLabel,
	confirmColor,
	loading,
	onConfirm,
	leadLabel,
	leadColor,
	onLead,
	secondaryLabel,
	secondaryColor,
	onSecondary,
	tertiaryLabel,
	onTertiary,
	cancelLabel = "Cancel",
	imageAtTop = false,
	hideTitle = false,
	hideCancel = false,
	drawer = false,
	question,
	slideLabel,
	onClose,
}: Props) {
	// Photo art: up to the popup's top edge, the title on its own top shade
	const photo = isValidElement(image) && image.type === ModalBackdrop;
	const atTop = (imageAtTop || photo) && image != null;
	const buttons = (
		<>
			{leadLabel && onLead && (
				<button
					className={`${styles.button} ${styles.danger} bg-(--lead)!`}
					style={cssVars({ "--lead": leadColor ?? "var(--accent, #4a90d9)" })}
					onClick={onLead}
					disabled={loading}
				>
					{leadLabel}
				</button>
			)}
			<button
				className={`${styles.button} ${styles.danger} ${confirmColor ? "bg-(--confirm)!" : ""}`}
				style={confirmColor ? cssVars({ "--confirm": confirmColor }) : undefined}
				onClick={onConfirm}
				disabled={loading}
			>
				{loading ? <Spin size="small" /> : confirmLabel}
			</button>
			{secondaryLabel && onSecondary && (
				<button
					className={`${styles.button} ${styles.muted} ${secondaryColor ? "bg-(--secondary)!" : ""}`}
					style={secondaryColor ? cssVars({ "--secondary": secondaryColor }) : undefined}
					onClick={onSecondary}
					disabled={loading}
				>
					{secondaryLabel}
				</button>
			)}
			{tertiaryLabel && onTertiary && (
				<button
					className={`${styles.button} ${styles.muted}`}
					onClick={onTertiary}
					disabled={loading}
				>
					{tertiaryLabel}
				</button>
			)}
		</>
	);
	if (drawer) {
		// App ConfirmDrawer: the banner full bleed at the top, the question under the art (the title when
		// there is none), hint, then the buttons — or one slide-to-confirm bar. Pressing a button never
		// starts the sheet's drag (Add to List's first-tap fix); Cancel stays (dimmed) while the action
		// runs so the drawer keeps its height
		const line = question ?? (hideTitle ? undefined : title);
		return (
			<BottomSheet visible={visible} label={title} onClose={onClose} locked={!!loading}>
				{photo ? (
					<div className={styles.drawerBanner}>{image}</div>
				) : (
					image != null && <div className={styles.modalImage}>{image}</div>
				)}
				{line && <p className={styles.drawerQuestion}>{line}</p>}
				{hint && <p className={styles.modalHint}>{hint}</p>}
				{error && <p className={styles.modalError}>{error}</p>}
				<div className={styles.drawerButtons} onPointerDownCapture={(e) => e.stopPropagation()}>
					{slideLabel ? (
						<SlideToConfirm
							label={slideLabel}
							color={confirmColor ?? "#e74c3c"}
							onConfirm={onConfirm}
							loading={!!loading}
						/>
					) : (
						<>
							{buttons}
							{!hideCancel && (
								<button
									className={`${styles.button} ${styles.drawerCancel}`}
									onClick={onClose}
									disabled={!!loading}
								>
									{cancelLabel}
								</button>
							)}
						</>
					)}
				</div>
			</BottomSheet>
		);
	}
	return (
		<AnimatedModal visible={visible} onClose={() => !loading && onClose()}>
			{atTop ? (
				<div className={`${styles.modalImage} ${styles.modalImageTop}`}>
					{photo && !hideTitle
						? cloneElement(image as ReactElement<{ heading?: string }>, { heading: title })
						: image}
					{!photo && !hideTitle && (
						<p className={`${styles.modalTitle} ${styles.modalTitleOnImage}`}>{title}</p>
					)}
				</div>
			) : (
				<>
					{!hideTitle && <p className={styles.modalTitle}>{title}</p>}
					{image != null && <div className={styles.modalImage}>{image}</div>}
				</>
			)}
			{hint && <p className={styles.modalHint}>{hint}</p>}
			{error && <p className={styles.modalError}>{error}</p>}
			{buttons}
			{!loading && !hideCancel && (
				<button className={`${styles.button} ${styles.cancelOutline}`} onClick={onClose}>
					{cancelLabel}
				</button>
			)}
		</AnimatedModal>
	);
}
