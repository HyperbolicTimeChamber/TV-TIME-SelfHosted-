/** Placeholder option list for the Notifications settings page (web reuses it) */

export enum NotificationKind {
	MOVIE_REMINDER = "movieReminder",
	TODAY_CALENDAR = "todayCalendar",
	NEW_EPISODE = "newEpisode",
	WEEKLY_DIGEST = "weeklyDigest",
}

export const NOTIFICATION_OPTIONS: { kind: NotificationKind; label: string; hint: string }[] = [
	{
		kind: NotificationKind.MOVIE_REMINDER,
		label: "Upcoming movie reminders",
		hint: "A heads-up before a movie on your list is released",
	},
	{
		kind: NotificationKind.TODAY_CALENDAR,
		label: "Today on your calendar",
		hint: "Shows and movies airing today",
	},
	{
		kind: NotificationKind.NEW_EPISODE,
		label: "New episodes",
		hint: "When a show you track has a new episode out",
	},
	{
		kind: NotificationKind.WEEKLY_DIGEST,
		label: "Weekly digest",
		hint: "What is coming up in the week ahead",
	},
];

export const COMING_SOON = "Coming soon";
