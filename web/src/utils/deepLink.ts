import { useEffect, useState } from "react";
import { ANDROID_APP_PACKAGE, LATEST_RELEASE_API, LATEST_RELEASE_PAGE, MediaType } from "@app/enums";

/**
 * "Open in app" on Android: an intent link — the installed app opens at the title; without it
 * Chrome goes to `fallback` (the latest APK, so the tap downloads the app)
 */
export const appIntentLink = (mediaType: MediaType, tmdbId: number, fallback: string) =>
	`intent://show/${mediaType === MediaType.MOVIE ? "movie" : "tv"}/${tmdbId}#Intent;scheme=watchloom;` +
	`package=${ANDROID_APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;

/** The app ships on Android only — no iOS build to open */
export const isAndroidBrowser = () =>
	typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

const LATEST_APK_KEY = "latest_apk_v1";
const LATEST_APK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The newest production APK's download address (GitHub's latest release), looked up once a day
 * per browser; the release page until it's known
 */
export function useLatestApkUrl(enabled: boolean): string {
	const [url, setUrl] = useState<string>(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(LATEST_APK_KEY) ?? "null") as { url: string; at: number } | null;
			if (saved && Date.now() - saved.at < LATEST_APK_TTL_MS) return saved.url;
		} catch {}
		return LATEST_RELEASE_PAGE;
	});
	useEffect(() => {
		if (!enabled || url !== LATEST_RELEASE_PAGE) return;
		let alive = true;
		fetch(LATEST_RELEASE_API)
			.then((res) => (res.ok ? res.json() : null))
			.then((release: { assets?: { name: string; browser_download_url: string }[] } | null) => {
				const apk = release?.assets?.find((a) => a.name.endsWith(".apk"))?.browser_download_url;
				if (!apk || !alive) return;
				setUrl(apk);
				try {
					localStorage.setItem(LATEST_APK_KEY, JSON.stringify({ url: apk, at: Date.now() }));
				} catch {}
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [enabled, url]);
	return url;
}
