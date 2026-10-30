import { CLIENT_PLATFORM } from "../services/mixpanel";

type HttpsCallable = (...args: any[]) => (data?: any, ...rest: any[]) => any;

/**
 * Wraps httpsCallable so every Cloud Function call carries `clientPlatform` (app / web) — the
 * backend reports it as Mixpanel caller_platform. Handlers ignore the extra field.
 */
export function tagCallable<H extends HttpsCallable>(httpsCallable: H): H {
	return ((...args: Parameters<H>) => {
		const callable = httpsCallable(...args);
		return (data?: unknown, ...rest: unknown[]) =>
			callable({ ...(data as object | undefined), clientPlatform: CLIENT_PLATFORM }, ...rest);
	}) as H;
}
