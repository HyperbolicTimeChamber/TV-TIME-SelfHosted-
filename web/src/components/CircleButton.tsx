import type { ReactNode } from "react";
import { IoChevronBack } from "react-icons/io5";
import { CircleButtonTone } from "@app/enums";
import styles from "./styles/CircleButton.module.scss";

const FILL: Record<CircleButtonTone, string> = {
	[CircleButtonTone.OVERLAY]: styles.overlay,
	[CircleButtonTone.SURFACE]: styles.surface,
	[CircleButtonTone.SURFACE_LIGHT]: styles.surfaceLight,
};

interface Props {
	onClick: () => void;
	tone?: CircleButtonTone;
	/** Positioning from the caller (e.g. fixed over a backdrop) */
	className?: string;
	ariaLabel: string;
	children: ReactNode;
}

/** 44px circular icon button (app CircleButton) — the one shape for back / share buttons */
export default function CircleButton({ onClick, tone = CircleButtonTone.SURFACE, className = "", ariaLabel, children }: Props) {
	return (
		<button type="button" className={`${styles.circle} ${FILL[tone]} ${className}`} onClick={onClick} aria-label={ariaLabel}>
			{children}
		</button>
	);
}

/** Circular back button — react-icons' chevron is already centred, no nudge */
export function CircleBackButton(props: Omit<Props, "children" | "ariaLabel">) {
	return (
		<CircleButton {...props} ariaLabel="Back">
			<IoChevronBack size={26} />
		</CircleButton>
	);
}

/** Invisible 44px block — balances a header so its title stays centred */
export function CircleButtonSpacer() {
	return <span className={styles.spacer} aria-hidden />;
}
