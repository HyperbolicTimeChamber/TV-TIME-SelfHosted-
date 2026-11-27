import { Slider, Switch } from "antd";
import { CALENDAR_LOAD_MAX, CALENDAR_LOAD_STEP } from "@app/enums";
import { useAppPrefsStore } from "@app/stores/appPrefsStore";
import { loadDaysLabel } from "@app/utils/appPrefs";
import SettingsPage from "./SettingsPage";
import styles from "./styles/SettingsPlaceholder.module.scss";

/** Settings -> Calendar (app CalendarPrefsScreen): the page on or off, and how much it loads */
export default function CalendarPrefsScreen() {
	const enabled = useAppPrefsStore((s) => s.prefs.calendarEnabled);
	const days = useAppPrefsStore((s) => s.prefs.calendarLoadDays);
	const update = useAppPrefsStore((s) => s.update);
	return (
		<SettingsPage title="Calendar">
			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Page</h2>
				<div className={styles.row}>
					<span className={styles.rowText}>
						Show Calendar
						<span className={styles.rowHint}>
							Off removes the page and its tab-bar icon, and nothing is loaded for it.
						</span>
					</span>
					<Switch
						checked={enabled}
						onChange={(calendarEnabled) => update({ calendarEnabled })}
						aria-label="Show Calendar"
					/>
				</div>
			</section>

			{enabled && (
				<section className={styles.section}>
					<h2 className={styles.sectionTitle}>Data</h2>
					<div className={styles.slider}>
						<div className={styles.sliderHead}>
							<span className={styles.rowText}>Load ahead</span>
							<span className={styles.sliderValue}>{loadDaysLabel(days)}</span>
						</div>
						<span className={styles.rowHint}>
							{days === 0
								? "Loads the current month. Other months load when you ask for them."
								: `Loads today and the next ${days} days. Other dates load when you ask for them.`}
						</span>
						<Slider
							min={0}
							max={CALENDAR_LOAD_MAX}
							step={CALENDAR_LOAD_STEP}
							value={days}
							onChange={(calendarLoadDays) => update({ calendarLoadDays })}
							tooltip={{ formatter: (value) => loadDaysLabel(value ?? 0) }}
							ariaLabelForHandle="Days of the Calendar to load"
						/>
					</div>
				</section>
			)}
		</SettingsPage>
	);
}
