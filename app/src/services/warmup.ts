import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction } from "../enums";
import { getFirestore, doc, setDoc, serverTimestamp } from "@react-native-firebase/firestore";

const functions = getFunctions();

/** CF idle timeout — 15 minutes */
const CF_IDLE_MS = 15 * 60 * 1000;

/** Track last warmup time per CF */
const lastWarmedAt = new Map<string, number>();

function warmup(name: string) {
	const now = Date.now();
	const last = lastWarmedAt.get(name) ?? 0;
	if (now - last < CF_IDLE_MS) return;
	lastWarmedAt.set(name, now);
	httpsCallable(functions, name)({ warmup: true }).catch(() => {});
}

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

/** Warm CFs used on Watchlist: removeShow (stop watching) */
export function warmupWatchlistCFs() {
	warmup(CloudFunction.REMOVE_SHOW);
}

/** Warm CFs used on Search/ShowDetail: add, remove */
export function warmupSearchCFs() {
	warmup(CloudFunction.ADD_SHOW);
	warmup(CloudFunction.REMOVE_SHOW);
}

/** Warm CFs used on ShowDetail seasons: markSeasonWatched */
export function warmupShowDetailCFs() {
	warmup(CloudFunction.MARK_SEASON_WATCHED);
}

/** Warm CFs used on Import screen */
export function warmupImportCFs() {
	warmup(CloudFunction.IMPORT_MATCHES);
}
