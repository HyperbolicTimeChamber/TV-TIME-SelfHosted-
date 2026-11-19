/** Switches of the Notifications settings page (web shows a notice instead; it reuses the enum) */

/** Keys of the per-device alert switches (saved under CacheKey.NOTIFY_PREFS) */
export enum NotificationKind {
	PREMIERES = "premieres",
	NEW_EPISODES = "newEpisodes",
	MOVIE_REMINDERS = "movieReminders",
	WEEKLY_DIGEST = "weeklyDigest",
	QUIET_HOURS = "quietHours",
}

export const NOTIFICATION_OPTIONS: { kind: NotificationKind; label: string; hint: string }[] = [
	{
		kind: NotificationKind.PREMIERES,
		label: "New seasons & movie releases",
		hint: "When a new season of a show you track starts, or a movie on your list comes out",
	},
	{
		kind: NotificationKind.NEW_EPISODES,
		label: "New episodes",
		hint: "When an episode of a show you track airs",
	},
	{
		kind: NotificationKind.MOVIE_REMINDERS,
		label: "Upcoming movie reminders (7 days before)",
		hint: "A heads-up a week before a movie on your list is released",
	},
	{
		kind: NotificationKind.WEEKLY_DIGEST,
		label: "Weekly digest (Sunday)",
		hint: "What is coming up from Monday to Saturday",
	},
	{
		kind: NotificationKind.QUIET_HOURS,
		label: "Quiet hours (10 pm – 8 am → 9 am)",
		hint: "Episodes that air overnight wait until 9 am and arrive together",
	},
];

export const NOTIFICATIONS_FOOTER = "Alerts arrive when episodes land. Settings apply to this device.";
export const WEB_NOTIFICATIONS_NOTICE = "Notifications are available in the Android app";

/** Kept: the old placeholder export (nothing imports it after A08 / W01, delete then — see A08) */
export const COMING_SOON = "Coming soon";
