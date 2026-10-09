import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore, doc, updateDoc, getDoc } from "@react-native-firebase/firestore";
import { CacheKey } from "../types";

/**
 * Check if the unreleased movie modal should be shown.
 * Reads from AsyncStorage first (cache), falls back to Firestore.
 */
export async function shouldShowUnreleasedModal(userId: string): Promise<boolean> {
	// Check cache first
	const cached = await AsyncStorage.getItem(CacheKey.HIDE_UNRELEASED_MODAL);
	if (cached === "true") return false;

	// Fallback to Firestore
	try {
		const db = getFirestore();
		const userDoc = await getDoc(doc(db, "users", userId));
		const hide = userDoc.data()?.hideUnreleasedMovieModal === true;
		if (hide) {
			await AsyncStorage.setItem(CacheKey.HIDE_UNRELEASED_MODAL, "true");
			return false;
		}
	} catch {}

	return true;
}

/** "Don't show this again" — cache locally + persist on the user doc */
export async function hideUnreleasedModal(userId: string): Promise<void> {
	await AsyncStorage.setItem(CacheKey.HIDE_UNRELEASED_MODAL, "true");
	updateDoc(doc(getFirestore(), "users", userId), {
		hideUnreleasedMovieModal: true,
	}).catch(() => {});
}
