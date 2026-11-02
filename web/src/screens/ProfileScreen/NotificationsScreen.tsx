import { motion } from "motion/react";
import { Switch } from "antd";
import { useNavigate } from "react-router-dom";
import { COMING_SOON, NOTIFICATION_OPTIONS } from "@app/utils/settingsOptions";
import { CircleBackButton, CircleButtonSpacer } from "../../components/CircleButton";
import styles from "./styles/SettingsPlaceholder.module.scss";

/** Swipe right farther than this to go back (as on the app) */
const SWIPE_BACK_PX = 60;

/** Notifications placeholder (app NotificationsScreen): the planned reminder types as disabled switches */
export default function NotificationsScreen() {
	const navigate = useNavigate();

	return (
		<motion.div
			drag="x"
			dragDirectionLock
			dragConstraints={{ left: 0, right: 0 }}
			dragElastic={0.2}
			className={`${styles.container} touch-pan-y`}
			onDragEnd={(_, info) => {
				if (info.offset.x > SWIPE_BACK_PX) navigate(-1);
			}}
		>
			<div className={styles.headerRow}>
				<CircleBackButton onClick={() => navigate(-1)} />
				<h1 className={styles.headerTitle}>Notifications</h1>
				<CircleButtonSpacer />
			</div>
			<p className={styles.soon}>{COMING_SOON}: these options are not active yet.</p>

			<section className={`${styles.section} ${styles.dim}`}>
				<h2 className={styles.sectionTitle}>Reminders</h2>
				{NOTIFICATION_OPTIONS.map((option) => (
					<div key={option.kind} className={styles.row}>
						<span className={styles.rowText}>
							{option.label}
							<span className={styles.rowHint}>{option.hint}</span>
						</span>
						<Switch checked={false} disabled aria-label={option.label} />
					</div>
				))}
			</section>
		</motion.div>
	);
}
