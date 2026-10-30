// Every "@react-native-firebase/functions" import in app code resolves here (metro.config.js):
// callable requests are tagged with the client platform for the backend's Mixpanel reports
import * as functions from "@react-native-firebase/functions";
import { tagCallable } from "../utils/tagCallable";

export * from "@react-native-firebase/functions";

export const httpsCallable = tagCallable(functions.httpsCallable);
