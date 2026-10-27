import { motion } from "motion/react";
import styles from "./styles/SlidingTabs.module.scss";

interface Props<K extends string> {
	tabs: Array<{ key: K; label: string }>;
	activeKey: K;
	onTabPress: (key: K) => void;
	/** Distinguishes multiple tab groups on one page (Motion layoutId) */
	id?: string;
	/** Container overrides (e.g. transparent background on a black top bar) */
	className?: string;
}

/** Segmented pill tabs with a sliding highlight (app SlidingTabs) */
export default function SlidingTabs<K extends string>({
	tabs,
	activeKey,
	onTabPress,
	id = "tabs",
	className = "",
}: Props<K>) {
	return (
		<div className={`${styles.container} ${className}`} role="tablist">
			{tabs.map((tab) => {
				const active = tab.key === activeKey;
				return (
					<button
						key={tab.key}
						role="tab"
						aria-selected={active}
						className={styles.tab}
						onClick={() => onTabPress(tab.key)}
					>
						{active && (
							<motion.span
								layoutId={`${id}-pill`}
								className={styles.pill}
								transition={{ type: "spring", stiffness: 400, damping: 32 }}
							/>
						)}
						<span className={active ? styles.labelActive : styles.label}>{tab.label}</span>
					</button>
				);
			})}
		</div>
	);
}
