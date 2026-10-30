// Every "@react-native-firebase/firestore" import in app code resolves here (metro.config.js),
// so reads / writes / deletes are counted for Mixpanel without touching call sites. This
// file's own import below is the one that reaches the real package.
import * as firestore from "@react-native-firebase/firestore";
import { countFirestoreOps } from "../utils/countFirestoreOps";

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
} = countFirestoreOps(firestore);
