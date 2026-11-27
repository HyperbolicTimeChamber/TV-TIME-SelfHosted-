import { Route } from "@app/enums";
import { useAppPrefsStore } from "@app/stores/appPrefsStore";
import type { HomeStartTab } from "@app/utils/appPrefs";
import SettingsPage from "./SettingsPage";
import styles from "./styles/SettingsPlaceholder.module.scss";

const TAB_OPTIONS: { value: HomeStartTab; label: string }[] = [
	{ value: Route.WATCHLIST, label: "Watch List" },
	{ value: Route.UPCOMING, label: "Upcoming" },
];

/** Settings -> Home (app HomePrefsScreen): which of Home's tabs a visit opens on (this browser) */
export default function HomePrefsScreen() {
	const homeTab = useAppPrefsStore((s) => s.prefs.homeTab);
	const update = useAppPrefsStore((s) => s.update);
	return (
		<SettingsPage title="Home">
			<section className={styles.section} role="radiogroup" aria-label="Open Home on">
				<h2 className={styles.sectionTitle}>Open Home on</h2>
				{TAB_OPTIONS.map((option) => {
					const on = option.value === homeTab;
					return (
						<button
							key={option.value}
							type="button"
							role="radio"
							aria-checked={on}
							className={styles.row}
							onClick={() => update({ homeTab: option.value })}
						>
							<span className={styles.rowText}>{option.label}</span>
							<span className={`${styles.radio} ${on ? styles.radioOn : ""}`} />
						</button>
					);
				})}
			</section>
			<p className={styles.soon}>
				Shown when you open the app, and again when you come back to it. Saved in this browser.
			</p>
		</SettingsPage>
	);
}
