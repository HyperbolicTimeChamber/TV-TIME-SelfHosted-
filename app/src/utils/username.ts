/**
 * Username accounts: Firebase Auth needs an email, so a username maps to a
 * synthetic, non-deliverable address. Firebase enforces email uniqueness →
 * usernames are unique (case-insensitive) without an extra Firestore lookup.
 */
// ".invalid" is a reserved TLD (RFC 2606) — no one can ever receive mail here
export const USERNAME_EMAIL_DOMAIN = "users.tvtimerevived.invalid";
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;

export function isEmailIdentifier(id: string): boolean {
	return id.includes("@");
}

export function normalizeUsername(username: string): string {
	return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
	return USERNAME_PATTERN.test(normalizeUsername(username));
}

export function usernameToEmail(username: string): string {
	return `${normalizeUsername(username)}@${USERNAME_EMAIL_DOMAIN}`;
}

/** Synthetic email → username, else null */
export function usernameFromEmail(email: string | null | undefined): string | null {
	if (!email) return null;
	const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
	return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : null;
}
