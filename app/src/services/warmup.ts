import { getFirestore, doc, setDoc, serverTimestamp } from "@react-native-firebase/firestore";

/** CF idle timeout — 15 minutes */
const CF_IDLE_MS = 15 * 60 * 1000;

/** Warm Firestore write channel with a lightweight user doc update */
let lastWriteWarmup = 0;
export function warmupFirestoreWrite(userId: string) {
	const now = Date.now();
	if (now - lastWriteWarmup < CF_IDLE_MS) return;
	lastWriteWarmup = now;
	const db = getFirestore();
	setDoc(doc(db, "users", userId), { lastAppOpen: serverTimestamp() }, { merge: true }).catch(
		() => {},
	);
}
