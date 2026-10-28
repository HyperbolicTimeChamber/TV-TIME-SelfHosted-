// Web stand-in for @react-native-firebase/crashlytics: no crash reporting on web
export const getCrashlytics = () => null;

export function recordError(_crashlytics: unknown, error: Error, _jsErrorName?: string) {
	console.error(error);
}

export function log(_crashlytics: unknown, _message: string) {}
