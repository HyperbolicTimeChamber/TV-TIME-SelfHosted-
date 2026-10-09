// Web stand-in for @react-native-firebase/analytics. Analytics loads lazily
// and only where supported (not in tests / blocked browsers).
import { getAnalytics as getAnalyticsWeb, isSupported, logEvent as logEventWeb } from "firebase/analytics";
import type { Analytics } from "firebase/analytics";
import { firebaseApp } from "../firebase";

let analytics: Analytics | null = null;
isSupported()
	.then((ok) => {
		if (ok) analytics = getAnalyticsWeb(firebaseApp);
	})
	.catch(() => {});

export const getAnalytics = () => analytics;

export function logEvent(instance: Analytics | null, name: string, params?: Record<string, unknown>) {
	if (instance) logEventWeb(instance, name, params);
}
