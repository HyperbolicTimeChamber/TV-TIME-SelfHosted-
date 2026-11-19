import { getThemeVersion } from "./themeStore";

/**
 * A style sheet that follows the theme. `factory` reads the live `colors` and builds the styles
 * (`StyleSheet.create`); they are rebuilt once per theme change, and `styles.x` always resolves to the
 * current build, so a component only has to re-render (the app remounts its tree on a theme change).
 * Use in place of a module-level `StyleSheet.create(...)`.
 */
export function themedStyles<T extends object>(factory: () => T): T {
	let builtFor = -1;
	let built: T | null = null;
	const current = (): T => {
		const version = getThemeVersion();
		if (built === null || builtFor !== version) {
			built = factory();
			builtFor = version;
		}
		return built;
	};
	return new Proxy({} as T, {
		get: (_target, key) => (current() as Record<string | symbol, unknown>)[key],
		has: (_target, key) => key in current(),
		ownKeys: () => Reflect.ownKeys(current()),
		getOwnPropertyDescriptor: (_target, key) => {
			const descriptor = Reflect.getOwnPropertyDescriptor(current(), key);
			return descriptor && { ...descriptor, configurable: true };
		},
	});
}
