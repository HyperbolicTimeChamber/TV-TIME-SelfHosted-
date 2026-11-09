import { CLIENT_PLATFORM } from "../services/mixpanel";
import { ClientPlatform, UPDATE_CHANNEL } from "../enums";
import { APP_BUILD } from "./appVersion";

/** The app also says which build of which channel is calling: callables refuse builds below the
 *  channel's minimum (force update — functions hooks/appVersionGate) */
const BUILD_FIELDS =
	CLIENT_PLATFORM === ClientPlatform.APP ? { appBuild: APP_BUILD, releaseChannel: UPDATE_CHANNEL } : {};

type HttpsCallable = (...args: any[]) => (data?: any, ...rest: any[]) => any;

/**
 * Wraps httpsCallable so every Cloud Function call carries `clientPlatform` (app / web) — the
 * backend reports it as Mixpanel caller_platform. Handlers ignore the extra field.
 */
export function tagCallable<H extends HttpsCallable>(httpsCallable: H): H {
	return ((...args: Parameters<H>) => {
		const callable = httpsCallable(...args);
		return (data?: unknown, ...rest: unknown[]) =>
			callable({ ...(data as object | undefined), clientPlatform: CLIENT_PLATFORM, ...BUILD_FIELDS }, ...rest);
	}) as H;
}
