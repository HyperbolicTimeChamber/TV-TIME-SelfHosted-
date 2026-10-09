import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { App as AntApp } from "antd";
import { auth } from "./services/auth";
import { useAppDispatch } from "./store";
import { loadAppConfig, loadUserFlags, userChanged } from "./store/authSlice";
import { setNotifier } from "./platform/notify";

/** Syncs Firebase auth → Redux (same flow as the mobile authStore.setUser) */
export default function AuthListener() {
	const dispatch = useAppDispatch();
	const { notification } = AntApp.useApp();

	useEffect(() => {
		// Alert.alert from shared app code → antd notification
		setNotifier((title, message) => notification.error({ message: title, description: message }));
	}, [notification]);

	useEffect(
		() =>
			onAuthStateChanged(auth, (u) => {
				dispatch(
					userChanged(
						u
							? {
									uid: u.uid,
									email: u.email,
									displayName: u.displayName,
									photoURL: u.photoURL,
									providerData: u.providerData.map((p) => ({ providerId: p.providerId })),
								}
							: null,
					),
				);
				if (u) {
					dispatch(loadAppConfig());
					dispatch(loadUserFlags(u.uid));
				}
			}),
		[dispatch],
	);
	return null;
}
