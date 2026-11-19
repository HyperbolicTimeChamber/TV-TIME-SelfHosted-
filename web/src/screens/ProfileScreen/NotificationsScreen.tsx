import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { WEB_NOTIFICATIONS_NOTICE } from "@app/utils/settingsOptions";
import { CircleBackButton, CircleButtonSpacer } from "../../components/CircleButton";
import styles from "./styles/SettingsPlaceholder.module.scss";

/** Swipe right farther than this to go back (as on the app) */
const SWIPE_BACK_PX = 60;

/** Notifications: alerts are scheduled on the Android device, so the web only says so */
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
			<p className={styles.soon}>{WEB_NOTIFICATIONS_NOTICE}</p>
		</motion.div>
	);
}
