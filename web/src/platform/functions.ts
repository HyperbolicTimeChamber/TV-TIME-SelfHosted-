// Web stand-in for @react-native-firebase/functions
import {
	getFunctions as getFunctionsWeb,
	httpsCallable as httpsCallableWeb,
} from "firebase/functions";
import { tagCallable } from "@app/utils/tagCallable";
import { firebaseApp } from "../firebase";

// Callable requests carry clientPlatform for the backend's Mixpanel reports
export const httpsCallable = tagCallable(httpsCallableWeb);

export const getFunctions = () => getFunctionsWeb(firebaseApp);
