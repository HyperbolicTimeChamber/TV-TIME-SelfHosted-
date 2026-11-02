import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { ACCENT_OPTIONS, COMING_SOON, THEME_OPTIONS, ThemeMode } from "@app/utils/settingsOptions";
import { CircleBackButton, CircleButtonSpacer } from "../../components/CircleButton";
import styles from "./styles/SettingsPlaceholder.module.scss";

/** Swipe right farther than this to go back (as on the app) */
const SWIPE_BACK_PX = 60;

/** Appearance placeholder (app AppearanceScreen): the planned theme + accent choices, none applies yet */
export default function AppearanceScreen() {
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
				<h1 className={styles.headerTitle}>Appearance</h1>
				<CircleButtonSpacer />
			</div>
			<p className={styles.soon}>{COMING_SOON}: these options are not active yet.</p>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Theme</h2>
				{THEME_OPTIONS.map((option) => (
					<div key={option.mode} className={styles.row}>
						<span className={styles.rowText}>{option.label}</span>
						<span
							className={`${styles.radio} ${option.mode === ThemeMode.DARK ? styles.radioOn : ""}`}
						/>
					</div>
				))}
			</section>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Accent color</h2>
				<div className={styles.swatches}>
					{ACCENT_OPTIONS.map((option, index) => (
						<div key={option.label} className={styles.swatchWrap}>
							<span
								className={`${styles.swatch} ${index === 0 ? styles.swatchOn : ""}`}
								style={{ background: option.color }}
							/>
							{option.label}
						</div>
					))}
				</div>
			</section>
		</motion.div>
	);
}
