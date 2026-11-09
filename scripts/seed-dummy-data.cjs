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
const WatchStatus = { WATCHING: "watching", COMPLETED: "completed", REWATCHING: "rewatching" };

// Airing shows fill the calendar / Upcoming; `watched` = seasons marked watched up front,
// `upToDate` = tracking jumps straight to the next unaired episode (long-running dailies whose
// current season never finishes airing)
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
	// Daily (weekday) shows: stack several titles per day so full-view calendar cells overflow
	// into "+n more" chips
	{ title: "The Tonight Show Starring Jimmy Fallon", upToDate: true },
	{ title: "Late Night with Seth Meyers", upToDate: true },
	{ title: "Jimmy Kimmel Live", upToDate: true },
	// (Long-running dailies like The Daily Show / soaps / game shows exceed the 1 MB catalog doc)
	{ title: "The Kelly Clarkson Show", upToDate: true },
	{ title: "Tamron Hall", upToDate: true },
	{ title: "Sherri", upToDate: true },
	// More cards for the watchlist (long lists to scroll, several with a backlog to mark through)
	{ title: "The Bear", watched: 1 },
	{ title: "Abbott Elementary", watched: 1 },
	{ title: "Only Murders in the Building", watched: 1 },
	{ title: "Ted Lasso", watched: 1 },
	{ title: "Stranger Things", watched: 1 },
	{ title: "The Last of Us", watched: 0 },
	{ title: "House of the Dragon", watched: 1 },
	{ title: "Andor", watched: 0 },
	{ title: "Shogun", watched: 0 },
	{ title: "Fallout", watched: 0 },
	{ title: "Brooklyn Nine-Nine", watched: 2 },
	{ title: "Parks and Recreation", watched: 2 },
	{ title: "Friends", watched: 3 },
	{ title: "Community", watched: 1 },
	{ title: "One Piece", watched: 0 },
	{ title: "Jujutsu Kaisen", watched: 1 },
	// Rewatch cards: ended shows watched through (→ completed), then rewatched from the start —
	// `rewatch` = episodes of the rewatch already watched again (the card points past them)
	{ title: "Chernobyl", watched: 1, rewatch: 2 },
	{ title: "The Queen's Gambit", watched: 1, rewatch: 0 },
	{ title: "Fleabag", watched: 2, rewatch: 4 },
	{ title: "Mare of Easttown", watched: 1, rewatch: 1 },
	{ title: "Band of Brothers", watched: 1, rewatch: 3 },
	{ title: "Normal People", watched: 1, rewatch: 5 },
	{ title: "Baby Reindeer", watched: 1, rewatch: 0 },
	{ title: "Sherlock", watched: 4, rewatch: 2 },
	// Releasing soon: `releaseInMin` = the next episode airs that many minutes after seeding
	// (today, exact time in the catalog) — the card appears in "What's Up Next" when it airs
	{ title: "The Graham Norton Show", upToDate: true, releaseInMin: 2 },
	{ title: "The Late Show with Stephen Colbert", upToDate: true, releaseInMin: 3 },
	{ title: "Last Week Tonight with John Oliver", upToDate: true, releaseInMin: 4 },
	{ title: "The View", upToDate: true, releaseInMin: 5 },
	{ title: "Saturday Night Live", upToDate: true, releaseInMin: 3 },
	{ title: "Real Time with Bill Maher", upToDate: true, releaseInMin: 4 },
	{ title: "Jeopardy!", upToDate: true, releaseInMin: 5 },
	{ title: "Wheel of Fortune", upToDate: true, releaseInMin: 6 },
	{ title: "Hot Ones", upToDate: true, releaseInMin: 3 },
	{ title: "Watch What Happens Live with Andy Cohen", upToDate: true, releaseInMin: 4 },
];
const MOVIES = ["Dune: Part Two", "Avengers: Doomsday", "Spider-Man: Beyond the Spider-Verse"];
// Upcoming movies sharing one release date (the busiest upcoming day) → movie "+n more" chip
const SAME_DAY_MOVIES = 6;

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
		try {
			const catalog = await call("addShow", { tmdbId, mediaType });
			if (!existed) added++;
			return catalog;
		} catch (err) {
			// Don't leave a tracking doc without a catalog behind
			if (!existed) await ref.delete();
			console.warn(`  ! addShow failed for ${mediaType} ${tmdbId}: ${err.message.slice(0, 120)}`);
			return null;
		}
	};

	// SEED_ONLY="Friends,Community" → just those titles (a re-run marks seasons again otherwise)
	const only = process.env.SEED_ONLY?.split(",").map((t) => t.trim().toLowerCase());
	for (const { title, watched = 0, upToDate = false, rewatch, releaseInMin } of SHOWS) {
		if (only && !only.includes(title.toLowerCase())) continue;
		const hit = await search(apiKey, "tv", title);
		if (!hit) {
			console.warn(`  ? no TMDB match for "${title}"`);
			continue;
		}
		const catalog = await track(hit.id, MediaType.TV, { title: hit.name, posterPath: hit.poster_path });
		if (!catalog) continue;
		const seasons = (catalog.seasons ?? [])
			.filter((s) => s.seasonNumber > 0)
			.sort((a, b) => a.seasonNumber - b.seasonNumber);
		if (upToDate) {
			const all = seasons.flatMap((s) =>
				(s.episodes ?? []).map((e) => ({ ...e, season: s.seasonNumber })),
			);
			// Releasing soon with nothing announced yet: its latest episode is pulled forward
			const next =
				all.find((e) => e.airDate && e.airDate > today) ??
				(releaseInMin !== undefined ? all[all.length - 1] : undefined);
			if (next && releaseInMin !== undefined) {
				// Pull that episode forward to today, airing `releaseInMin` minutes from now
				const airAt = new Date(Date.now() + releaseInMin * 60_000);
				const airStamp = airAt.toISOString();
				// The day it airs on this machine's clock (the emulator's, for the app)
				const airDay = airAt.toLocaleDateString("en-CA");
				const showRef = db.doc(`shows/${MediaType.TV}_${hit.id}`);
				const show = (await showRef.get()).data();
				const seasonsOut = (show?.seasons ?? []).map((sn) =>
					sn.seasonNumber !== next.season
						? sn
						: {
								...sn,
								episodes: (sn.episodes ?? []).map((e) =>
									e.episodeNumber === next.episodeNumber ? { ...e, airDate: airDay, airStamp } : e,
								),
							},
				);
				await showRef.update({ seasons: seasonsOut });
				next.airDate = airDay;
			}
			if (next) {
				await userRef.collection("tracking").doc(`${MediaType.TV}_${hit.id}`).update({
					nextEpisode: { season: next.season, episode: next.episodeNumber },
					nextEpisodeName: next.title ?? null,
					nextEpisodeAirDate: next.airDate,
					updatedAt: FieldValue.serverTimestamp(),
				});
			}
			console.log(
				`  tv    ${hit.name} (${hit.id}) — up to date, next ${next?.airDate ?? "none"}` +
					(releaseInMin !== undefined && next ? ` (airs in ${releaseInMin} min)` : ""),
			);
			continue;
		}
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
			try {
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
			} catch (err) {
				console.warn(`  ! markSeasonWatched failed for ${hit.name} S${season.seasonNumber}: ${err.message.slice(0, 100)}`);
				break;
			}
		}
		if (rewatch !== undefined && marked.length === seasons.length && marked.length > 0) {
			// As the app's startRewatch, then `rewatch` episodes of it watched again
			const eps = seasons.flatMap((sn) =>
				(sn.episodes ?? []).map((e) => ({ ...e, season: sn.seasonNumber })),
			);
			const pad = (n) => String(n).padStart(2, "0");
			for (const e of eps.slice(0, rewatch)) {
				await userRef
					.collection("watchedEpisodes")
					.doc(`${hit.id}_S${pad(e.season)}E${pad(e.episodeNumber)}`)
					.set(
						{ watchCount: FieldValue.increment(1), lastWatchedAt: Timestamp.now() },
						{ merge: true },
					);
			}
			const next = eps[rewatch] ?? eps[0];
			await userRef.collection("tracking").doc(`${MediaType.TV}_${hit.id}`).update({
				status: WatchStatus.REWATCHING,
				rewatchCount: FieldValue.increment(1),
				nextEpisode: { season: next.season, episode: next.episodeNumber },
				nextEpisodeName: next.title ?? null,
				nextEpisodeAirDate: next.airDate ?? null,
				lastWatchedAt: Timestamp.now(),
				priorityDate: Timestamp.now(),
				updatedAt: FieldValue.serverTimestamp(),
			});
			console.log(`  tv    ${hit.name} (${hit.id}) — rewatching, at S${next.season}E${next.episodeNumber}`);
			continue;
		}
		console.log(`  tv    ${hit.name} (${hit.id}) — ${marked.length} season(s) watched`);
	}

	for (const title of only ? [] : MOVIES) {
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

	// TMDB releases over the next 6 weeks, grouped by release date; seed the busiest day
	const byDate = new Map();
	const until = new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10);
	for (let page = 1; page <= 3; page++) {
		const q = new URLSearchParams({
			api_key: apiKey,
			page: String(page),
			sort_by: "popularity.desc",
			"primary_release_date.gte": today,
			"primary_release_date.lte": until,
		});
		const { results = [] } = await json(`${TMDB}/discover/movie?${q}`);
		for (const m of results) {
			if (!m.release_date || m.release_date <= today) continue;
			byDate.set(m.release_date, [...(byDate.get(m.release_date) ?? []), m]);
		}
	}
	const busiest = [...byDate.values()].sort((a, b) => b.length - a.length)[0] ?? [];
	// SEED_ONLY runs leave these alone (re-tracking them would undo marks made since)
	for (const hit of only ? [] : busiest.slice(0, SAME_DAY_MOVIES)) {
		await track(hit.id, MediaType.MOVIE, {
			title: hit.title,
			posterPath: hit.poster_path,
			releaseDate: hit.release_date,
			priorityDate: Timestamp.fromDate(new Date(hit.release_date)),
		});
		console.log(`  movie ${hit.title} (${hit.id}) — ${hit.release_date}`);
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
	// New catalog stamp, as syncCatalog sets it → clients rebuild their cached calendar months
	await db.doc("config/app").set({ lastCatalogSync: Timestamp.now() }, { merge: true });
	console.log(`Seeded dummy data for ${uid} (${added} new titles) on the emulators`);
}

main().catch((err) => {
	console.error(err.message ?? err);
	process.exit(1);
});
