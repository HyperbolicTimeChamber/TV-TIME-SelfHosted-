import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import { setTmdbProxyHeaders } from "@app/services/tmdb";
import { firebaseApp } from "./firebase";

/**
 * App Check proves requests come from this web app. The guest TMDB proxy
 * verifies the token (and can be set to require it). Off when no site key
 * is configured (local dev / tests).
 */
let appCheck: AppCheck | null = null;

export function initAppCheck() {
	const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
	if (!siteKey || appCheck) return;
	appCheck = initializeAppCheck(firebaseApp, {
		provider: new ReCaptchaV3Provider(siteKey),
		isTokenAutoRefreshEnabled: true,
	});
	setTmdbProxyHeaders(async () => {
		const { token } = await getToken(appCheck!, false);
		return { "X-Firebase-AppCheck": token };
	});
}
