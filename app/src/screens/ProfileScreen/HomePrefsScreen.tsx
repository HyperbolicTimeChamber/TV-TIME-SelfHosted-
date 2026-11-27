import React from "react";
import { Route } from "../../enums";
import { useAppPrefsStore } from "../../stores/appPrefsStore";
import type { HomeStartTab } from "../../utils/appPrefs";
import SettingsPage from "./SettingsPage";
import { Chips, Detail, Section } from "./NotificationControls";

const TAB_OPTIONS: { value: HomeStartTab; label: string }[] = [
	{ value: Route.WATCHLIST, label: "Watch List" },
	{ value: Route.UPCOMING, label: "Upcoming" },
];

/** Settings -> Home: which of Home's tabs the app opens on (this device) */
export default function HomePrefsScreen() {
	const homeTab = useAppPrefsStore((s) => s.prefs.homeTab);
	const update = useAppPrefsStore((s) => s.update);
	return (
		<SettingsPage title="Home">
			<Section title="Start tab">
				<Detail
					flush
					label="Open Home on"
					hint="Shown when you open the app, and again when you come back to it. Saved on this device."
				>
					<Chips options={TAB_OPTIONS} value={homeTab} onChange={(value) => update({ homeTab: value })} />
				</Detail>
			</Section>
		</SettingsPage>
	);
}
