import { CacheKey, DISPLAY_NAME_MAX, PROFILE_NAME_FALLBACK } from "../enums";

/**
 * The name and photo chosen on this device. Nothing here is uploaded: not to Firestore, not to
 * Storage, not to the auth profile.
 */
export interface LocalProfile {
	/** null = the account's own name */
	name: string | null;
	/** null = the account's own photo. App: a file name in the documents folder; web: a data URL */
	photo: string | null;
}

export const EMPTY_LOCAL_PROFILE: LocalProfile = { name: null, photo: null };

export const localProfileKey = (uid: string) => `${CacheKey.LOCAL_PROFILE}${uid}`;

/** What was typed → the name to keep, or null when nothing is left */
export function cleanDisplayName(text: string): string | null {
	const name = text.replace(/\s+/g, " ").trim().slice(0, DISPLAY_NAME_MAX).trim();
	return name || null;
}

export function parseLocalProfile(raw: string | null | undefined): LocalProfile {
	try {
		const data: any = raw ? JSON.parse(raw) : null;
		return {
			name: typeof data?.name === "string" ? cleanDisplayName(data.name) : null,
			photo: typeof data?.photo === "string" && data.photo ? data.photo : null,
		};
	} catch {
		return EMPTY_LOCAL_PROFILE;
	}
}

/** The name shown: this device's, else the account's, else a placeholder */
export const displayNameOf = (local: LocalProfile, account: string | null | undefined) =>
	local.name || account || PROFILE_NAME_FALLBACK;

const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp"];

/** The extension a picked image is saved under */
export function photoExtension(fileName: string | null | undefined, mimeType?: string | null): string {
	const fromName = fileName?.split(".").pop()?.toLowerCase();
	if (fromName && PHOTO_EXTENSIONS.includes(fromName)) return fromName;
	const fromType = mimeType?.split("/").pop()?.toLowerCase();
	return fromType && PHOTO_EXTENSIONS.includes(fromType) ? fromType : "jpg";
}
