/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_FIREBASE_API_KEY: string;
	readonly VITE_FIREBASE_AUTH_DOMAIN: string;
	readonly VITE_FIREBASE_PROJECT_ID: string;
	readonly VITE_FIREBASE_STORAGE_BUCKET: string;
	readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
	readonly VITE_FIREBASE_APP_ID: string;
	readonly VITE_FIREBASE_MEASUREMENT_ID: string;
	readonly VITE_WEB_BASE_URL: string;
	readonly VITE_TMDB_API_BASE: string;
	readonly VITE_TMDB_PROXY_BASE: string;
	/** reCAPTCHA v3 site key registered with Firebase App Check (optional) */
	readonly VITE_RECAPTCHA_SITE_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// Shared app code reads EXPO_PUBLIC_* via process.env (replaced by Vite `define`)
declare const process: { env: Record<string, string | undefined> };
