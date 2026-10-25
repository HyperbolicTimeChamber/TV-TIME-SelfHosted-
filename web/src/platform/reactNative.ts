// Minimal react-native surface used by shared app logic
import { notify } from "./notify";

export const PixelRatio = {
	get: () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1),
};

export const Platform = {
	OS: "web" as string,
	select: <T>(o: { web?: T; default?: T }) => o.web ?? o.default,
};

export const Alert = {
	alert: (title: string, message?: string) => notify(title, message),
};
