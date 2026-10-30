// Web stand-in for @react-native-firebase/firestore. RNFirebase's modular API
// mirrors the Firebase JS SDK, so shared app code runs unchanged. Ops are counted
// for Mixpanel (firestore_ops) the same way the app counts them.
import "../firebase";
import * as firestore from "firebase/firestore";
import { countFirestoreOps } from "@app/utils/countFirestoreOps";

export * from "firebase/firestore";

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
