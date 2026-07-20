import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction } from "../enums";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "@react-native-firebase/firestore";

const functions = getFunctions();
const warmedUp = new Set<string>();

function warmup(name: string) {
  if (warmedUp.has(name)) return;
  warmedUp.add(name);
  httpsCallable(functions, name)({ warmup: true }).catch(() => {});
}

/** Warm Firestore write channel with a lightweight user doc update */
let writeWarmed = false;
export function warmupFirestoreWrite(userId: string) {
  if (writeWarmed) return;
  writeWarmed = true;
  const db = getFirestore();
  setDoc(doc(db, "users", userId), { lastAppOpen: serverTimestamp() }, { merge: true }).catch(() => {});
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
