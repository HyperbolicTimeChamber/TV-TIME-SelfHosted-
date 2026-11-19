import { motion } from "motion/react";
import { Switch } from "antd";
import { IoAdd, IoRemove } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { PROFILE_LIST_COUNT_MAX, PROFILE_LIST_COUNT_MIN } from "@app/enums";
import { requireOnline } from "@app/utils/requireOnline";
import type { ProfilePrefs } from "@app/utils/profilePrefs";
import { CircleBackButton, CircleButtonSpacer } from "../../components/CircleButton";
import { useAppDispatch, useAppSelector } from "../../store";
import { saveProfilePrefs } from "../../store/authSlice";
import styles from "./styles/SettingsPlaceholder.module.scss";

/** Swipe right farther than this to go back (as on the app) */
const SWIPE_BACK_PX = 60;

/** Settings -> Profile (app ProfilePrefsScreen): lists on the profile (0-10) and the completed rows */
export default function ProfilePrefsScreen() {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const user = useAppSelector((s) => s.auth.user);
	const prefs = useAppSelector((s) => s.auth.profilePrefs);
	const atMin = prefs.listCount <= PROFILE_LIST_COUNT_MIN;
	const atMax = prefs.listCount >= PROFILE_LIST_COUNT_MAX;

	// Offline: the popup from requireOnline, nothing changes
	const change = (patch: Partial<ProfilePrefs>) => {
		if (!user || !requireOnline()) return;
		void dispatch(saveProfilePrefs({ uid: user.uid, patch }));
	};

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
				<h1 className={styles.headerTitle}>Profile</h1>
				<CircleButtonSpacer />
			</div>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Lists</h2>
				<div className={styles.row}>
					<span className={styles.rowText}>
						Lists on Profile
						<span className={styles.rowHint}>
							The first lists in your Lists page order. Empty lists are never shown.
						</span>
					</span>
					<div className={styles.stepper}>
						<button
							className={styles.stepButton}
							disabled={atMin}
							onClick={() => change({ listCount: prefs.listCount - 1 })}
							aria-label="Show one fewer list"
						>
							<IoRemove size={20} />
						</button>
						<span className={styles.stepValue} aria-label={`${prefs.listCount} lists on profile`}>
							{prefs.listCount}
						</span>
						<button
							className={styles.stepButton}
							disabled={atMax}
							onClick={() => change({ listCount: prefs.listCount + 1 })}
							aria-label="Show one more list"
						>
							<IoAdd size={20} />
						</button>
					</div>
				</div>
			</section>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Rows</h2>
				<div className={styles.row}>
					<span className={styles.rowText}>
						Show Completed Rows
						<span className={styles.rowHint}>Movies Watched and TV Shows Completed.</span>
					</span>
					<Switch
						checked={prefs.showCompleted}
						onChange={(checked) => change({ showCompleted: checked })}
						aria-label="Show completed rows"
					/>
				</div>
			</section>
		</motion.div>
	);
}
