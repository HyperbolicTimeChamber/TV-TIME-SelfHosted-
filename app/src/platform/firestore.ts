// Every "@react-native-firebase/firestore" import in app code resolves here (metro.config.js),
// so reads / writes / deletes are counted for Mixpanel and tracking writes are stamped for the
// delta sync (stampTrackingWrites) without touching call sites. This
// file's own import below is the one that reaches the real package.
import * as firestore from "@react-native-firebase/firestore";
import { countFirestoreOps } from "../utils/countFirestoreOps";
import { stampTrackingWrites } from "../utils/stampTrackingWrites";

export * from "@react-native-firebase/firestore";

export const {
	getDoc,
	getDocs,
	getDocFromServer,
	getDocsFromServer,
	getCountFromServer,
	onSnapshot,
	setDoc,
	updateDoc,
	addDoc,
	deleteDoc,
	writeBatch,
	runTransaction,
} = countFirestoreOps({ ...firestore, ...stampTrackingWrites(firestore) });
