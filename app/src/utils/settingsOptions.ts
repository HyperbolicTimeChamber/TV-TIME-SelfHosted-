/** Placeholder option lists for the Appearance / Notifications settings pages (web reuses them) */

export enum ThemeMode {
	DARK = "dark",
	LIGHT = "light",
	SYSTEM = "system",
}

export const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
	{ mode: ThemeMode.DARK, label: "Dark" },
	{ mode: ThemeMode.LIGHT, label: "Light" },
	{ mode: ThemeMode.SYSTEM, label: "System" },
];

/** The first one is today's accent */
export const ACCENT_OPTIONS: { label: string; color: string }[] = [
	{ label: "Blue", color: "#4A90D9" },
	{ label: "Red", color: "#E50914" },
	{ label: "Green", color: "#00A800" },
	{ label: "Purple", color: "#8B5CF6" },
	{ label: "Orange", color: "#F59E0B" },
	{ label: "Pink", color: "#EC4899" },
];

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
