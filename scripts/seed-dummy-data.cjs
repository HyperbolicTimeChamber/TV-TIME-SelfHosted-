#!/usr/bin/env node
// Fill an Emulator Suite account with dummy tracking data (airing + ended shows, movies, some
// watch progress) through the same path the app uses: tracking doc write, then the real
// addShow / markSeasonWatched / rebuildUpcoming callables on the functions emulator.
// Needs: `npm run emulators` running and `npm run emulators:seed` done (TMDB key in config/app).
// Usage: node scripts/seed-dummy-data.cjs [uid]   (default: first user in the Auth emulator)
const path = require("path");
const { createRequire } = require("module");

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FUNCTIONS = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;

const root = path.join(__dirname, "..");
const PROJECT = JSON.parse(require("fs").readFileSync(path.join(root, ".firebaserc"), "utf8")).projects.default;
const fnRequire = createRequire(path.join(root, "functions/package.json"));
const { initializeApp } = fnRequire("firebase-admin/app");
const { getAuth } = fnRequire("firebase-admin/auth");
const { getFirestore, Timestamp, FieldValue } = fnRequire("firebase-admin/firestore");

const TMDB = "https://api.themoviedb.org/3";
// Mirrors of functions/src/shared/enums.ts (plain JS can't import the TS enums)
const MediaType = { TV: "tv", MOVIE: "movie" };
const WatchStatus = { WATCHING: "watching", COMPLETED: "completed" };

// Airing shows fill the calendar / Upcoming; `watched` = seasons marked watched up front
const SHOWS = [
	{ title: "The Simpsons", watched: 0 },
	{ title: "Percy Jackson and the Olympians", watched: 1 },
	{ title: "The Lord of the Rings: The Rings of Power", watched: 2 },
	{ title: "Reincarnated as a Sword", watched: 1 },
	{ title: "The Iceblade Sorcerer Shall Rule the World", watched: 1 },
	{ title: "Black Clover", watched: 0 },
	{ title: "Georgie & Mandy's First Marriage", watched: 1 },
	{ title: "Severance", watched: 1 },
	{ title: "Breaking Bad", watched: 3 },
	{ title: "The Office", watched: 0 },
];
const MOVIES = ["Dune: Part Two", "Avengers: Doomsday", "Spider-Man: Beyond the Spider-Verse"];

async function json(url, init) {
	const res = await fetch(url, init);
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(body).slice(0, 300)}`);
	return body;
}

async function idTokenFor(uid) {
	// Auth emulator accepts the unsigned custom tokens the Admin SDK makes against it
	const token = await getAuth().createCustomToken(uid);
	const res = await json(
		`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, returnSecureToken: true }),
		},
	);
	return res.idToken;
}

function callable(idToken) {
	return async (name, data) =>
		(
			await json(`http://${FUNCTIONS}/${PROJECT}/us-central1/${name}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
				body: JSON.stringify({ data }),
			})
		).result;
}

async function search(apiKey, kind, title) {
	const q = new URLSearchParams({ api_key: apiKey, query: title });
	const { results } = await json(`${TMDB}/search/${kind}?${q}`);
	return results?.[0] ?? null;
}

async function main() {
	initializeApp({ projectId: PROJECT });
	const db = getFirestore();

	let uid = process.argv[2];
	if (!uid) {
		const { users } = await getAuth().listUsers(1);
		if (!users.length) throw new Error("No users in the Auth emulator — sign in once in the app");
		uid = users[0].uid;
	}
	const apiKey = (await db.doc("config/app").get()).get("tmdbApiKey");
	if (!apiKey) throw new Error("config/app.tmdbApiKey missing — run `npm run emulators:seed`");

	const call = callable(await idTokenFor(uid));
	const userRef = db.doc(`users/${uid}`);
	const today = new Date().toISOString().slice(0, 10);
	let added = 0;

	const track = async (tmdbId, mediaType, fields) => {
		const ref = userRef.collection("tracking").doc(`${mediaType}_${tmdbId}`);
		const existed = (await ref.get()).exists;
		const now = Timestamp.now();
		await ref.set({
			tmdbId,
			mediaType,
			status: WatchStatus.WATCHING,
			nextEpisode: mediaType === MediaType.TV ? { season: 1, episode: 1 } : null,
			nextEpisodeName: null,
			nextEpisodeAirDate: null,
			rewatchCount: 0,
			addedAt: now,
			lastWatchedAt: now,
			priorityDate: now,
			...fields,
		});
		if (!existed) added++;
		return call("addShow", { tmdbId, mediaType });
	};

	for (const { title, watched } of SHOWS) {
		const hit = await search(apiKey, "tv", title);
		if (!hit) {
			console.warn(`  ? no TMDB match for "${title}"`);
			continue;
		}
		const catalog = await track(hit.id, MediaType.TV, { title: hit.name, posterPath: hit.poster_path });
		const seasons = (catalog.seasons ?? [])
			.filter((s) => s.seasonNumber > 0)
			.sort((a, b) => a.seasonNumber - b.seasonNumber);
		// Mark whole aired seasons; tracking then points at the next episode
		const marked = [];
		for (const season of seasons.slice(0, watched)) {
			const aired = (season.episodes ?? []).filter((e) => e.airDate && e.airDate <= today);
			if (aired.length === 0 || aired.length !== season.episodes.length) break;
			marked.push(season);
		}
		for (const [i, season] of marked.entries()) {
			const next = seasons[seasons.indexOf(season) + 1]?.episodes?.[0];
			const last = i === marked.length - 1;
			await call("markSeasonWatched", {
				tmdbId: hit.id,
				seasonNumber: season.seasonNumber,
				episodes: season.episodes.slice(0, 100).map((e) => ({
					episodeNumber: e.episodeNumber,
					name: e.title ?? "",
					runtime: e.runtime ?? 0,
				})),
				nextEpisode: next ? { season: season.seasonNumber + 1, episode: next.episodeNumber } : null,
				nextEpisodeName: next?.title ?? null,
				nextEpisodeAirDate: next?.airDate ?? null,
				isShowComplete: last && !next,
				...(last && !next ? { status: WatchStatus.COMPLETED } : {}),
			});
		}
		console.log(`  tv    ${hit.name} (${hit.id}) — ${marked.length} season(s) watched`);
	}

	for (const title of MOVIES) {
		const hit = await search(apiKey, "movie", title);
		if (!hit) {
			console.warn(`  ? no TMDB match for "${title}"`);
			continue;
		}
		const releaseDate = hit.release_date || null;
		const future = releaseDate && releaseDate > today;
		await track(hit.id, MediaType.MOVIE, {
			title: hit.title,
			posterPath: hit.poster_path,
			releaseDate,
			...(future ? { priorityDate: Timestamp.fromDate(new Date(releaseDate)) } : {}),
		});
		console.log(`  movie ${hit.title} (${hit.id}) — ${releaseDate ?? "no date"}`);
	}

	await userRef.set(
		{
			// Seeded account has data → past onboarding
			hasCompletedImport: true,
			...(added ? { stats: { showsTracking: FieldValue.increment(added) } } : {}),
		},
		{ merge: true },
	);
	await call("rebuildUpcoming", {});
	console.log(`Seeded dummy data for ${uid} (${added} new titles) on the emulators`);
}

main().catch((err) => {
	console.error(err.message ?? err);
	process.exit(1);
});
