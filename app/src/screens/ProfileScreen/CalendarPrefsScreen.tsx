import React from "react";
import { CALENDAR_LOAD_MAX, CALENDAR_LOAD_STEP } from "../../enums";
import { useAppPrefsStore } from "../../stores/appPrefsStore";
import { loadDaysLabel } from "../../utils/appPrefs";
import SettingsPage from "./SettingsPage";
import { Detail, Section, StepSlider, SwitchRow } from "./NotificationControls";

/** Settings -> Calendar: whether the Calendar page exists, and how much it loads (this device) */
export default function CalendarPrefsScreen() {
	const enabled = useAppPrefsStore((s) => s.prefs.calendarEnabled);
	const days = useAppPrefsStore((s) => s.prefs.calendarLoadDays);
	const update = useAppPrefsStore((s) => s.update);
	return (
		<SettingsPage title="Calendar">
			<Section title="Page">
				<SwitchRow
					first
					label="Show Calendar"
					hint="Off removes the page and its tab-bar icon, and nothing is loaded for it."
					value={enabled}
					onChange={(calendarEnabled) => update({ calendarEnabled })}
				/>
			</Section>
			{enabled && (
				<Section title="Data">
					<Detail
						flush
						label="Load ahead"
						hint={
							days === 0
								? "Loads the current month. Other months load when you ask for them."
								: `Loads today and the next ${days} days. Other dates load when you ask for them.`
						}
					>
						<StepSlider
							label="Days of the Calendar to load"
							index={days / CALENDAR_LOAD_STEP}
							steps={CALENDAR_LOAD_MAX / CALENDAR_LOAD_STEP}
							onChange={(index) => update({ calendarLoadDays: index * CALENDAR_LOAD_STEP })}
							text={loadDaysLabel(days)}
						/>
					</Detail>
				</Section>
			)}
		</SettingsPage>
	);
}
