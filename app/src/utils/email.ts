const EMAIL_PATTERN =
	/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/;

/** Plain ASCII address shape (local@domain.tld) — Sign Up only, so older accounts still log in */
export const isValidEmail = (email: string): boolean => EMAIL_PATTERN.test(email);
