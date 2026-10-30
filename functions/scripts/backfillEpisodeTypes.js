/**
 * One-off: add TMDB's episode_type (finale / mid_season / standard) to catalog docs written
 * before it was stored. Ended / canceled shows never get it from syncCatalog (it only refreshes
 * their status), so their FINALE tags would stay off for good.
 *
 * Only episodeType + isSeasonFinale are patched into the stored episodes — nothing else in the
 * doc changes. Changed docs get refreshedSinceSync, so clients re-read them after the next sync.
 *
 *   npm run build && node scripts/backfillEpisodeTypes.js          # dry run (counts only)
 *   npm run build && node scripts/backfillEpisodeTypes.js --write  # patch Firestore
 *
 * Auth: gcloud application-default credentials (project tv-time-returns).
 */
const admin = require("firebase-admin");
const { startScriptMetrics, finishScriptMetrics } = require("../lib/hooks/metrics");
const axios = require("axios");
const { EpisodeType, MediaType, TMDB_BASE } = require("../lib/shared/enums");

const WRITE = process.argv.includes("--write");
// TMDB allows ~40 req/s; stay well under it
const CONCURRENCY = 4;

admin.initializeApp({ projectId: "tv-time-returns" });
startScriptMetrics("backfillEpisodeTypes");
const db = admin.firestore();

async function pooled(items, limit, fn) {
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) await fn(items[next++]);
	});
	await Promise.all(workers);
}

const needsBackfill = (show) =>
	show.mediaType === MediaType.TV &&
	(show.seasons ?? []).some((s) => (s.episodes ?? []).some((e) => e.episodeType == null));

async function main() {
	const apiKey = (await db.doc("config/app").get()).get("tmdbApiKey");
	if (!apiKey) throw new Error("config/app.tmdbApiKey missing");

	const snap = await db.collection("shows").get();
	const todo = snap.docs.filter((d) => needsBackfill(d.data()));
	console.log(`${snap.size} catalog docs, ${todo.length} TV docs missing episodeType`);
	if (!WRITE) {
		const seasons = todo.reduce((n, d) => n + (d.data().seasons ?? []).length, 0);
		console.log(`dry run — would fetch ${seasons} seasons from TMDB. Re-run with --write`);
		return;
	}

	let patched = 0;
	let finales = 0;
	let failed = 0;
	await pooled(todo, CONCURRENCY, async (docSnap) => {
		const show = docSnap.data();
		try {
			const seasons = [];
			for (const season of show.seasons ?? []) {
				const { data } = await axios.get(`${TMDB_BASE}/tv/${show.tmdbId}/season/${season.seasonNumber}`, {
					params: { api_key: apiKey },
				});
				const types = new Map(data.episodes.map((e) => [e.episode_number, e.episode_type]));
				seasons.push({
					...season,
					episodes: (season.episodes ?? []).map((ep) => {
						const type = types.get(ep.episodeNumber);
						if (type === EpisodeType.FINALE) finales++;
						return {
							...ep,
							...(type ? { episodeType: type } : {}),
							isSeasonFinale: type === EpisodeType.FINALE,
						};
					}),
				});
			}
			await docSnap.ref.update({ seasons, refreshedSinceSync: true });
			patched++;
		} catch (err) {
			failed++;
			console.warn(`${docSnap.id}: ${err.response?.status ?? err.message}`);
		}
		if ((patched + failed) % 50 === 0) console.log(`… ${patched + failed}/${todo.length}`);
	});
	console.log(`patched ${patched}, failed ${failed}, finale episodes found ${finales}`);
}

main()
	.then(() => finishScriptMetrics(true))
	.then(() => process.exit(0))
	.catch(async (err) => {
		console.error(err);
		await finishScriptMetrics(false);
		process.exit(1);
	});
