import { useSyncExternalStore } from "react";

/** Bumps each time the palette changes (applyThemePrefs): the key that makes themed styles rebuild */
let version = 0;
const listeners = new Set<() => void>();

export const getThemeVersion = (): number => version;

export function bumpThemeVersion(): void {
	version += 1;
	listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

/** Re-renders the caller when the theme changes */
export function useThemeVersion(): number {
	return useSyncExternalStore(subscribe, getThemeVersion);
}
