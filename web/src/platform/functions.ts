// Web stand-in for @react-native-firebase/functions
import { getFunctions as getFunctionsWeb } from "firebase/functions";
import { firebaseApp } from "../firebase";

export { httpsCallable } from "firebase/functions";

export const getFunctions = () => getFunctionsWeb(firebaseApp);
