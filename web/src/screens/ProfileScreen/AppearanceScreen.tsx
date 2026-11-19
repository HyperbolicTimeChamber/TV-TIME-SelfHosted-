import { useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { ACCENT_OPTIONS, THEME_OPTIONS, type ThemePrefs } from "@app/theme";
import { CircleBackButton, CircleButtonSpacer } from "../../components/CircleButton";
import { setThemePrefs, useThemePrefs } from "../../theme/applyTheme";
import styles from "./styles/SettingsPlaceholder.module.scss";

/** Swipe right farther than this to go back (as on the app) */
const SWIPE_BACK_PX = 60;

/** Appearance (app AppearanceScreen): theme + accent color, applied at once (CSS variables) */
export default function AppearanceScreen() {
	const navigate = useNavigate();
	const prefs = useThemePrefs();
	// The option being applied (as the app): the routes remount on the change; its spinner shows the
	// tap landed and other taps wait until it has
	const [pending, setPending] = useState<string | null>(null);
	const apply = (key: string, next: ThemePrefs) => {
		if (pending) return;
		if (next.mode === prefs.mode && next.accent === prefs.accent) return;
		setPending(key);
		// Two frames: the spinner is painted before the remount starts
		requestAnimationFrame(() => requestAnimationFrame(() => setThemePrefs(next)));
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
				<h1 className={styles.headerTitle}>Appearance</h1>
				<CircleButtonSpacer />
			</div>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Theme</h2>
				{THEME_OPTIONS.map((option) => (
					<button
						key={option.mode}
						className={styles.row}
						disabled={!!pending}
						aria-busy={pending === option.mode}
						onClick={() => apply(option.mode, { ...prefs, mode: option.mode })}
					>
						<span className={styles.rowText}>{option.label}</span>
						{pending === option.mode ? (
							<span className={styles.spinner} aria-hidden />
						) : (
							<span
								className={`${styles.radio} ${option.mode === prefs.mode ? styles.radioOn : ""}`}
							/>
						)}
					</button>
				))}
			</section>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Accent color</h2>
				<div className={styles.swatches}>
					{ACCENT_OPTIONS.map((option) => (
						<button
							key={option.id}
							className={styles.swatchWrap}
							disabled={!!pending}
							aria-busy={pending === option.id}
							onClick={() => apply(option.id, { ...prefs, accent: option.id })}
						>
							<span
								className={`${styles.swatch} ${option.id === prefs.accent ? styles.swatchOn : ""}`}
								style={{
									background:
										option.accent === option.primary
											? option.primary
											: `linear-gradient(${option.primary} 50%, ${option.accent} 50%)`,
								}}
							>
								{pending === option.id && (
									<span className={styles.swatchBusy}>
										<span className={styles.spinner} aria-hidden />
									</span>
								)}
							</span>
							{option.label}
						</button>
					))}
				</div>
			</section>
		</motion.div>
	);
}
