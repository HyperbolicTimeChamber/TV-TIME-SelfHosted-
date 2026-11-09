import { doc, getDoc, getFirestore } from "@react-native-firebase/firestore";
import { getMessaging, subscribeToTopic } from "@react-native-firebase/messaging";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";
import UpdateNotification from "../../modules/update-notification";
import { APP_UPDATE_MESSAGE, RELEASE_CONFIG_DOC, UPDATE_CHANNEL, UPDATE_TOPIC } from "../enums";
import { INSTALLED_BUILD, UPDATES_SUPPORTED, discardStaleDownload, type ChannelRelease } from "./appUpdate";

/**
 * New version out: the app's own notification (native module, custom layouts in the app's theme)
 * — "V x.y.z is available" with a red Install. Install downloads in the background (a dark card
 * with a red progress bar and Cancel), then "Tap to install" opens Android's installer — all
 * native, so it works with the app closed
 */
export async function showUpdateNotification(release: ChannelRelease): Promise<void> {
	if (!UPDATES_SUPPORTED || release.build <= INSTALLED_BUILD) return;
	discardStaleDownload(release.build);
	UpdateNotification?.showOffer(release.version, release.notes ?? "", release.apkUrl, release.size ?? 0);
}

/** config/release entry for this channel — read when a push arrives (one doc) */
async function readRelease(): Promise<ChannelRelease | null> {
	if (!UPDATE_CHANNEL) return null;
	const snap = await getDoc(doc(getFirestore(), ...RELEASE_CONFIG_DOC)).catch(() => null);
	const entry = snap?.exists() ? (snap.data()?.[UPDATE_CHANNEL] as ChannelRelease | undefined) : undefined;
	return entry?.apkUrl ? entry : null;
}

/**
 * A new-version push (FCM data message from CI): show the offer. A test push (functions
 * sendTestPush, from a PC) carries its release and shows even when this build is that one
 */
export async function handleUpdateMessage(message: FirebaseMessagingTypes.RemoteMessage): Promise<boolean> {
	const data = message.data;
	if (data?.type !== APP_UPDATE_MESSAGE) return false;
	// Each build only takes its own channel's releases (a staging APK must never be offered to a
	// production install, or the other way round)
	if (data.channel && data.channel !== UPDATE_CHANNEL) return true;
	if (data.test === "1" && typeof data.apkUrl === "string") {
		UpdateNotification?.showOffer(
			String(data.version ?? ""),
			String(data.notes ?? ""),
			data.apkUrl,
			Number(data.size) || 0,
		);
		return true;
	}
	const release = await readRelease();
	if (release) await showUpdateNotification(release);
	return true;
}

/** Joins this channel's new-version topic (after notification permission is granted) */
export async function subscribeToUpdates(): Promise<void> {
	if (!UPDATES_SUPPORTED || !UPDATE_CHANNEL) return;
	await subscribeToTopic(getMessaging(), UPDATE_TOPIC[UPDATE_CHANNEL]).catch(() => {});
}
