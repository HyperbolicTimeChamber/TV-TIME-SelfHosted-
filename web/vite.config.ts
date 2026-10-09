/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const APP_SRC = path.resolve(import.meta.dirname, "../app/src");
const PLATFORM = path.resolve(import.meta.dirname, "src/platform");

/**
 * The web app reuses the mobile app's platform-neutral logic (hooks, services,
 * utils, types, enums, theme) straight from ../app/src. React Native-only
 * modules are swapped for web shims here, so app changes reach web for free.
 */
const nativeModuleShims: Record<string, string> = {
	"@react-native-firebase/firestore": `${PLATFORM}/firestore.ts`,
	"@react-native-firebase/functions": `${PLATFORM}/functions.ts`,
	"@react-native-firebase/analytics": `${PLATFORM}/analytics.ts`,
	"@react-native-async-storage/async-storage": `${PLATFORM}/asyncStorage.ts`,
	"react-native": `${PLATFORM}/reactNative.ts`,
	"expo-file-system": `${PLATFORM}/expoFileSystem.ts`,
	"sp-react-native-in-app-updates": `${PLATFORM}/inAppUpdates.ts`,
};

/** App files replaced wholesale on web (native-only implementations) */
const appFileOverrides: Record<string, string> = {
	[`${APP_SRC}/stores/index.ts`]: `${PLATFORM}/stores.ts`,
	[`${APP_SRC}/hooks/useForceUpdate.ts`]: `${PLATFORM}/useForceUpdate.ts`,
};

function appOverrides(): Plugin {
	return {
		name: "app-file-overrides",
		enforce: "pre",
		async resolveId(source, importer, options) {
			if (!importer?.startsWith(APP_SRC)) return null;
			const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
			if (!resolved) return null;
			return appFileOverrides[resolved.id] ?? null;
		},
	};
}

// Packages imported by shared app files must resolve from web/node_modules
// (app/node_modules isn't installed in the web CI job, and React must be a singleton)
const SHARED_DEPS = [
	"react",
	"react-dom",
	"@tanstack/react-query",
	"axios",
	"zustand",
	"jszip",
	"papaparse",
];

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, import.meta.dirname, "VITE_");
	return {
		plugins: [appOverrides(), react()],
		resolve: {
			alias: {
				"@app": APP_SRC,
				...nativeModuleShims,
			},
			dedupe: SHARED_DEPS,
		},
		// Shared app code reads EXPO_PUBLIC_* — feed it the web's VITE_* values
		define: {
			"process.env.EXPO_PUBLIC_WEB_BASE_URL": JSON.stringify(env.VITE_WEB_BASE_URL ?? ""),
			"process.env.EXPO_PUBLIC_TMDB_API_BASE": JSON.stringify(env.VITE_TMDB_API_BASE ?? ""),
			"process.env.EXPO_PUBLIC_TMDB_PROXY_BASE": JSON.stringify(env.VITE_TMDB_PROXY_BASE ?? ""),
		},
		server: {
			fs: { allow: [path.resolve(import.meta.dirname, "..")] },
			// Dev: guest TMDB requests go to the deployed proxy
			proxy: { "/api/tmdb": { target: env.VITE_WEB_BASE_URL, changeOrigin: true } },
		},
		test: {
			environment: "jsdom",
			setupFiles: ["./src/test/setup.ts"],
			css: false,
		},
	};
});
