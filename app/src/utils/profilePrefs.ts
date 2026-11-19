import {
	CacheKey,
	PROFILE_LIST_COUNT,
	PROFILE_LIST_COUNT_FIELD,
	PROFILE_LIST_COUNT_MAX,
	PROFILE_LIST_COUNT_MIN,
	PROFILE_SHOW_COMPLETED_FIELD,
} from "../enums";

/** Settings → Profile: what the profile tab shows */
export interface ProfilePrefs {
	/** Custom lists shown under Recently Watched (0-10) */
	listCount: number;
	/** The "Movies Watched" / "TV Shows Completed" rows */
	showCompleted: boolean;
}

export const DEFAULT_PROFILE_PREFS: ProfilePrefs = {
	listCount: PROFILE_LIST_COUNT,
	showCompleted: true,
};

/** A whole number inside the allowed range; anything that isn't a number -> the default */
export function clampListCount(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PROFILE_PREFS.listCount;
	return Math.min(PROFILE_LIST_COUNT_MAX, Math.max(PROFILE_LIST_COUNT_MIN, Math.round(value)));
}

/** AsyncStorage / localStorage key of one account's saved prefs */
export const profilePrefsKey = (uid: string): string => `${CacheKey.PROFILE_PREFS}${uid}`;

/** From the users/{uid} doc data; a missing or malformed field -> its default */
export function prefsFromDoc(data: Record<string, unknown> | undefined | null): ProfilePrefs {
	return {
		listCount: clampListCount(data?.[PROFILE_LIST_COUNT_FIELD]),
		showCompleted: data?.[PROFILE_SHOW_COMPLETED_FIELD] !== false,
	};
}

/** From the saved JSON (see profilePrefsKey); unreadable -> defaults */
export function parseCachedPrefs(raw: string | null): ProfilePrefs {
	if (!raw) return DEFAULT_PROFILE_PREFS;
	try {
		const parsed = JSON.parse(raw) as Partial<ProfilePrefs> | null;
		return {
			listCount: clampListCount(parsed?.listCount),
			showCompleted: parsed?.showCompleted !== false,
		};
	} catch {
		return DEFAULT_PROFILE_PREFS;
	}
}

/** The current prefs with a change applied (the count is clamped) */
export function mergeProfilePrefs(
	current: ProfilePrefs,
	patch: Partial<ProfilePrefs>,
): ProfilePrefs {
	return {
		listCount: patch.listCount === undefined ? current.listCount : clampListCount(patch.listCount),
		showCompleted: patch.showCompleted ?? current.showCompleted,
	};
}

/** The users/{uid} fields to write for a change (only what changed) */
export function profilePrefsDocFields(
	patch: Partial<ProfilePrefs>,
): Record<string, number | boolean> {
	const fields: Record<string, number | boolean> = {};
	if (patch.listCount !== undefined)
		fields[PROFILE_LIST_COUNT_FIELD] = clampListCount(patch.listCount);
	if (patch.showCompleted !== undefined) fields[PROFILE_SHOW_COMPLETED_FIELD] = patch.showCompleted;
	return fields;
}
